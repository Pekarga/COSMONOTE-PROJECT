import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anyLogo, getSetting, setSetting, statistiques } from "@/lib/db";
import { DATA_DIR } from "@/lib/paths";
import { infosSauvegarde, sauvegarder } from "@/lib/sauvegarde";

export const runtime = "nodejs";

function etat() {
  const choisies = getSetting("armoiries");
  return {
    nom: getSetting("nom") ?? "",
    fonction: getSetting("fonction") ?? "",
    armoiries: choisies && anyLogo() === choisies ? "choisies" : anyLogo() ? "courriers" : null,
    donnees: { dossier: DATA_DIR, ...statistiques() },
    sauvegarde: infosSauvegarde(),
  };
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json(etat());
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { nom?: unknown; fonction?: unknown; sauvegarder?: unknown };
  if (typeof body.nom === "string") setSetting("nom", body.nom.trim().slice(0, 80));
  if (typeof body.fonction === "string") setSetting("fonction", body.fonction.trim().slice(0, 80));
  if (body.sauvegarder === true) {
    try {
      sauvegarder();
    } catch (err) {
      console.error("[sauvegarde]", err);
      return Response.json({ error: "La sauvegarde a échoué." }, { status: 500 });
    }
  }
  return Response.json(etat());
}
