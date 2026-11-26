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

function defaultTitle(prefix: string) {
  return `${prefix} du ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`;
}

const IMAGE_EXT: Record<string, string> = { "image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp" };

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const typed = String(form.get("title") ?? "").trim();

  // Document scanné : une ou plusieurs photos de pages.
  const pages = form.getAll("page").filter((p): p is File => p instanceof File && p.size > 0);
  if (pages.length) {
    if (pages.some((p) => !IMAGE_EXT[p.type])) {
      return Response.json({ error: "Les pages doivent être des images JPEG, PNG ou WebP." }, { status: 400 });
    }
    const { id, mediaPath } = createNote({
      title: typed || defaultTitle("Document"),
      kind: "scan",
      sourceName: pages[0].name,
      mediaType: pages[0].type,
      ext: "",
      pages: pages.length,
    });
    for (const [i, page] of pages.entries()) {
      await fs.writeFile(
        path.join(mediaPath, `page-${i + 1}${IMAGE_EXT[page.type]}`),
        Buffer.from(await page.arrayBuffer()),
      );
    }
    void processNote(id);
    return Response.json({ id }, { status: 201 });
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  if (!/^(audio|video)\//.test(file.type) && !/\.(mp3|m4a|wav|ogg|webm|mp4|mov|aac|flac|opus)$/i.test(file.name)) {
    return Response.json({ error: "Ce format n'est pas pris en charge. Envoie un fichier audio ou vidéo." }, { status: 400 });
  }
  const ext = path.extname(file.name) || (file.type.includes("webm") ? ".webm" : ".bin");
  const { id, mediaPath } = createNote({
    title: typed || defaultTitle("Note"),
    kind: file.type.startsWith("video/") ? "video" : "audio",
    sourceName: file.name,
    mediaType: file.type || null,
    ext,
  });
  await fs.writeFile(mediaPath, Buffer.from(await file.arrayBuffer()));
  void processNote(id);
  return Response.json({ id }, { status: 201 });
}
