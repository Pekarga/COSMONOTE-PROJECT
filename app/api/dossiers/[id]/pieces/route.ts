import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getDossier, updateDossier } from "@/lib/db";
import { UNSUPPORTED_MESSAGE } from "@/lib/extract";
import { filesFrom, ocrFrom } from "@/lib/files";
import { ajouterPieces } from "@/lib/pieces";
import { processDossier } from "@/lib/process";

export const runtime = "nodejs";

/** Ajoute des pièces au dossier (role=dossier) ou des pièces justificatives (role=justificatif), puis relance l'analyse. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getDossier(id)) return Response.json({ error: "Dossier introuvable." }, { status: 404 });
  const form = await req.formData();
  const role = form.get("role") === "justificatif" ? "justificatif" : "dossier";
  const files = filesFrom(form, "file");
  if (!files.length) return Response.json({ error: "Aucun fichier reçu." }, { status: 400 });
  const refuses = await ajouterPieces(id, files, role, ocrFrom(form));
  if (refuses.length < files.length) {
    updateDossier(id, { status: "processing", step: "Lecture des nouvelles pièces" });
    void processDossier(id);
  }
  return Response.json({ refuses, message: refuses.length ? UNSUPPORTED_MESSAGE : null }, { status: 201 });
}
