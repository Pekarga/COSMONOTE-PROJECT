import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { createCourrier, getDossier, updateDossier } from "@/lib/db";
import { layoutPour, lancerCourrier } from "@/lib/process";
import { aujourdhui } from "@/lib/style";
import type { Dossier } from "@/lib/types";

export const runtime = "nodejs";

/** Crée un projet de réponse avec la mise en page choisie, puis le fait rédiger en tâche de fond. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const dossier = getDossier(id);
  if (!dossier) return Response.json({ error: "Dossier introuvable." }, { status: 404 });
  if (dossier.status === "processing") {
    return Response.json({ error: "L'analyse du dossier est en cours. Patientez quelques secondes." }, { status: 409 });
  }

  // Les réglages envoyés avec la demande sont enregistrés sur le dossier.
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Dossier> = {};
  if (typeof body.consignes === "string") patch.consignes = body.consignes;
  if (body.ton === "courtois" || body.ton === "ferme" || body.ton === "bienveillant") patch.ton = body.ton;
  if (body.genre === "courrier" || body.genre === "note") patch.genre = body.genre;
  if (typeof body.signeId === "string" || body.signeId === null) patch.signeId = (body.signeId as string) || null;
  updateDossier(id, patch);

  const genre = patch.genre ?? dossier.genre;
  const { signe, layout } = layoutPour(patch.signeId !== undefined ? patch.signeId : dossier.signeId, genre);
  const courrierId = createCourrier({
    dossierId: id,
    signeId: layout.signeId,
    genre,
    status: "processing",
    entete: layout.entete,
    enteteDroite: layout.enteteDroite,
    refs: layout.refs,
    lieu: layout.lieu,
    date: layout.dateBlanche ? "" : aujourdhui(),
    // Pour une note, la ligne « NOTE A MONSIEUR LE DIRECTEUR… » vient de la note signée.
    destinataire:
      genre === "note" ? (signe?.genre === "note" && signe.destinataire ? signe.destinataire : "NOTE A\nMONSIEUR LE DIRECTEUR") : "",
    signature: layout.signature,
    pied: layout.pied,
    police: layout.police,
  });
  lancerCourrier(courrierId, id);
  return Response.json({ id: courrierId }, { status: 201 });
}
