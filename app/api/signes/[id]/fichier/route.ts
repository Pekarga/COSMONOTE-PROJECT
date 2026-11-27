import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getSigne, getSigneFiles } from "@/lib/db";
import { sendFile } from "@/lib/files";

export const runtime = "nodejs";

/** Le fichier d'origine du courrier signé. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const signe = getSigne(id);
  const files = getSigneFiles(id);
  if (!signe || !files?.chemin) return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  return sendFile(files.chemin, signe.nomFichier, files.mime);
}
