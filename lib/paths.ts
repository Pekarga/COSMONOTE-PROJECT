import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
/** Fichiers déposés : courriers signés, pièces des dossiers, logos et signatures. */
export const FILES_DIR = path.join(DATA_DIR, "fichiers");
