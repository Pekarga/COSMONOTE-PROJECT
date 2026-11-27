import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anthropicKey } from "@/lib/config";
import { getSetting, setSetting } from "@/lib/db";

export const runtime = "nodejs";

function mask(key: string | null): string | null {
  return key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null;
}

export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  return Response.json({
    anthropic: mask(anthropicKey()),
    nom: getSetting("nom") ?? "",
    fonction: getSetting("fonction") ?? "",
  });
}

export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const body = (await req.json().catch(() => ({}))) as { anthropic?: unknown; nom?: unknown; fonction?: unknown };
  // Une valeur absente ne change rien ; une chaîne vide efface la clé.
  if (typeof body.anthropic === "string") setSetting("anthropic_api_key", body.anthropic.trim());
  if (typeof body.nom === "string") setSetting("nom", body.nom.trim().slice(0, 80));
  if (typeof body.fonction === "string") setSetting("fonction", body.fonction.trim().slice(0, 80));
  return Response.json({ ok: true });
}
