import path from "node:path";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anyLogo } from "@/lib/db";
import { sendFile } from "@/lib/files";

export const runtime = "nodejs";

/** Armoiries du bandeau : le logo relevé dans vos courriers signés (celui par défaut en priorité). */
export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const logo = anyLogo();
  if (!logo) return new Response(null, { status: 404 });
  const res = await sendFile(logo, path.basename(logo), logo.endsWith(".png") ? "image/png" : "image/jpeg");
  res.headers.set("Cache-Control", "no-cache");
  return res;
}
