import type { NextRequest } from "next/server";
import { guard } from "@/lib/auth";
import { anyLogo, getCourrier, getSigneFiles } from "@/lib/db";
import { courrierDocx } from "@/lib/docx";

export const runtime = "nodejs";

function nomFichier(objet: string, date: string) {
  const base = (objet || "Courrier")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
  return `${date ? `${date}-` : ""}${base || "Courrier"}.docx`;
}

/** Télécharge le courrier au format Word. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await guard(req);
  if (denied) return denied;
  const courrier = getCourrier((await params).id);
  if (!courrier) return Response.json({ error: "Courrier introuvable." }, { status: 404 });
  const files = courrier.signeId ? getSigneFiles(courrier.signeId) : null;
  // Sans logo dans le modèle choisi, on reprend les armoiries d'un autre courrier signé.
  const buffer = await courrierDocx(courrier, { logo: files?.logo ?? anyLogo(), signature: files?.signatureImg ?? null });
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(nomFichier(courrier.objet, courrier.date))}`,
    },
  });
}
