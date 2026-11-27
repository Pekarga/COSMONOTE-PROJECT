import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export type FileKind = "pdf" | "docx" | "odt" | "text" | "image";

const IMAGE_MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Formats acceptés au dépôt : PDF, Word (.docx), LibreOffice (.odt), texte et photos. */
export function fileKind(name: string, mime: string | null): FileKind | null {
  const ext = path.extname(name).toLowerCase();
  if (ext === ".pdf" || mime === "application/pdf") return "pdf";
  if (ext === ".docx") return "docx";
  if (ext === ".odt") return "odt";
  if (ext === ".txt" || ext === ".md" || mime === "text/plain") return "text";
  if (IMAGE_MIME[ext] || /^image\/(jpeg|png|webp)$/.test(mime ?? "")) return "image";
  return null;
}

export function imageMime(name: string, mime: string | null): "image/jpeg" | "image/png" | "image/webp" {
  const m = IMAGE_MIME[path.extname(name).toLowerCase()] ?? mime ?? "image/jpeg";
  return (["image/jpeg", "image/png", "image/webp"].includes(m) ? m : "image/jpeg") as
    | "image/jpeg"
    | "image/png"
    | "image/webp";
}

export const UNSUPPORTED_MESSAGE =
  "Formats acceptés : PDF, Word (.docx), LibreOffice (.odt), texte (.txt) et photos (JPEG, PNG, WebP). Un ancien fichier Word (.doc) doit d'abord être enregistré en .docx ou en PDF.";

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t ]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function odtText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const xml = (await zip.file("content.xml")?.async("string")) ?? "";
  return xml
    .replace(/<text:tab\/>/g, "\t")
    .replace(/<text:line-break\/>/g, "\n")
    .replace(/<\/text:(p|h)>/g, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Lit le texte d'un fichier. Une photo ou un PDF scanné sans texte renvoie une chaîne vide. */
export async function readText(filePath: string, kind: FileKind): Promise<string> {
  try {
    const buffer = await fs.readFile(filePath);
    if (kind === "text") return clean(buffer.toString("utf8"));
    if (kind === "docx") return clean((await mammoth.extractRawText({ buffer })).value);
    if (kind === "odt") return clean(await odtText(buffer));
    if (kind === "pdf") {
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const { text } = await extractText(pdf, { mergePages: true });
      return clean(Array.isArray(text) ? text.join("\n\n") : text);
    }
  } catch (err) {
    console.error("[readText]", filePath, err);
  }
  return "";
}

/** Nombre de pages d'un PDF (0 si illisible). */
export async function pdfPages(filePath: string): Promise<number> {
  try {
    const pdf = await getDocumentProxy(new Uint8Array(await fs.readFile(filePath)));
    return pdf.numPages;
  } catch {
    return 0;
  }
}

/**
 * Cherche le logo d'un courrier Word : la première image de l'en-tête de page,
 * sinon une image placée tout en haut du document.
 */
export async function docxLogo(filePath: string): Promise<{ data: Buffer; ext: string } | null> {
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(filePath));
    const relsFiles = Object.keys(zip.files)
      .filter((f) => /^word\/_rels\/header\d*\.xml\.rels$/.test(f))
      .sort();
    const targets: string[] = [];
    for (const f of relsFiles) {
      const xml = (await zip.file(f)?.async("string")) ?? "";
      for (const m of xml.matchAll(/Target="(media\/[^"]+)"/g)) targets.push(m[1]);
    }
    if (!targets.length) {
      const doc = (await zip.file("word/document.xml")?.async("string")) ?? "";
      const rels = (await zip.file("word/_rels/document.xml.rels")?.async("string")) ?? "";
      const first = doc.match(/r:embed="([^"]+)"/);
      if (first && first.index !== undefined && first.index < doc.length * 0.4) {
        const target = rels.match(new RegExp(`Id="${first[1]}"[^>]*Target="(media/[^"]+)"`))?.[1]
          ?? rels.match(new RegExp(`Target="(media/[^"]+)"[^>]*Id="${first[1]}"`))?.[1];
        if (target) targets.push(target);
      }
    }
    for (const t of targets) {
      const ext = path.extname(t).toLowerCase();
      if (![".png", ".jpg", ".jpeg"].includes(ext)) continue;
      const data = await zip.file(`word/${t}`)?.async("nodebuffer");
      if (data && data.length > 500) return { data, ext: ext === ".jpeg" ? ".jpg" : ext };
    }
  } catch (err) {
    console.error("[docxLogo]", err);
  }
  return null;
}

/** Texte du pied de page d'un courrier Word (adresse, téléphone, courriel). */
export async function docxPied(filePath: string): Promise<string> {
  try {
    const zip = await JSZip.loadAsync(await fs.readFile(filePath));
    const files = Object.keys(zip.files)
      .filter((f) => /^word\/footer\d*\.xml$/.test(f))
      .sort();
    const vus = new Set<string>();
    const lignes: string[] = [];
    for (const f of files) {
      const xml = (await zip.file(f)?.async("string")) ?? "";
      for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? []) {
        const t = [...p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
          .map((m) => m[1])
          .join("")
          .replace(/&amp;/g, "&")
          .replace(/&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/\s+/g, " ")
          .trim();
        if (t && !/^\d+$/.test(t) && !/^(page|\d+\s*\/\s*\d+)/i.test(t) && !vus.has(t)) {
          vus.add(t);
          lignes.push(t);
        }
      }
    }
    return lignes.join("\n");
  } catch {
    return "";
  }
}

/** Largeur et hauteur d'une image PNG ou JPEG, lues dans son en-tête. */
export function imageSize(buf: Buffer): { width: number; height: number; type: "png" | "jpg" } | null {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), type: "png" };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length - 9) {
      if (buf[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = buf[i + 1];
      const len = buf.readUInt16BE(i + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7), type: "jpg" };
      }
      i += 2 + len;
    }
  }
  return null;
}
