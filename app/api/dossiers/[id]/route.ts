import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { deleteDossier, getDossier, listCourriers, listPieces, updateDossier } from "@/lib/db";
import type { Dossier } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const dossier = getDossier(id);
  if (!dossier) return Response.json({ error: "Dossier introuvable." }, { status: 404 });
  const courriers = listCourriers(id).map((c) => ({
    id: c.id,
    objet: c.objet,
    createdAt: c.createdAt,
    status: c.status,
    demo: c.demo,
  }));
  return Response.json({ dossier, pieces: listPieces(id), courriers });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getDossier(id)) return Response.json({ error: "Dossier introuvable." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Partial<Dossier> = {};
  if (typeof body.titre === "string" && body.titre.trim()) patch.titre = body.titre.trim();
  if (typeof body.consignes === "string") patch.consignes = body.consignes;
  if (body.ton === "courtois" || body.ton === "ferme" || body.ton === "bienveillant") patch.ton = body.ton;
  if (body.genre === "courrier" || body.genre === "note") patch.genre = body.genre;
  if (typeof body.signeId === "string" || body.signeId === null) patch.signeId = (body.signeId as string) || null;
  updateDossier(id, patch);
  return Response.json({ dossier: getDossier(id) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  deleteDossier((await params).id);
  return Response.json({ ok: true });
}
