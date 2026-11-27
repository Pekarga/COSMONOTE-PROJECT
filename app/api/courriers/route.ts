import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { listAllCourriers } from "@/lib/db";

export const runtime = "nodejs";

/** Historique : tous les projets rédigés, avec recherche. */
export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const p = req.nextUrl.searchParams;
  const { courriers: liste, total } = listAllCourriers(p.get("q") ?? "", {
    limite: Number(p.get("limite") ?? 100),
    decalage: Number(p.get("decalage") ?? 0),
  });
  const courriers = liste.map((c) => ({
    id: c.id,
    dossierId: c.dossierId,
    dossierTitre: c.dossierTitre,
    genre: c.genre,
    objet: c.objet,
    destinataire: c.destinataire,
    status: c.status,
    demo: c.demo,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  }));
  return Response.json({ courriers, total });
}
