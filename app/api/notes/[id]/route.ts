import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { deleteNote, getNote, updateNote } from "@/lib/db";
import { processNote } from "@/lib/process";
import type { Note } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const note = getNote((await params).id);
  return note ? Response.json({ note }) : Response.json({ error: "Note introuvable" }, { status: 404 });
}

const EDITABLE = ["title", "essentiel", "resume", "questions", "actions", "speakers", "tags"] as const;

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  if (!getNote(id)) return Response.json({ error: "Note introuvable" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Partial<Note> & { retry?: boolean };
  if (body.retry) {
    updateNote(id, { status: "processing", step: "Nouvelle tentative", error: null });
    void processNote(id);
  }
  const patch: Partial<Note> = {};
  for (const key of EDITABLE) {
    if (key in body) (patch as Record<string, unknown>)[key] = body[key];
  }
  updateNote(id, patch);
  return Response.json({ note: getNote(id) });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  deleteNote((await params).id);
  return new Response(null, { status: 204 });
}
