import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anthropicKey, deepgramKey, transcriptionLanguage } from "@/lib/config";
import { setSetting } from "@/lib/db";

export const runtime = "nodejs";

function mask(key: string | null): string | null {
  return key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null;
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json({
    anthropic: mask(anthropicKey()),
    deepgram: mask(deepgramKey()),
    language: transcriptionLanguage(),
  });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as {
    anthropic?: string;
    deepgram?: string;
    language?: string;
  };
  // Une valeur absente ne change rien ; une chaîne vide efface la clé.
  if (typeof body.anthropic === "string") setSetting("anthropic_api_key", body.anthropic.trim());
  if (typeof body.deepgram === "string") setSetting("deepgram_api_key", body.deepgram.trim());
  if (typeof body.language === "string") setSetting("transcription_language", body.language.trim());
  return Response.json({ ok: true });
}
