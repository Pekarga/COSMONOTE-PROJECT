import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { deletePiece, getPiece, updateDossier, updatePiece } from "@/lib/db";
import { sendFile } from "@/lib/files";
import { lancerDossier } from "@/lib/process";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** Ouvre le fichier d'une pièce. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const piece = getPiece((await params).id);
  if (!piece) return Response.json({ error: "Pièce introuvable." }, { status: 404 });
  return sendFile(piece.chemin, piece.nom, piece.mime);
}

/** Coche ou décoche « joindre au courrier », ou change la nature de la pièce. */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const piece = getPiece(id);
  if (!piece) return Response.json({ error: "Pièce introuvable." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { joindre?: boolean; role?: string };
  if (typeof body.joindre === "boolean") updatePiece(id, { joindre: body.joindre });
  if (body.role === "dossier" || body.role === "justificatif") updatePiece(id, { role: body.role });
  return Response.json({ ok: true });
}

/** Retire une pièce du dossier, puis relance l'analyse. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const piece = getPiece(id);
  if (!piece) return Response.json({ ok: true });
  deletePiece(id);
  updateDossier(piece.dossierId, { status: "processing", step: "Mise à jour de l'analyse" });
  lancerDossier(piece.dossierId);
  return Response.json({ ok: true });
}
