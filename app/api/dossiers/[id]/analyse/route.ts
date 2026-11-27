import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getDossier, updateDossier } from "@/lib/db";
import { lancerDossier } from "@/lib/process";

export const runtime = "nodejs";

/** Relance l'analyse du dossier. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getDossier(id)) return Response.json({ error: "Dossier introuvable." }, { status: 404 });
  updateDossier(id, { status: "processing", step: "Analyse du dossier", error: null });
  lancerDossier(id);
  return Response.json({ ok: true });
}
