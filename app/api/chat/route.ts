import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { hasClaude } from "@/lib/config";
import { listReadyNotes } from "@/lib/db";
import { demoAnswer } from "@/lib/demo";
import { noteToContext } from "@/lib/format";
import { streamChatWithClaude } from "@/lib/claude";

export const runtime = "nodejs";

type ChatMessage = { role: "user" | "assistant"; content: string };

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const { messages } = (await req.json().catch(() => ({}))) as { messages?: ChatMessage[] };
  const clean = (messages ?? []).filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim(),
  );
  if (!clean.length || clean.at(-1)!.role !== "user") {
    return Response.json({ error: "Pose une question." }, { status: 400 });
  }
  const notes = listReadyNotes();
  const encoder = new TextEncoder();

  if (!hasClaude()) {
    const text = demoAnswer(clean.at(-1)!.content, notes);
    return new Response(text, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const stream = streamChatWithClaude(notes.map(noteToContext).join("\n\n"), clean);
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const final = await stream.finalMessage();
        if (final.stop_reason === "refusal") {
          controller.enqueue(encoder.encode("\n\n(Je ne peux pas répondre à cette demande.)"));
        }
      } catch (err) {
        console.error("[chat]", err);
        controller.enqueue(encoder.encode("\n\n(Une erreur est survenue avec Claude. Vérifie ta clé d'API.)"));
      } finally {
        controller.close();
      }
    },
    cancel() {
      stream.abort();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
