import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { signesParStatut, updateSigne } from "@/lib/db";
import { lancerSigne } from "@/lib/process";

export const runtime = "nodejs";

/** Relit tous les courriers signés restés en erreur (les scans repassent par la lecture sur l'ordinateur). */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const ids = signesParStatut("error");
  for (const id of ids) {
    updateSigne(id, { status: "processing", error: null });
    lancerSigne(id);
  }
  return Response.json({ relus: ids.length });
}
