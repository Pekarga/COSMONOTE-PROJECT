import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getCourrier } from "@/lib/db";
import { retoucher } from "@/lib/process";

export const runtime = "nodejs";

/** Applique une retouche demandée en quelques mots (« ton plus ferme », « plus court »…). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const courrier = getCourrier(id);
  if (!courrier) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const { instruction } = (await req.json().catch(() => ({}))) as { instruction?: string };
  if (!instruction?.trim()) return Response.json({ error: "Indiquez la retouche souhaitée." }, { status: 400 });
  try {
    const info = await retoucher(courrier, instruction.trim());
    return Response.json({ courrier: getCourrier(id), info });
  } catch (err) {
    console.error("[retouche]", err);
    return Response.json({ error: err instanceof Error ? err.message : "La retouche a échoué." }, { status: 500 });
  }
}
