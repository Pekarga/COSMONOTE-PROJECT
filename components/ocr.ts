/**
 * Lecture des scans sur l'ordinateur, sans Internet : pdf.js affiche les pages d'un PDF,
 * Tesseract (reconnaissance de caractères, français) en lit le texte. Les fichiers viennent de
 * public/ocr (copiés par scripts/copier-ocr.mjs). La lecture tourne en arrière-plan (LecteurScans).
 */

type PdfPage = {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<{ items: { str?: string }[] }>;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown; canvas?: HTMLCanvasElement }) => {
    promise: Promise<void>;
  };
  cleanup?: () => void;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfTache = { promise: Promise<PdfDoc>; destroy?: () => Promise<void> };
type PdfJs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (o: { data: Uint8Array }) => PdfTache;
};
type TessWorker = {
  recognize: (image: HTMLCanvasElement | Blob) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<void>;
};
type Tess = { createWorker: (lang: string, oem: number, options: Record<string, unknown>) => Promise<TessWorker> };

/** Pages lues au plus par fichier : un courrier signé tient en quelques pages. */
const PAGES_MAX = 8;
/** Largeur de rendu d'une page (en pixels) : environ 200 points par pouce pour une page A4. */
const LARGEUR = 1700;

const url = (p: string) => new URL(p, window.location.href).href;

let pdfjsCharge: Promise<PdfJs> | null = null;
function pdfjs(): Promise<PdfJs> {
  // Import d'un module servi tel quel (public/ocr), hors de l'assemblage de l'appli.
  const importer = new Function("u", "return import(u)") as (u: string) => Promise<PdfJs>;
  pdfjsCharge ??= importer(url("/ocr/pdf.min.mjs")).then((m) => {
    m.GlobalWorkerOptions.workerSrc = url("/ocr/pdf.worker.min.mjs");
    return m;
  });
  return pdfjsCharge;
}

let tesseractCharge: Promise<Tess> | null = null;
function tesseract(): Promise<Tess> {
  tesseractCharge ??= new Promise<Tess>((resolve, reject) => {
    const w = window as unknown as { Tesseract?: Tess };
    if (w.Tesseract) return resolve(w.Tesseract);
    const s = document.createElement("script");
    s.src = url("/ocr/tesseract.min.js");
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error("Lecture des scans indisponible.")));
    s.onerror = () => reject(new Error("Lecture des scans indisponible."));
    document.head.appendChild(s);
  });
  return tesseractCharge;
}

async function nouveauLecteur(): Promise<TessWorker> {
  const T = await tesseract();
  return T.createWorker("fra", 1, {
    workerPath: url("/ocr/worker.min.js"),
    corePath: url("/ocr/core"),
    langPath: url("/ocr/lang"),
    gzip: true,
    cacheMethod: "none",
  });
}

const estPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

async function pageEnImage(page: PdfPage): Promise<HTMLCanvasElement> {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(4, LARGEUR / base.width) });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport, canvas }).promise;
  return canvas;
}

function nettoyer(texte: string): string {
  return texte
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Lecteur de texte (Tesseract, français), gardé ouvert pour lire une série de fichiers. */
export type Lecteur = TessWorker;

export async function ouvrirLecteur(): Promise<Lecteur> {
  return nouveauLecteur();
}

/**
 * Lit le texte d'un scan (PDF sans texte, toutes ses pages jusqu'à 8) ou d'une photo.
 * etat reçoit la page en cours, pour l'afficher.
 */
export async function lireFichier(fichier: File, lecteur: Lecteur, etat?: (page: string) => void): Promise<string> {
  if (!estPdf(fichier)) {
    etat?.("");
    return nettoyer((await lecteur.recognize(fichier)).data.text);
  }
  const lib = await pdfjs();
  const tache = lib.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) });
  try {
    const doc = await tache.promise;
    const n = Math.min(doc.numPages, PAGES_MAX);
    const textes: string[] = [];
    for (let p = 1; p <= n; p++) {
      etat?.(n > 1 ? `page ${p}/${n}` : "");
      const page = await doc.getPage(p);
      const canvas = await pageEnImage(page);
      textes.push((await lecteur.recognize(canvas)).data.text);
      page.cleanup?.();
      canvas.width = canvas.height = 0;
    }
    return nettoyer(textes.join("\n\n"));
  } finally {
    await tache.destroy?.().catch(() => {});
  }
}
