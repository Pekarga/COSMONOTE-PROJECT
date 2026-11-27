import { createPiece, updatePiece } from "./db";
import { fileKind, readText } from "./extract";
import { extOf, sansTexte, writeOcr, writeUpload } from "./files";
import type { PieceRole } from "./types";

/**
 * Enregistre des fichiers dans un dossier et lit leur texte. Pour un scan ou une photo, on garde
 * le texte lu sur l'ordinateur (OCR) s'il a été envoyé. Renvoie les noms refusés.
 */
export async function ajouterPieces(
  dossierId: string,
  files: File[],
  role: PieceRole,
  ocr: Map<string, string> = new Map(),
): Promise<string[]> {
  const refuses: string[] = [];
  for (const f of files) {
    const kind = fileKind(f.name, f.type);
    if (!kind) {
      refuses.push(f.name);
      continue;
    }
    const { id, chemin } = createPiece({
      dossierId,
      role,
      nom: f.name,
      mime: f.type || null,
      ext: extOf(f.name),
      taille: f.size,
    });
    await writeUpload(f, chemin);
    let texte = kind === "image" ? "" : await readText(chemin, kind);
    const lu = ocr.get(f.name);
    if (lu && sansTexte(texte)) {
      texte = lu;
      await writeOcr(chemin, lu);
    }
    if (texte) updatePiece(id, { texte });
  }
  return refuses;
}
