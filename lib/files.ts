import fs from "node:fs/promises";
import path from "node:path";

export function extOf(name: string): string {
  return path.extname(name).toLowerCase().slice(0, 8);
}

export async function writeUpload(file: File, dest: string): Promise<void> {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, Buffer.from(await file.arrayBuffer()));
}

/**
 * Textes lus sur l'ordinateur par reconnaissance de caractères (scans, photos), par nom de fichier.
 * Le navigateur les envoie dans des champs « ocr » : {"nom": "...", "texte": "..."}.
 */
export function ocrFrom(form: FormData): Map<string, string> {
  const lus = new Map<string, string>();
  for (const v of form.getAll("ocr")) {
    try {
      const { nom, texte } = JSON.parse(String(v)) as { nom?: unknown; texte?: unknown };
      if (typeof nom === "string" && typeof texte === "string" && texte.trim()) lus.set(nom, texte.slice(0, 300_000));
    } catch {}
  }
  return lus;
}

/** Le texte lu par OCR est gardé à côté du fichier : « <fichier>.ocr.txt ». */
export function ocrPath(chemin: string): string {
  return `${chemin}.ocr.txt`;
}

export async function writeOcr(chemin: string, texte: string): Promise<void> {
  await fs.writeFile(ocrPath(chemin), texte, "utf8");
}

export async function readOcr(chemin: string): Promise<string> {
  try {
    return (await fs.readFile(ocrPath(chemin), "utf8")).trim();
  } catch {
    return "";
  }
}

/** Un texte de moins de 40 caractères visibles : page scannée, sans couche de texte. */
export function sansTexte(texte: string): boolean {
  return texte.replace(/\s/g, "").length < 40;
}

export function filesFrom(form: FormData, field: string): File[] {
  return form.getAll(field).filter((f): f is File => f instanceof File && f.size > 0);
}

/** Renvoie un fichier enregistré, affiché dans l'appli plutôt que téléchargé quand c'est possible. */
export async function sendFile(p: string, name: string, mime: string | null): Promise<Response> {
  try {
    const data = await fs.readFile(p);
    return new Response(data, {
      headers: {
        "Content-Type": mime || "application/octet-stream",
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return Response.json({ error: "Fichier introuvable." }, { status: 404 });
  }
}

export function frDate(): string {
  return new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
}
