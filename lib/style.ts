import type { Genre, MiseEnForme, Signe } from "./types";

/** Mise en forme par défaut : celle de vos courriers signés (Arial 12, justifié). */
export const MISE_EN_FORME_DEFAUT: MiseEnForme = {
  entete: true,
  refs: true,
  pied: true,
  taille: 12,
  interligne: 1,
  alignement: "justify",
};

export const POLICES = ["Arial", "Times New Roman", "Calibri", "Cambria", "Garamond", "Bookman Old Style", "Century Gothic"];

/** Ne garde que des valeurs valides pour la mise en forme reçue du navigateur. */
export function formeValide(v: unknown): MiseEnForme {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const d = MISE_EN_FORME_DEFAUT;
  const taille = Number(o.taille);
  const interligne = Number(o.interligne);
  return {
    entete: typeof o.entete === "boolean" ? o.entete : d.entete,
    refs: typeof o.refs === "boolean" ? o.refs : d.refs,
    pied: typeof o.pied === "boolean" ? o.pied : d.pied,
    taille: taille >= 9 && taille <= 16 ? taille : d.taille,
    interligne: [1, 1.15, 1.5, 2].includes(interligne) ? interligne : d.interligne,
    alignement: o.alignement === "left" ? "left" : "justify",
  };
}

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** « 26 novembre 2026 », « 1er décembre 2026 » à partir d'une date AAAA-MM-JJ. */
export function dateLongue(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const jour = Number(m[3]);
  return `${jour === 1 ? "1er" : jour} ${MOIS[Number(m[2]) - 1]} ${m[1]}`;
}

/** Ligne de lieu et de date : « Abidjan, le 26 novembre 2026 », ou « Abidjan, le » si la date est en blanc. */
export function ligneDate(lieu: string, iso: string): string {
  const l = lieu.trim();
  if (!iso) return l ? `${l}, le` : "Le";
  const d = dateLongue(iso);
  return l ? `${l}, le ${d}` : `Le ${d}`;
}

export function aujourdhui(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Mise en page de secours tant qu'aucun courrier signé n'a été déposé. */
export const MISE_EN_PAGE_VIERGE = {
  entete: "[Ministère]\n__________\n[Direction générale]\n__________\n[DIRECTION]\n__________\nLE DIRECTEUR\n__________",
  enteteDroite: "[République]\n[Devise]\n__________",
  refs: "N°__________/[références du service]",
  lieu: "[Ville]",
  signature: "",
  ampliation: "",
  pied: "",
  police: "Arial",
};

/**
 * Reprend les références d'un courrier signé pour un nouveau courrier :
 * un numéro « N/Réf. » déjà rempli est propre à chaque courrier, et « V/Réf. » vient du dossier.
 * Les numéros laissés en blanc (« N°______/… ») sont gardés tels quels.
 */
export function refsPourNouveauCourrier(refs: string): string {
  return refs
    .split("\n")
    .filter((l) => !/^\s*(V\s*\/\s*R[ée]f|Votre r[ée]f|Vos r[ée]f)/i.test(l))
    .map((l) =>
      l.replace(/^(\s*(?:N\s*\/\s*R[ée]f\.?|Notre r[ée]f[ée]rence|Nos r[ée]f\.?))\s*:?\s*(.+)$/i, (_m, label: string) =>
        `${label.trim()} : [à compléter]`,
      ),
    )
    .join("\n")
    .trim();
}

export function miseEnPage(signe: Signe | null) {
  if (!signe) return { ...MISE_EN_PAGE_VIERGE, dateBlanche: false, signeId: null as string | null };
  return {
    entete: signe.entete || MISE_EN_PAGE_VIERGE.entete,
    enteteDroite: signe.enteteDroite,
    refs: refsPourNouveauCourrier(signe.refs),
    lieu: signe.lieu || MISE_EN_PAGE_VIERGE.lieu,
    dateBlanche: signe.dateBlanche,
    signature: signe.signature,
    ampliation: "",
    pied: signe.pied,
    police: signe.police || "Arial",
    signeId: signe.id as string | null,
  };
}

/** Formule d'appel déduite d'un bloc destinataire (« A / Monsieur le Directeur… » donne « Monsieur le Directeur, »). */
export function appelDepuisDestinataire(destinataire: string): string {
  const first =
    destinataire
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !/^(A|À)$/i.test(l) && !/^NOTE\s+A/i.test(l)) ?? "";
  const fonction = first.match(/^(Monsieur|Madame)\s+(le|la|l')\s*([\p{L}-]+)/iu);
  if (fonction) {
    const civ = fonction[1][0].toUpperCase() + fonction[1].slice(1).toLowerCase();
    const art = fonction[2].toLowerCase();
    const titre = fonction[3][0].toUpperCase() + fonction[3].slice(1).toLowerCase();
    return `${civ} ${art}${art.endsWith("'") ? "" : " "}${titre},`;
  }
  if (/^(Madame|Mme)\b/i.test(first)) return "Madame,";
  if (/^(Monsieur|M\.)\s/i.test(first)) return "Monsieur,";
  if (/^Ma[îi]tre\b/i.test(first)) return "Maître,";
  if (/^(Docteur|Dr)\b/i.test(first)) return "Docteur,";
  return "Madame, Monsieur,";
}

/** Formule de politesse qui reprend la formule d'appel. */
export function politesseDefaut(appel: string): string {
  const civ = appel.replace(/,\s*$/, "").trim() || "Madame, Monsieur";
  const autorite = /\b(le|la|l')\s*\p{L}/iu.test(civ);
  return autorite
    ? `Je vous prie d'agréer, ${civ}, l'expression de ma considération distinguée.`
    : `Je vous prie d'agréer, ${civ}, l'expression de mes salutations distinguées.`;
}

/** Remplace la civilité reprise dans une formule de politesse (« …, Monsieur le Directeur, l'expression… »). */
export function adapterPolitesse(politesse: string, ancienAppel: string, nouvelAppel: string): string {
  const ancien = ancienAppel.replace(/,\s*$/, "").trim();
  const nouveau = nouvelAppel.replace(/,\s*$/, "").trim();
  if (!politesse.trim()) return politesseDefaut(nouvelAppel);
  if (ancien && politesse.includes(ancien)) return politesse.replace(ancien, nouveau);
  return politesseDefaut(nouvelAppel);
}

/** « ABIDJAN » devient « A B I D J A N », comme dans le bloc destinataire des courriers de la DCB. */
export function villeEspacee(ville: string): string {
  return ville.trim().toUpperCase().replace(/\s+/g, " ").split("").join(" ").replace(/ {3}/g, "   ");
}

export const FORMULE_NOTE = "Vos instructions m'obligeraient.";

export const GENRES: Record<Genre, string> = {
  courrier: "Courrier de réponse",
  note: "Note au Directeur",
};

/** Règles de rédaction communes à l'analyse et à la rédaction par Claude. */
export const REGLES_REDACTION = `Règles de la correspondance administrative :
- Style sobre, précis, courtois et impersonnel. Phrases courtes, un paragraphe par idée, du rappel des faits à la conclusion. Ni familiarité, ni emphase.
- Le signataire s'exprime à la première personne du singulier (« je »), au nom de son administration.
- Tournures d'usage : « J'ai l'honneur de… », « Par courrier N°… en date du …, vous m'avez transmis… », « En réponse, j'ai l'honneur de porter à votre connaissance que… », « Après analyse, il ressort que… », « Or, … », « Au vu de ce qui précède, … », « Toutefois, je vous suggère de… ».
- La formule de politesse reprend exactement la formule d'appel, titre compris (« Monsieur le Directeur, » donne « Je vous prie d'agréer, Monsieur le Directeur, l'expression de ma considération distinguée. »).
- Une note au Directeur n'a ni formule d'appel ni formule de politesse : elle expose les faits, l'analyse (« Après analyse, il en ressort que : »), une conclusion (« Au regard de ce qui précède, il paraît indiqué de… ») et se termine par une formule comme « Vos instructions m'obligeraient. ».
- Cite les références des actes exactement comme dans les pièces (numéro, date, auteur). Écris les montants comme dans les courriers signés (par exemple « vingt-six millions cinq cent cinquante mille (26 550 000) FCFA »).
- Une réponse défavorable est motivée par les faits et, si les pièces le permettent, par le texte applicable.
- Écris dans un français correct (accords, accents, ponctuation), même si les modèles contiennent des coquilles.
- N'invente jamais de faits, de dates, de montants, de noms ni de références de textes. Quand une information manque, écris [à compléter : ce qui manque] à l'endroit voulu, et signale-le dans les remarques.`;
