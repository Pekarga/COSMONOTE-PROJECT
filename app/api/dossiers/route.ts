import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { createDossier, defaultSigne, deleteDossier, listDossiers, listPieces, updateDossier } from "@/lib/db";
import { UNSUPPORTED_MESSAGE } from "@/lib/extract";
import { filesFrom, frDate, ocrFrom } from "@/lib/files";
import { ajouterPieces } from "@/lib/pieces";
import { processDossier } from "@/lib/process";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json({ dossiers: listDossiers(req.nextUrl.searchParams.get("q") ?? undefined) });
}

/**
 * Nouveau dossier : les fichiers déposés dans la lucarne (« file ») sont les pièces du dossier imputé,
 * les fichiers « justificatif » sont les pièces justificatives. Sans fichier, c'est un courrier libre.
 */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const form = await req.formData();
  const pieces = filesFrom(form, "file");
  const justificatifs = filesFrom(form, "justificatif");
  const libre = form.get("libre") === "1";
  if (!pieces.length && !justificatifs.length && !libre) {
    return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  const titre = String(form.get("titre") ?? "").trim() || (libre ? `Courrier du ${frDate()}` : `Dossier du ${frDate()}`);
  const id = createDossier(titre);
  updateDossier(id, { signeId: defaultSigne()?.id ?? null });
  const ocr = ocrFrom(form);
  const refuses = [
    ...(await ajouterPieces(id, pieces, "dossier", ocr)),
    ...(await ajouterPieces(id, justificatifs, "justificatif", ocr)),
  ];
  if (!libre && !listPieces(id).length) {
    deleteDossier(id);
    return Response.json({ error: UNSUPPORTED_MESSAGE }, { status: 400 });
  }
  if (listPieces(id).length) {
    updateDossier(id, { status: "processing", step: "Lecture des pièces" });
    void processDossier(id);
  }
  return Response.json({ id, refuses, message: refuses.length ? UNSUPPORTED_MESSAGE : null }, { status: 201 });
}
