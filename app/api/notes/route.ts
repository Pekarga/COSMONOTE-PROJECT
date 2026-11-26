import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { createNote, listNotes } from "@/lib/db";
import { processNote } from "@/lib/process";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json({ notes: listNotes(req.nextUrl.searchParams.get("q") ?? undefined) });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|webm|mp4|mov|aac|flac|opus)$/i.test(file.name)) {
    return Response.json({ error: "Ce format n'est pas pris en charge. Envoie un fichier audio ou vidéo." }, { status: 400 });
  }
  const typed = String(form.get("title") ?? "").trim();
  const title =
    typed ||
    `Note du ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
  const ext = path.extname(file.name) || (file.type.includes("webm") ? ".webm" : ".bin");
  const { id, mediaPath } = createNote({
    title,
    sourceName: file.name,
    mediaType: file.type || null,
    ext,
  });
  await fs.writeFile(mediaPath, Buffer.from(await file.arrayBuffer()));
  void processNote(id);
  return Response.json({ id }, { status: 201 });
}
