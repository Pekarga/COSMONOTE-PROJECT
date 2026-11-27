import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anyLogo, deleteCourrier, getCourrier, getSigne, updateCourrier } from "@/lib/db";
import { travailEnCours } from "@/lib/modele";
import { formeValide } from "@/lib/style";
import type { Courrier } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const EDITABLE = [
  "entete",
  "enteteDroite",
  "refs",
  "lieu",
  "date",
  "vref",
  "destinataire",
  "objet",
  "pj",
  "appel",
  "corps",
  "politesse",
  "signature",
  "ampliation",
  "pied",
  "police",
] as const;

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const courrier = getCourrier((await params).id);
  if (!courrier) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const signe = courrier.signeId ? getSigne(courrier.signeId) : null;
  // Rédaction par le modèle installé sur l'ordinateur : avancement, ou attente d'un autre travail.
  const travail = courrier.status === "processing" ? travailEnCours() : null;
  return Response.json({
    courrier,
    travail: travail ? { ...travail, ceCourrier: travail.cle === `courrier:${courrier.id}` } : null,
    images: { logo: Boolean(signe?.hasLogo), logoCommun: Boolean(anyLogo()), signature: Boolean(signe?.hasSignatureImg) },
  });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getCourrier(id)) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Courrier> = {};
  for (const k of EDITABLE) if (typeof body[k] === "string") (patch as Record<string, string>)[k] = body[k] as string;
  if (Array.isArray(body.remarques)) patch.remarques = body.remarques.map(String);
  if (body.forme && typeof body.forme === "object") patch.forme = formeValide(body.forme);
  if (body.signeId === null || (typeof body.signeId === "string" && getSigne(body.signeId))) patch.signeId = body.signeId as string | null;
  updateCourrier(id, patch);
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  deleteCourrier((await params).id);
  return Response.json({ ok: true });
}
