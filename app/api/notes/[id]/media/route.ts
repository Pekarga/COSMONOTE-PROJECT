import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getMediaPath } from "@/lib/db";

export const runtime = "nodejs";

/** Sert le fichier d'origine, avec prise en charge des plages (lecture et avance dans l'audio). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const found = getMediaPath((await params).id);
  if (!found || !fs.existsSync(found.path)) return new Response("Introuvable", { status: 404 });
  const media = { ...found };
  if (fs.statSync(media.path).isDirectory()) {
    // Document scanné : une image par page.
    const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
    const file = fs.readdirSync(media.path).find((f) => f.startsWith(`page-${page}.`));
    if (!file) return new Response("Introuvable", { status: 404 });
    media.path = path.join(media.path, file);
    const ext = path.extname(file).slice(1);
    media.type = `image/${ext === "jpg" ? "jpeg" : ext}`;
  }
  const size = fs.statSync(media.path).size;
  const type = media.type || "application/octet-stream";
  const range = req.headers.get("range")?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(fs.createReadStream(media.path, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        "Content-Type": type,
        "Content-Length": String(end - start + 1),
        "Content-Range": `bytes ${start}-${end}/${size}`,
        "Accept-Ranges": "bytes",
      },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(media.path)) as ReadableStream;
  return new Response(stream, {
    headers: { "Content-Type": type, "Content-Length": String(size), "Accept-Ranges": "bytes" },
  });
}
