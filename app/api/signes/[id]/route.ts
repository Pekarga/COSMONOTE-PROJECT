import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { deleteSigne, getSigne, setDefaultSigne, updateSigne } from "@/lib/db";
import { processSigne } from "@/lib/process";
import type { Signe } from "@/lib/types";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const EDITABLE = [
  "type",
  "objet",
  "resume",
  "entete",
  "enteteDroite",
  "refs",
  "lieu",
  "destinataire",
  "appel",
  "politesse",
  "signature",
  "ampliation",
  "pied",
  "style",
  "texte",
  "police",
] as const;

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const signe = getSigne((await params).id);
  if (!signe) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  return Response.json({ signe });
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getSigne(id)) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.defaut === true) setDefaultSigne(id);
  if (body.relire === true) {
    updateSigne(id, { status: "processing", error: null });
    void processSigne(id);
  }
  const patch: Partial<Signe> = {};
  for (const k of EDITABLE) if (typeof body[k] === "string") (patch as Record<string, string>)[k] = body[k] as string;
  if (body.genre === "courrier" || body.genre === "note") patch.genre = body.genre;
  if (typeof body.dateBlanche === "boolean") patch.dateBlanche = body.dateBlanche;
  updateSigne(id, patch);
  return Response.json({ signe: getSigne(id) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  deleteSigne((await params).id);
  return Response.json({ ok: true });
}
