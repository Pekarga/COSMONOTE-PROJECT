/**
 * Lecture des scans sur l'ordinateur, sans Internet ni clé : pdf.js affiche les pages d'un PDF,
 * Tesseract (reconnaissance de caractères, français) en lit le texte. Les fichiers viennent de
 * public/ocr (copiés par scripts/copier-ocr.mjs).
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
const estImage = (f: File) => /^image\/(jpeg|png|webp)$/.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name);

/** Un PDF sans couche de texte (moins de 40 caractères par page en moyenne) est un scan. */
async function pdfScanne(doc: PdfDoc): Promise<boolean> {
  const n = Math.min(doc.numPages, 3);
  let caracteres = 0;
  for (let i = 1; i <= n; i++) {
    const page = await doc.getPage(i);
    const { items } = await page.getTextContent();
    caracteres += items.map((it) => it.str ?? "").join("").replace(/\s/g, "").length;
  }
  return caracteres < 40 * n;
}

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

/**
 * Lit le texte des scans (PDF sans texte, photos) parmi les fichiers. Renvoie, pour chaque fichier
 * lu, son texte. Les fichiers qui ont déjà du texte (Word, PDF texte) sont laissés de côté.
 */
export async function lireScans(
  fichiers: File[],
  etat?: (message: string | null) => void,
): Promise<Map<File, string>> {
  const lus = new Map<File, string>();
  // On repère d'abord les scans, pour n'ouvrir le lecteur que si besoin.
  const scans: { fichier: File; doc: PdfDoc | null; tache: PdfTache | null }[] = [];
  const fermer = (t: PdfTache | null) => t?.destroy?.().catch(() => {});
  for (const f of fichiers) {
    try {
      if (estImage(f)) scans.push({ fichier: f, doc: null, tache: null });
      else if (estPdf(f)) {
        const lib = await pdfjs();
        const tache = lib.getDocument({ data: new Uint8Array(await f.arrayBuffer()) });
        const doc = await tache.promise;
        if (await pdfScanne(doc)) scans.push({ fichier: f, doc, tache });
        else await fermer(tache);
      }
    } catch (err) {
      console.warn("[ocr] fichier ignoré", f.name, err);
    }
  }
  if (!scans.length) return lus;

  etat?.(`Préparation de la lecture des scans (${scans.length})…`);
  const lecteur = await nouveauLecteur();
  try {
    for (const [i, { fichier, doc, tache }] of scans.entries()) {
      const rang = scans.length > 1 ? ` ${i + 1}/${scans.length}` : "";
      try {
        const textes: string[] = [];
        if (doc) {
          const n = Math.min(doc.numPages, PAGES_MAX);
          for (let p = 1; p <= n; p++) {
            etat?.(`Lecture du scan${rang} : « ${fichier.name} », page ${p}/${n}…`);
            const page = await doc.getPage(p);
            const canvas = await pageEnImage(page);
            textes.push((await lecteur.recognize(canvas)).data.text);
            page.cleanup?.();
            canvas.width = canvas.height = 0;
          }
          await fermer(tache);
        } else {
          etat?.(`Lecture de la photo${rang} : « ${fichier.name} »…`);
          textes.push((await lecteur.recognize(fichier)).data.text);
        }
        const texte = nettoyer(textes.join("\n\n"));
        if (texte) lus.set(fichier, texte);
      } catch (err) {
        console.warn("[ocr] lecture impossible", fichier.name, err);
        await fermer(tache);
      }
    }
  } finally {
    await lecteur.terminate().catch(() => {});
    etat?.(null);
  }
  return lus;
}

let modeDemo: Promise<boolean> | null = null;
/** Sans clé Claude, c'est l'ordinateur qui lit les scans ; avec une clé, Claude les lit lui-même. */
export function sansCle(): Promise<boolean> {
  modeDemo ??= fetch("/api/status")
    .then((r) => r.json())
    .then((s: { claude?: boolean }) => !s.claude)
    .catch(() => true);
  return modeDemo;
}

/**
 * Ajoute au formulaire le texte des scans lus sur l'ordinateur (champ « ocr », par nom de fichier).
 * Seulement sans clé Claude : avec une clé, Claude lit les scans lui-même.
 */
export async function ajouterTexteDesScans(
  form: FormData,
  fichiers: File[],
  etat?: (message: string | null) => void,
): Promise<void> {
  if (!(await sansCle())) return;
  const lus = await lireScans(fichiers, etat).catch((err) => {
    console.warn("[ocr]", err);
    etat?.(null);
    return new Map<File, string>();
  });
  for (const [fichier, texte] of lus) form.append("ocr", JSON.stringify({ nom: fichier.name, texte }));
}

/**
 * Relit les courriers signés restés en erreur. Sans clé, les scans sont d'abord lus sur
 * l'ordinateur. Renvoie le nombre de scans lus.
 */
export async function relireSignes(
  signes: { id: string; nomFichier: string }[],
  etat?: (message: string | null) => void,
): Promise<number> {
  const fichiers: { id: string; fichier: File }[] = [];
  if (await sansCle()) {
    etat?.("Ouverture des courriers…");
    for (const s of signes) {
      const r = await fetch(`/api/signes/${s.id}/fichier`).catch(() => null);
      if (!r?.ok) continue;
      const blob = await r.blob();
      fichiers.push({ id: s.id, fichier: new File([blob], s.nomFichier, { type: blob.type }) });
    }
  }
  const lus = fichiers.length
    ? await lireScans(
        fichiers.map((f) => f.fichier),
        etat,
      ).catch((err) => {
        console.warn("[ocr]", err);
        return new Map<File, string>();
      })
    : new Map<File, string>();
  etat?.(null);
  let n = 0;
  for (const s of signes) {
    const fichier = fichiers.find((f) => f.id === s.id)?.fichier;
    const ocr = fichier ? lus.get(fichier) : undefined;
    if (ocr) n++;
    await fetch(`/api/signes/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(ocr ? { relire: true, ocr } : { relire: true }),
    });
  }
  return n;
}
