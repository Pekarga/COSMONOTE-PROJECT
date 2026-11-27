import { createPiece, updatePiece } from "./db";
import { fileKind, readText } from "./extract";
import { extOf, writeUpload } from "./files";
import type { PieceRole } from "./types";

/** Enregistre des fichiers dans un dossier et lit leur texte. Renvoie les noms refusés. */
export async function ajouterPieces(dossierId: string, files: File[], role: PieceRole): Promise<string[]> {
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
    if (kind !== "image") updatePiece(id, { texte: await readText(chemin, kind) });
  }
  return refuses;
}
