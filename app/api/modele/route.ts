import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { infosModele, supprimerModele } from "@/lib/modele";

export const runtime = "nodejs";

/** État du modèle de rédaction installé sur l'ordinateur, et travail en cours. */
export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json(infosModele());
}

/** Supprime le modèle de l'ordinateur ; la rédaction repasse par les formules des courriers signés. */
export async function DELETE(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  try {
    supprimerModele();
  } catch (err) {
    console.error("[modèle] suppression", err);
    return Response.json({ error: "Le modèle n'a pas pu être supprimé. Fermez puis rouvrez Le rédacteur, et réessayez." }, { status: 500 });
  }
  return Response.json(infosModele());
}
