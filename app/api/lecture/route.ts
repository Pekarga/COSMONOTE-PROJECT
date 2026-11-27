import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { prochainsALire } from "@/lib/db";

export const runtime = "nodejs";

/** Les prochains scans et photos dont l'appli doit lire le texte sur l'ordinateur. */
export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json(prochainsALire(10));
}
