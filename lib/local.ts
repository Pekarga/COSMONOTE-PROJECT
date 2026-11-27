/**
 * Analyse et rédaction par le modèle installé sur l'ordinateur. Mêmes consignes que pour Claude
 * (lib/consignes.ts), resserrées pour tenir dans la fenêtre de contexte d'un petit modèle.
 */
import {
  AnalyseSchema,
  CONSIGNE_ANALYSE,
  CONSIGNE_REDACTION,
  ROLE,
  RedactionSchema,
  analyseDepuis,
  briefRedaction,
  champsAttendus,
  consigneRetouche,
  exemplesTexte,
  type DemandeRedaction,
} from "./consignes";
import { CARACTERES_PAR_JETON, CONTEXTE, demanderAuModele, type Travail } from "./modele";
import { adapterPolitesse } from "./style";
import type { Analyse, Redaction, Signe } from "./types";

type Avancement = (t: Travail) => void;
export type PieceTexte = { nom: string; role: "dossier" | "justificatif"; texte: string };

const ROLE_LABEL = { dossier: "pièce du dossier imputé", justificatif: "pièce justificative" };
/** Marge pour le modèle de conversation et les balises. */
const MARGE = 300;

function budget(maxJetons: number, ...fixes: string[]): number {
  const utilise = fixes.reduce((n, s) => n + s.length, 0);
  return Math.max(0, (CONTEXTE - maxJetons - MARGE) * CARACTERES_PAR_JETON - utilise);
}

function couper(texte: string, n: number): string {
  const t = texte.trim();
  if (t.length <= n) return t;
  return `${t.slice(0, Math.max(0, n - 40)).replace(/\s+\S*$/, "")}\n[… suite non reprise]`;
}

/**
 * Texte des pièces dans la limite donnée : chaque pièce reçoit une part égale, et ce qu'une pièce courte
 * n'utilise pas revient aux autres. Les pièces du dossier imputé passent avant les justificatifs.
 */
export function textePieces(pieces: PieceTexte[], limite: number): string {
  const ordre = [...pieces.entries()].sort(([, a], [, b]) => (a.role === b.role ? 0 : a.role === "dossier" ? -1 : 1));
  const entetes = ordre.map(([i, p]) => `<piece numero="${i + 1}" nature="${ROLE_LABEL[p.role]}" nom="${p.nom}">`);
  let reste = limite - entetes.reduce((n, e) => n + e.length + 12, 0);
  const parts = new Map<number, number>();
  const parTaille = [...ordre].sort(([, a], [, b]) => a.texte.length - b.texte.length);
  parTaille.forEach(([i, p], k) => {
    const part = Math.max(0, Math.floor(reste / (parTaille.length - k)));
    const pris = Math.min(p.texte.trim().length, part);
    parts.set(i, pris);
    reste -= pris;
  });
  return ordre
    .map(([i, p], k) => `${entetes[k]}\n${couper(p.texte, parts.get(i) ?? 0) || "(pas de texte lisible)"}\n</piece>`)
    .join("\n\n");
}

/** Exemples de style : deux ou trois courriers signés, raccourcis s'il le faut. */
function exemples(modeles: Signe[], limite: number): string {
  const choisis = modeles.slice(0, 3);
  for (let n = choisis.length; n > 0; n--) {
    const parCourrier = Math.floor(limite / n) - 120;
    if (parCourrier >= 1200 || n === 1) return exemplesTexte(choisis.slice(0, n), Math.max(600, parCourrier));
  }
  return exemplesTexte([]);
}

function formatReponse(schema: Parameters<typeof champsAttendus>[0]): string {
  return `Réponds uniquement par un objet JSON avec ces champs :\n${champsAttendus(schema)}`;
}

/* ───────────── Analyse d'un dossier ───────────── */

export async function analyserDossierLocal(
  cle: string,
  pieces: PieceTexte[],
  modeles: Signe[],
  repere: string,
  surAvancement?: Avancement,
): Promise<Analyse> {
  const maxJetons = 1800;
  const systeme = `${ROLE}\n${CONSIGNE_ANALYSE}\n- Sois concis : une phrase par élément, sans mise en forme (ni gras, ni titres).\n\n${formatReponse(AnalyseSchema)}`;
  // Un seul courrier signé suffit ici : il montre comment présenter le destinataire et la formule d'appel.
  const modele = exemples(modeles.slice(0, 1), 1800);
  const consigne = [
    repere ? `Repère, relevé automatiquement dans l'en-tête du courrier reçu (à vérifier) : l'expéditeur serait\n${repere}` : "",
    "Voici les pièces du dossier. Analyse-le.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const texte = textePieces(pieces, budget(maxJetons, systeme, modele, consigne));
  const out = await demanderAuModele({
    schema: AnalyseSchema,
    systeme: `${systeme}\n\n${modele}`,
    message: `<pieces_du_dossier>\n${texte}\n</pieces_du_dossier>\n\n${consigne}`,
    maxJetons,
    attendus: 900,
    libelle: "Analyse du dossier",
    cle,
    surAvancement,
  });
  const analyse = sansMiseEnForme(analyseDepuis(out));
  analyse.demandeur = bloc(analyse.demandeur);
  return analyse;
}

/* ───────────── Rédaction ───────────── */

/**
 * Consignes de rédaction et exemples, identiques pour la rédaction et les retouches d'un même courrier :
 * le serveur du modèle garde ce début en mémoire et ne le relit pas.
 */
function systemeRedaction(modeles: Signe[], limiteExemples: number): string {
  return `${ROLE}\n${CONSIGNE_REDACTION}\n\n${formatReponse(RedactionSchema)}\n\n${exemples(modeles, limiteExemples)}`;
}
const EXEMPLES_REDACTION = 6000;

export async function redigerLocal(
  cle: string,
  input: DemandeRedaction & { pieces: PieceTexte[] },
  surAvancement?: Avancement,
): Promise<Redaction> {
  const r = await redigerBrut(cle, input, surAvancement);
  // Le destinataire et la formule d'appel sont ceux de l'analyse du dossier, que l'agent a pu vérifier :
  // un petit modèle les reprend parfois de l'en-tête du courrier reçu.
  const a = input.analyse;
  if (input.genre !== "note" && a?.demandeur.trim() && !a.demandeur.includes("[à compléter")) {
    r.destinataire = bloc(a.demandeur);
    if (a.appel.trim() && a.appel.trim() !== r.appel.trim()) {
      r.politesse = adapterPolitesse(r.politesse, r.appel, a.appel.trim());
      r.appel = a.appel.trim();
    }
  }
  r.destinataire = bloc(r.destinataire);
  return r;
}

async function redigerBrut(
  cle: string,
  input: DemandeRedaction & { pieces: PieceTexte[] },
  surAvancement?: Avancement,
): Promise<Redaction> {
  const maxJetons = 2000;
  const systeme = systemeRedaction(input.modeles, EXEMPLES_REDACTION);
  const brief = briefRedaction(input);
  // Les pièces du dossier imputé, dans ce qui reste : l'analyse en donne déjà l'essentiel.
  const reste = budget(maxJetons, systeme, brief);
  const dossier = input.pieces.filter((p) => p.role === "dossier");
  const pieces = reste > 800 && dossier.length ? `<pieces_du_dossier>\n${textePieces(dossier, reste - 60)}\n</pieces_du_dossier>\n\n` : "";
  const r = await demanderAuModele({
    schema: RedactionSchema,
    systeme,
    message: `${pieces}${brief}`,
    maxJetons,
    attendus: 700,
    libelle: input.genre === "note" ? "Rédaction de la note" : "Rédaction du projet",
    cle,
    surAvancement,
  });
  return sansMiseEnForme(r);
}

export async function retoucherLocal(
  cle: string,
  input: { courrier: Redaction; instruction: string; modeles: Signe[]; libelle?: string },
  surAvancement?: Avancement,
): Promise<Redaction> {
  const r = await demanderAuModele({
    schema: RedactionSchema,
    systeme: systemeRedaction(input.modeles, EXEMPLES_REDACTION),
    message: consigneRetouche(input.courrier, input.instruction),
    maxJetons: 2000,
    attendus: 700,
    libelle: input.libelle ?? "Retouche du projet",
    cle,
    surAvancement,
  });
  return sansMiseEnForme({ ...r, destinataire: bloc(r.destinataire) });
}

/* ───────────── Nettoyage des réponses ───────────── */

/** Retire le gras et les titres à la Markdown qu'un petit modèle glisse parfois dans le texte. */
function sansMiseEnForme<T>(v: T): T {
  if (typeof v === "string") {
    return v
      .replace(/\*\*(.+?)\*\*/gs, "$1")
      .replace(/__(.+?)__/gs, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/\*\*/g, "") as T;
  }
  if (Array.isArray(v)) return v.map(sansMiseEnForme) as T;
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sansMiseEnForme(x)])) as T;
  }
  return v;
}

/** Bloc destinataire écrit sur une ligne (« A / Monsieur le Directeur / … ») : une ligne par élément. */
export function bloc(texte: string): string {
  let t = texte.trim();
  if (!t.includes("\n") && / \/ /.test(t)) t = t.split(/\s+\/\s+/).join("\n");
  return t
    .split("\n")
    .map((l) => (/^\(?ligne vide\)?$/i.test(l.trim()) ? "" : l.trimEnd()))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
