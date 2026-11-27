import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anyLogo, getSetting, setSetting } from "@/lib/db";
import { sendFile } from "@/lib/files";
import { FILES_DIR } from "@/lib/paths";

export const runtime = "nodejs";

/** Armoiries du bandeau : celles choisies dans les Paramètres, sinon le logo relevé dans vos courriers Word. */
export async function GET(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const logo = anyLogo();
  if (!logo) return new Response(null, { status: 404 });
  const res = await sendFile(logo, path.basename(logo), logo.endsWith(".png") ? "image/png" : "image/jpeg");
  res.headers.set("Cache-Control", "no-cache");
  return res;
}

/** Enregistre les armoiries choisies (image PNG préparée par la page Paramètres). */
export async function POST(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || !/^image\/(png|jpeg)$/.test(file.type)) {
    return Response.json({ error: "Choisissez une image PNG ou JPEG." }, { status: 400 });
  }
  if (file.size > 8_000_000) return Response.json({ error: "Image trop lourde (8 Mo au plus)." }, { status: 400 });
  await fs.mkdir(FILES_DIR, { recursive: true });
  const cible = path.join(FILES_DIR, `armoiries${file.type === "image/png" ? ".png" : ".jpg"}`);
  await fs.writeFile(cible, Buffer.from(await file.arrayBuffer()));
  setSetting("armoiries", cible);
  return Response.json({ ok: true });
}

/** Retire les armoiries choisies (le logo des courriers Word reprend sa place s'il existe). */
export async function DELETE(req: NextRequest) {
  const denied = await guard(req);
  if (denied) return denied;
  const choisies = getSetting("armoiries");
  setSetting("armoiries", "");
  if (choisies) await fs.rm(choisies, { force: true });
  return Response.json({ ok: true });
}
