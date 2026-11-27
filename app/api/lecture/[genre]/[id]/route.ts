import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getPiece, getSigne, getSigneFiles, updatePiece, updateSigne } from "@/lib/db";
import { writeOcr } from "@/lib/files";
import { lancerDossier, lancerSigne } from "@/lib/process";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ genre: string; id: string }> };

const ILLISIBLE =
  "Le texte de ce scan n'a pas pu être lu (page pâle, floue ou de travers). Déposez une version plus nette, ou le fichier Word.";

/**
 * Texte d'un scan ou d'une photo, lu par l'appli sur l'ordinateur : { texte } ou { echec: true }.
 * Le courrier signé est ensuite analysé ; le dossier reprend son analyse quand toutes ses pièces sont lues.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { genre, id } = await params;
  const body = (await req.json().catch(() => ({}))) as { texte?: unknown; echec?: unknown };
  const texte = typeof body.texte === "string" ? body.texte.slice(0, 300_000).trim() : "";

  if (genre === "signe") {
    const files = getSigneFiles(id);
    if (!getSigne(id) || !files?.chemin) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
    if (texte.replace(/\s/g, "").length >= 40) {
      await writeOcr(files.chemin, texte);
      updateSigne(id, { status: "processing", error: null });
      lancerSigne(id);
    } else {
      updateSigne(id, { status: "error", error: ILLISIBLE });
    }
    return Response.json({ ok: true });
  }

  if (genre === "piece") {
    const piece = getPiece(id);
    if (!piece) return Response.json({ error: "Pièce introuvable." }, { status: 404 });
    if (texte) {
      await writeOcr(piece.chemin, texte);
      updatePiece(id, { texte, lecture: "" });
    } else {
      updatePiece(id, { lecture: "echec" });
    }
    lancerDossier(piece.dossierId);
    return Response.json({ ok: true });
  }

  return Response.json({ error: "Type inconnu." }, { status: 400 });
}
