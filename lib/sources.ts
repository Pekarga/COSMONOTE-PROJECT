/**
 * Contrôle des références citées (lois, décrets, arrêtés, décisions, courriers, articles) dans ce que rédige
 * le modèle installé sur l'ordinateur. Un petit modèle invente parfois une référence vraisemblable
 * (« l'article 12 du décret N°2020-1234 du 15 décembre 2020 ») : toute référence qui ne figure ni dans le
 * dossier, ni dans les courriers signés, ni dans les consignes de l'agent est retirée du projet, remplacée
 * par [à compléter], et signalée dans les remarques.
 */
import type { Redaction } from "./types";

export type Sources = {
  /** Textes de référence : pièces du dossier, consignes de l'agent, demande de retouche… */
  textes: string[];
  /** Recherche ailleurs (les courriers signés, en base) : vrai si l'un des fragments y figure. */
  ailleurs?: (fragments: string[]) => boolean;
};

export type Citation = {
  debut: number;
  fin: number;
  extrait: string;
  nature: "texte" | "decision" | "courrier" | null;
  numero: string;
  date: string;
  articles: string[];
};

const LETTRE = String.raw`[\p{L}\d]`;
const AVANT = `(?<!${LETTRE})`;
const APRES = `(?!${LETTRE})`;
const APOS = "['’]";
const MOIS = "janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[ûu]t|septembre|octobre|novembre|d[ée]cembre";
const TEXTE = String.raw`loi(?:\s+organique)?|d[ée]cret|arr[êe]t[ée](?:\s+(?:inter)?minist[ée]riel)?|ordonnance|circulaire|instruction|note\s+de\s+service|r[èe]glement|directive`;

/** Une référence numérotée ou datée : « le décret N°2014-416 du 12 juin 2014 portant … ». */
const REFERENCE = new RegExp(
  String.raw`${AVANT}(?:l${APOS}|le\s+|la\s+|les\s+)?(?<type>${TEXTE}|d[ée]cision|courrier|lettre|correspondance)${APRES}` +
    String.raw`(?:\s*(?:n\s*[°º]|no\.?|num[ée]ro)\s*(?<num>\d(?:[\dA-Za-z./-]*[\dA-Za-z])?)|\s+(?<nu>\d{1,4}[-/]\d(?:[\dA-Za-z./-]*[\dA-Za-z])?))?` +
    String.raw`(?:\s*,?\s*(?:en\s+date\s+)?du\s+(?<date>\d{1,2}(?:er)?\s+(?:${MOIS})\s+\d{4}))?` +
    String.raw`(?<objet>\s+(?:portant|fixant|relatif|relative|relatifs|relatives|d[ée]terminant|instituant|r[ée]gissant|organisant|modifiant)${APRES}[^,.;:\n]*)?`,
  "giu",
);

/** Un article : « l'article 12 », « les articles 10 et 12, alinéa 2 ». */
const ARTICLE = new RegExp(
  String.raw`${AVANT}(?:l${APOS}|les\s+)?(?:articles?|art\.)\s*(?<nums>\d+(?:[-.]\d+)*(?:\s*(?:bis|ter))?(?:\s*(?:,|et|à)\s*\d+(?:[-.]\d+)*(?:\s*(?:bis|ter))?)*)(?:\s*,?\s*(?:alin[ée]a|al\.)\s*\d+)?`,
  "giu",
);

/** Ce qui relie un article au texte qui le contient : « l'article 12 du décret … ». */
const LIEN = new RegExp(String.raw`^\s+(?:du|de\s+la|de\s+l${APOS}|des|de)\s*$`, "iu");

function nature(type: string): Citation["nature"] {
  const t = type.toLowerCase();
  if (/^d[ée]cision/.test(t)) return "decision";
  if (/^(courrier|lettre|correspondance)/.test(t)) return "courrier";
  return "texte";
}

/** Les références et les articles cités dans un texte, dans l'ordre. */
export function citations(texte: string): Citation[] {
  const refs: Citation[] = [];
  for (const m of texte.matchAll(REFERENCE)) {
    const g = m.groups ?? {};
    const numero = g.num || g.nu || "";
    const date = g.date || "";
    if (!numero && !date) continue;
    refs.push({ debut: m.index ?? 0, fin: (m.index ?? 0) + m[0].length, extrait: m[0], nature: nature(g.type), numero, date, articles: [] });
  }
  const resultat: Citation[] = [];
  const liees = new Set<Citation>();
  for (const m of texte.matchAll(ARTICLE)) {
    const debut = m.index ?? 0;
    let fin = debut + m[0].length;
    const articles = (m.groups?.nums ?? "").match(/\d+(?:[-.]\d+)*/g) ?? [];
    const suite = refs.find((r) => r.debut >= fin && LIEN.test(texte.slice(fin, r.debut)));
    if (suite && suite.nature === "texte") {
      liees.add(suite);
      fin = suite.fin;
      resultat.push({ ...suite, debut, fin, extrait: texte.slice(debut, fin), articles });
    } else {
      resultat.push({ debut, fin, extrait: m[0], nature: null, numero: "", date: "", articles });
    }
  }
  resultat.push(...refs.filter((r) => !liees.has(r)));
  return resultat.sort((a, b) => a.debut - b.debut);
}

/** Forme comparable : sans accents ni majuscules, apostrophes et espaces unifiés. */
function norme(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ")
    .replace(/(?<![\p{L}\d])1er(?![\p{L}\d])/gu, "1");
}

const echapper = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function verificateur(sources: Sources) {
  const base = norme(sources.textes.filter(Boolean).join("\n"));
  const ailleurs = sources.ailleurs ?? (() => false);
  const memo = new Map<string, boolean>();
  const garder = (cle: string, f: () => boolean) => {
    if (!memo.has(cle)) memo.set(cle, f());
    return memo.get(cle) as boolean;
  };
  return {
    /** Le numéro (ou, à défaut, la date) de la référence figure dans les sources. */
    reference(c: Citation): boolean {
      if (!c.numero && !c.date) return true;
      const cle = c.numero || c.date;
      return garder(`r:${cle}`, () => {
        const motif = new RegExp(`(?<![\\p{L}\\d])${echapper(norme(cle))}(?![\\p{L}\\d])`, "u");
        return motif.test(base) || ailleurs([cle.toLowerCase()]);
      });
    },
    /** Chaque article cité figure dans les sources. */
    articles(c: Citation): string[] {
      return c.articles.filter(
        (n) =>
          !garder(`a:${n}`, () => {
            const motif = new RegExp(
              `(?<![\\p{L}\\d])art(?:icles?|\\.)\\s*(?:[\\d.-]+(?:\\s*(?:bis|ter))?\\s*(?:,|et|a)\\s*)*${echapper(n)}(?![\\d])`,
              "u",
            );
            return motif.test(base) || ailleurs([`article ${n}`, `art. ${n}`, `art ${n}`]);
          }),
      );
    },
  };
}

const A_COMPLETER: Record<NonNullable<Citation["nature"]>, string> = {
  texte: "[à compléter : texte applicable]",
  decision: "[à compléter : référence de la décision]",
  courrier: "[à compléter : référence du courrier]",
};

/** Début des remarques ajoutées par ce contrôle : on les remplace à chaque nouveau contrôle. */
export const TITRES_SOURCES = ["Référence sans appui : ", "Article à vérifier : "];

const court = (s: string) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 157).replace(/\s+\S*$/, "")}…` : t;
};

/**
 * Retire du projet les références qui ne figurent dans aucune source (remplacées par [à compléter]) et
 * signale les articles qu'on ne retrouve pas.
 */
export function controlerReferences(r: Redaction, sources: Sources): Redaction {
  const v = verificateur(sources);
  const remarques: string[] = [];
  const corriger = (texte: string): string => {
    let sortie = "";
    let position = 0;
    for (const c of citations(texte)) {
      if (c.debut < position) continue;
      if (c.nature && !v.reference(c)) {
        sortie += texte.slice(position, c.debut) + A_COMPLETER[c.nature];
        position = c.fin;
        remarques.push(
          `${TITRES_SOURCES[0]}« ${court(c.extrait)} » ne figure ni dans le dossier ni dans vos courriers signés. Le passage est marqué [à compléter] : indiquez la bonne référence, ou retirez-le.`,
        );
        continue;
      }
      const inconnus = v.articles(c);
      if (inconnus.length) {
        remarques.push(
          `${TITRES_SOURCES[1]}« ${court(c.extrait)} » : ${inconnus.length > 1 ? "ces articles ne figurent" : "cet article ne figure"} ni dans le dossier ni dans vos courriers signés. Vérifiez-le avant signature.`,
        );
      }
    }
    return (sortie + texte.slice(position)).replace(/ {2,}/g, " ");
  };
  const corps = r.corps.map(corriger);
  const objet = corriger(r.objet);
  const anciennes = r.remarques.filter((x) => !TITRES_SOURCES.some((t) => x.startsWith(t)));
  return { ...r, objet, corps, remarques: [...new Set([...anciennes, ...remarques])] };
}

/** Pour l'analyse d'un dossier : les références citées sans appui, en points à vérifier. */
export function referencesSansAppui(textes: string[], sources: Sources): string[] {
  const v = verificateur(sources);
  const points = new Set<string>();
  for (const texte of textes) {
    for (const c of citations(texte)) {
      if ((c.nature && !v.reference(c)) || v.articles(c).length) {
        points.add(`Référence citée par l'analyse sans appui dans les pièces : « ${court(c.extrait)} ». À vérifier.`);
      }
    }
  }
  return [...points];
}
