// Copie dans public/ocr les fichiers de la reconnaissance de caractères (Tesseract) et de
// l'affichage des PDF (pdf.js), pour lire les scans sur l'ordinateur, sans Internet ni clé.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = path.resolve(import.meta.dirname, "..");
const out = path.join(root, "public", "ocr");
const dossier = (pkg, from = root) => path.dirname(createRequire(path.join(from, "package.json")).resolve(`${pkg}/package.json`));

const tesseract = dossier("tesseract.js");
// Le moteur est celui dont dépend tesseract.js (même version majeure).
const core = dossier("tesseract.js-core", tesseract);
const fra = dossier("@tesseract.js-data/fra");
const pdfjs = dossier("pdfjs-dist");

const copies = [
  [path.join(tesseract, "dist", "tesseract.min.js"), "tesseract.min.js"],
  [path.join(tesseract, "dist", "worker.min.js"), "worker.min.js"],
  ...["tesseract-core-lstm.wasm.js", "tesseract-core-simd-lstm.wasm.js", "tesseract-core-relaxedsimd-lstm.wasm.js"].map((f) => [
    path.join(core, f),
    path.join("core", f),
  ]),
  [path.join(fra, "4.0.0_best_int", "fra.traineddata.gz"), path.join("lang", "fra.traineddata.gz")],
  [path.join(pdfjs, "build", "pdf.min.mjs"), "pdf.min.mjs"],
  [path.join(pdfjs, "build", "pdf.worker.min.mjs"), "pdf.worker.min.mjs"],
];

fs.rmSync(out, { recursive: true, force: true });
for (const [src, dest] of copies) {
  if (!fs.existsSync(src)) {
    console.error("Fichier introuvable pour la lecture des scans :", src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(path.join(out, dest)), { recursive: true });
  fs.copyFileSync(src, path.join(out, dest));
}
console.log(`Lecture des scans : ${copies.length} fichiers copiés dans public/ocr`);
