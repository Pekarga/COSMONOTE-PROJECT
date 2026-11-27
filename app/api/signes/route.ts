import fs from "node:fs/promises";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { compterSignes, createSigne, listSignes } from "@/lib/db";
import { UNSUPPORTED_MESSAGE, fileKind } from "@/lib/extract";
import { extOf, filesFrom, ocrFrom, writeOcr, writeUpload } from "@/lib/files";
import { lancerSigne } from "@/lib/process";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  const { signes, total } = listSignes({
    q: p.get("q") ?? undefined,
    prets: p.get("prets") === "1",
    limite: Number(p.get("limite") ?? 50),
    decalage: Number(p.get("decalage") ?? 0),
  });
  return Response.json({ signes, total, compteurs: compterSignes() });
}

/** Dépôt de courriers signés : plusieurs fichiers à la fois, ou un texte collé. */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const files = filesFrom(form, "file");
  const texte = String(form.get("texte") ?? "").trim();
  if (!files.length && !texte) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });

  const refuses = files.filter((f) => !fileKind(f.name, f.type));
  if (refuses.length === files.length && !texte) {
    return Response.json({ error: UNSUPPORTED_MESSAGE }, { status: 400 });
  }

  const ocr = ocrFrom(form);
  const ids: string[] = [];
  for (const f of files) {
    if (!fileKind(f.name, f.type)) continue;
    const { id, chemin } = createSigne({ nomFichier: f.name, mime: f.type || null, ext: extOf(f.name) });
    await writeUpload(f, chemin);
    const lu = ocr.get(f.name);
    if (lu) await writeOcr(chemin, lu);
    ids.push(id);
  }
  if (texte) {
    const { id, chemin } = createSigne({ nomFichier: "Texte collé.txt", mime: "text/plain", ext: ".txt" });
    await fs.writeFile(chemin, texte, "utf8");
    ids.push(id);
  }
  // En file d'attente : les centaines de courriers d'un gros dépôt sont lus deux par deux.
  for (const id of ids) lancerSigne(id);
  return Response.json(
    { ids, refuses: refuses.map((f) => f.name), message: refuses.length ? UNSUPPORTED_MESSAGE : null },
    { status: 201 },
  );
}
