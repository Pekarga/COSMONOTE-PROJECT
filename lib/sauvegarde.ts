import fs from "node:fs";
import path from "node:path";
import { copierBase, getSetting, setSetting } from "./db";
import { DATA_DIR } from "./paths";

/**
 * Sauvegardes automatiques de la base (courriers signés lus, dossiers, analyses, projets rédigés).
 * Une copie par jour au plus, les dix dernières sont gardées. Les fichiers déposés restent dans le
 * dossier « fichiers » à côté.
 */
export const DOSSIER_SAUVEGARDES = path.join(DATA_DIR, "sauvegardes");
const GARDER = 10;
const INTERVALLE = 20 * 3600_000;

export function sauvegarder(): string {
  fs.mkdirSync(DOSSIER_SAUVEGARDES, { recursive: true });
  const date = new Date();
  const fichier = path.join(DOSSIER_SAUVEGARDES, `redacteur-${date.toISOString().slice(0, 19).replace(/[:T]/g, "-")}.db`);
  copierBase(fichier);
  setSetting("derniere_sauvegarde", date.toISOString());
  const copies = fs
    .readdirSync(DOSSIER_SAUVEGARDES)
    .filter((f) => /^redacteur-.*\.db$/.test(f))
    .sort();
  for (const f of copies.slice(0, Math.max(0, copies.length - GARDER))) fs.rmSync(path.join(DOSSIER_SAUVEGARDES, f), { force: true });
  return fichier;
}

/** Sauvegarde si la dernière date de plus de 20 heures. */
export function sauvegardeAuto(): void {
  const derniere = getSetting("derniere_sauvegarde");
  if (derniere && Date.now() - Date.parse(derniere) < INTERVALLE) return;
  try {
    sauvegarder();
  } catch (err) {
    console.error("[sauvegarde]", err);
  }
}

export function infosSauvegarde(): { derniere: string | null; dossier: string; nombre: number } {
  let nombre = 0;
  try {
    nombre = fs.readdirSync(DOSSIER_SAUVEGARDES).filter((f) => /^redacteur-.*\.db$/.test(f)).length;
  } catch {}
  return { derniere: getSetting("derniere_sauvegarde"), dossier: DOSSIER_SAUVEGARDES, nombre };
}
