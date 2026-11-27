import fs from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { getSigneFiles, updateSigne } from "@/lib/db";
import { imageSize } from "@/lib/extract";
import { sendFile } from "@/lib/files";
import { FILES_DIR } from "@/lib/paths";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

function kindOf(req: NextRequest): "logo" | "signature" {
  return req.nextUrl.searchParams.get("kind") === "signature" ? "signature" : "logo";
}

/** Logo ou signature scannée d'un courrier signé (image PNG ou JPEG). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const files = getSigneFiles((await params).id);
  const p = kindOf(req) === "logo" ? files?.logo : files?.signatureImg;
  if (!p) return Response.json({ error: "Aucune image." }, { status: 404 });
  return sendFile(p, path.basename(p), p.endsWith(".png") ? "image/png" : "image/jpeg");
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const files = getSigneFiles(id);
  if (!files) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Aucune image reçue." }, { status: 400 });
  const data = Buffer.from(await file.arrayBuffer());
  const size = imageSize(data);
  if (!size) return Response.json({ error: "L'image doit être au format PNG ou JPEG." }, { status: 400 });
  const kind = kindOf(req);
  const dir = path.join(FILES_DIR, "images");
  await fs.mkdir(dir, { recursive: true });
  const dest = path.join(dir, `${id}-${kind}-${Date.now()}.${size.type}`);
  await fs.writeFile(dest, data);
  const old = kind === "logo" ? files.logo : files.signatureImg;
  if (old) await fs.rm(old, { force: true });
  updateSigne(id, kind === "logo" ? { logo: dest } : { signatureImg: dest });
  return Response.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  const denied = await guard(req);
  if (denied) return denied;
  const { id } = await params;
  const files = getSigneFiles(id);
  if (!files) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const kind = kindOf(req);
  const old = kind === "logo" ? files.logo : files.signatureImg;
  if (old) await fs.rm(old, { force: true });
  updateSigne(id, kind === "logo" ? { logo: null } : { signatureImg: null });
  return Response.json({ ok: true });
}
