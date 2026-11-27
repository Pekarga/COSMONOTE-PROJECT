/**
 * Lecture et rédaction sur l'ordinateur, sans Internet : Le rédacteur lit les courriers avec des règles simples
 * et assemble les réponses à partir de formules administratives d'usage.
 * Le résultat est à relire de près.
 */
import { FORMULE_NOTE, adapterPolitesse, appelDepuisDestinataire, politesseDefaut, villeEspacee } from "./style";
import type { Analyse, Genre, Redaction, Ton } from "./types";

const MOIS_RE = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre";
const DATE_RE = new RegExp(`\\b(\\d{1,2}(?:er)?)\\s+(${MOIS_RE})\\s+(\\d{4})\\b`, "i");
/** « Abidjan, le », « Abidjan le 3 mars 2026 », « Lyon, le 1er juin 2026 », « Abidjan, ». */
const DATE_LINE_RE = new RegExp(
  `^([\\p{L}][\\p{L}\\-' ]{1,40}?)\\s*(?:,\\s*le|\\s+le|,)(\\s+\\d{1,2}(?:er)?\\s+(?:${MOIS_RE})\\s+\\d{4})?\\s*\\.?$`,
  "iu",
);
const REF_RE = /^(N°|N\s*\/\s*R[ée]f|V\s*\/\s*R[ée]f|R[ée]f(?:[ée]rence)?s?\s*[.:]|affaire suivie|dossier suivi|suivi par|t[ée]l[ée]?phone|t[ée]l\.|courriel|m[ée]l\s*:|e-?mail|fax)/i;
const CODE_RE = /[A-Z]{2,}\s*\/\s*[A-Z0-9-]{2,}\s*\//;
const APPEL_RE = /^(Madame|Monsieur|Mesdames|Messieurs|Ma[îi]tre|Docteur|Cher|Ch[èe]re)\b[^.\n]{0,60},$/;
const POLITESSE_RE = /(je vous prie d['’]agr[ée]er|veuillez agr[ée]er|je vous prie de (?:bien vouloir )?(?:croire|recevoir)|recevez|je vous prie d['’]accepter|veuillez (?:croire|recevoir)|vos instructions m['’]obligeraient)/i;
const CIVILITE_RE = /^(Madame|Monsieur|Mme|M\.|Mlle|Ma[îi]tre|Docteur|Mesdames|Messieurs)\s+\S/;
const REPUBLIQUE_RE = /^R[ÉE]PUBLIQUE\b/i;
const DEVISE_RE = /(union|discipline|travail|fraternit|libert|[ée]galit|unit[ée]|progr[èe]s|justice|paix)/i;
const SEPARATEUR_RE = /^[-_—–=*.\s]{3,}$/;
const AMPLIATION_RE = /^(ampliations?|copies?(?:\s+[àa])?|destinataires? en copie)\s*:?\s*(.*)$/i;

function isDateLine(l: string) {
  return DATE_LINE_RE.test(l) && l.length < 60;
}

function sentences(text: string): string[] {
  return text
    .replace(/(\p{L})-[ \t]*\n\s*(\p{L})/gu, "$1-$2")
    .replace(/\s+/g, " ")
    // Un trait d'union suivi d'une espace vient d'une coupure de ligne : « CROU- B » redevient « CROU-B ».
    .replace(/(\p{L})- (\p{L})/gu, "$1-$2")
    .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ý«])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);
}

/** Sépare une ligne à deux colonnes (« MINISTERE…<tabulations>REPUBLIQUE… »). */
function colonnes(l: string): [string, string] | null {
  const parts = l.split(/\t+|\s{4,}/).map((p) => p.trim()).filter(Boolean);
  return parts.length >= 2 ? [parts[0], parts.slice(1).join(" ")] : null;
}

/** Découpe un courrier en blocs : en-tête, références, date, destinataire, objet, appel, corps, politesse, ampliation. */
export function decouperCourrier(text: string) {
  const raw = text.replace(/\r/g, "").split("\n");
  const trimmed = raw.map((l) => l.trim());
  const first = trimmed.find(Boolean) ?? "";
  const objetIdx = trimmed.findIndex((l) => /^objet\s*:/i.test(l));
  const appelIdx = trimmed.findIndex((l, i) => (objetIdx < 0 || i > objetIdx) && APPEL_RE.test(l));
  const headEnd = objetIdx >= 0 ? objetIdx : appelIdx >= 0 ? appelIdx : Math.min(trimmed.length, 30);

  // ── En-tête : lignes non vides avant l'objet, réparties entre les blocs.
  const left: string[] = [];
  const right: string[] = [];
  const refs: string[] = [];
  const dest: string[] = [];
  let lieu = "";
  let dateBlanche = false;
  let genre: Genre = "courrier";
  let mode: "left" | "right" | "dest" = "left";
  for (let i = 0; i < headEnd; i++) {
    const line = trimmed[i];
    if (!line) continue;
    const cols = colonnes(raw[i].trim());
    const l = cols ? cols[0] : line;
    if (cols && (REPUBLIQUE_RE.test(cols[1]) || DEVISE_RE.test(cols[1]) || SEPARATEUR_RE.test(cols[1]))) {
      right.push(cols[1]);
    }
    if (isDateLine(l)) {
      const m = l.match(DATE_LINE_RE)!;
      lieu = m[1].trim();
      dateBlanche = !m[2];
      if (mode === "right") mode = "left";
      continue;
    }
    if (REF_RE.test(l) || CODE_RE.test(l)) {
      refs.push(l.replace(/\s{2,}/g, " "));
      if (mode === "dest") mode = "left";
      continue;
    }
    if (/^NOTE\s+(A|À)\b/i.test(l)) {
      genre = "note";
      mode = "dest";
      dest.push(l);
      continue;
    }
    if (/^(A|À)$/.test(l) || (mode !== "dest" && !dest.length && CIVILITE_RE.test(l) && !APPEL_RE.test(l))) {
      mode = "dest";
      dest.push(l);
      continue;
    }
    if (REPUBLIQUE_RE.test(l)) {
      mode = "right";
      right.push(l);
      continue;
    }
    if (mode === "right" && (DEVISE_RE.test(l) || SEPARATEUR_RE.test(l)) && right.length < 4) {
      right.push(l);
      if (SEPARATEUR_RE.test(l)) mode = "left";
      continue;
    }
    if (mode === "dest") {
      if (dest.length < 8) dest.push(l);
      continue;
    }
    mode = "left";
    left.push(l);
  }
  // La ville en capitales espacées (« A B I D J A N ») reste séparée du reste par une ligne vide.
  const destinataire = dest
    .map((l, i) => (i > 0 && /^([A-ZÀ-Ý] ){2,}[A-ZÀ-Ý]$/.test(l) ? `\n${l}` : l))
    .join("\n");

  // ── Objet, éventuellement sur deux lignes.
  let objet = "";
  let bodyStart = appelIdx >= 0 ? appelIdx + 1 : headEnd;
  if (objetIdx >= 0) {
    const parts = [trimmed[objetIdx].replace(/^objet\s*:\s*/i, "")];
    let j = objetIdx + 1;
    for (; j < trimmed.length && j < objetIdx + 6; j++) {
      const l = trimmed[j];
      if (!l) continue;
      if (APPEL_RE.test(l) || l.length > 70 || /[.:]$/.test(parts[parts.length - 1]) || /^(p\.\s?j|r[ée]f)/i.test(l)) break;
      parts.push(l);
    }
    objet = parts.join(" ").replace(/\s+/g, " ").trim();
    if (appelIdx < 0) bodyStart = j;
  }

  // ── Corps jusqu'à la formule de politesse (ou « Vos instructions m'obligeraient. »).
  const politesseIdx = trimmed.findIndex((l, i) => i >= bodyStart && POLITESSE_RE.test(l));
  const bodyEnd = politesseIdx >= 0 ? politesseIdx : trimmed.length;
  const pj = trimmed.find((l) => /^(p\.\s?j\.?|pi[èe]ces? jointes?)\s*:/i.test(l))?.replace(/^[^:]*:\s*/, "") ?? "";
  const corps = trimmed
    .slice(bodyStart, bodyEnd)
    .join("\n")
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter((p) => p && !/^(p\.\s?j\.?|pi[èe]ces? jointes?)\s*:/i.test(p));

  // ── Politesse, signature tapée, ampliation. On s'arrête si l'en-tête se répète (deuxième courrier du fichier).
  let politesse = "";
  const signature: string[] = [];
  const ampliation: string[] = [];
  if (politesseIdx >= 0) {
    let k = politesseIdx;
    const pol: string[] = [];
    for (; k < trimmed.length; k++) {
      if (!trimmed[k]) {
        if (pol.length) break;
        continue;
      }
      pol.push(trimmed[k]);
      if (/\.\s*$/.test(trimmed[k])) break;
    }
    politesse = pol.join(" ");
    let inAmpliation = false;
    for (k = k + 1; k < trimmed.length; k++) {
      const l = trimmed[k];
      if (!l) continue;
      if (l === first) break;
      const amp = l.match(AMPLIATION_RE);
      if (amp) {
        inAmpliation = true;
        if (amp[2]) ampliation.push(amp[2]);
        continue;
      }
      if (inAmpliation) {
        if (ampliation.length < 8) ampliation.push(l);
      } else if (signature.length < 5) signature.push(l);
    }
  }

  return {
    genre,
    entete: left.join("\n"),
    enteteDroite: right.join("\n"),
    refs: refs.join("\n"),
    lieu,
    dateBlanche,
    destinataire,
    objet,
    pj,
    appel: appelIdx >= 0 ? trimmed[appelIdx] : "",
    corps,
    politesse,
    signature: signature.join("\n"),
    ampliation: ampliation.join("\n"),
  };
}

const TYPES: [RegExp, string][] = [
  [/mise en demeure/i, "Mise en demeure"],
  [/convoqu|convocation/i, "Convocation"],
  [/\b(relance|second courrier|sans r[ée]ponse)\b/i, "Relance"],
  [/\b(atteste|attestation|certifie)\b/i, "Attestation"],
  [/(pas possible de r[ée]server une suite favorable|d[ée]favorable|rejet|refus|ne peut (?:[êe]tre )?(?:appliqu|impl[ée]ment|accord|retenu|admis|recevoir))/i, "Réponse défavorable"],
  [/(faire viser|r[ée]gularis|je vous sugg[èe]re de)/i, "Demande de régularisation"],
  [/(suite favorable|accord[ée]e?|j'ai le plaisir)/i, "Réponse favorable"],
  [/\b(transmets|transmission|bordereau|je vous prie de trouver ci-joint)\b/i, "Transmission"],
  [/(en r[ée]ponse|par courrier|par lettre|par soit transmis|suite à votre|vous avez sollicit)/i, "Réponse à une demande"],
];

export function typeDeCourrier(text: string, genre: Genre = "courrier"): string {
  if (genre === "note") {
    if (/d[ée]favorable|ne peut|irr[ée]gularit[ée]s? (?:ont|a) [ée]t[ée]/i.test(text)) return "Note – avis défavorable";
    if (/favorable|aucune irr[ée]gularit/i.test(text)) return "Note – avis favorable";
    return "Note au Directeur";
  }
  for (const [re, label] of TYPES) if (re.test(text)) return label;
  return "Courrier";
}

const TOURNURES = [
  "J'ai l'honneur",
  "Par courrier",
  "Par soit transmis",
  "Par décision",
  "En réponse",
  "porter à votre connaissance",
  "Après analyse",
  "Après vérification",
  "il ressort",
  "Or,",
  "Au vu de ce qui précède",
  "Au regard de ce qui précède",
  "Au total",
  "Par conséquent",
  "Toutefois",
  "je vous suggère",
  "Je vous prie de bien vouloir",
  "Vos instructions m'obligeraient",
];

/** Lecture d'un courrier signé en mode démo. */
export function analyserSigneDemo(text: string) {
  const b = decouperCourrier(text);
  const corps = b.corps.join("\n\n");
  const relevees = TOURNURES.filter((t) => corps.toLowerCase().includes(t.toLowerCase()) || b.politesse.includes(t));
  const moy = b.corps.length ? Math.round(corps.split(/\s+/).length / b.corps.length) : 0;
  const style = [
    relevees.length ? `Tournures relevées : ${relevees.map((t) => `« ${t}… »`).join(", ")}.` : "",
    b.corps.length ? `${b.corps.length} paragraphe${b.corps.length > 1 ? "s" : ""} d'environ ${moy} mots.` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    genre: b.genre,
    type: typeDeCourrier(`${b.objet}\n${corps}`, b.genre),
    objet: b.objet,
    resume: sentences(corps)[0] ?? "",
    entete: b.entete,
    enteteDroite: b.enteteDroite,
    refs: b.refs,
    lieu: b.lieu,
    dateBlanche: b.dateBlanche,
    destinataire: b.destinataire,
    appel: b.appel,
    politesse: b.politesse,
    signature: b.signature,
    ampliation: b.ampliation,
    style,
  };
}

const DEMANDE_RE = /(je sollicite|je demande|je souhaite|je vous prie de|je vous serais reconnaissante?|pourriez-vous|pouvez-vous|merci de|je vous saurais gr[ée]|vous demande|solliciter|je me permets|serait-il possible|pour visa|aux fins de|en vue de)/i;
const IMPUTATION_RE = /(imput[ée]|imputation|pour attribution|pour suite [àa] donner|pour r[ée]ponse|pour avis|projet de r[ée]ponse|sous ma signature|[àa] la signature|pour information|pour traitement|urgent|me rendre compte|en parler|pour analyse|note explicative)/i;
const ECHEANCE_RE = /(avant le|au plus tard|dans un d[ée]lai|d[ée]lai\s*:|sous (?:\d+|quinze|huit|dix) (?:jours|heures)|\d+\s*(?:heures|h)\b|d'ici le|date limite|[ée]ch[ée]ance)/i;
const INSTITUTION_RE = /^(Centre|Universit[ée]|Fonds|Office|Agence|Institut|[ÉE]cole|Direction|Soci[ée]t[ée]|Caisse|Conseil|Mairie|Commune|Pr[ée]fecture|H[ôo]pital|CHU|Minist[èe]re|Cellule|Autorit[ée]|Haute|Lyc[ée]e|Coll[èe]ge|Programme|Projet)\b/i;
const TITRE_RE = /^(Le|La)\s+(Directeur|Directrice|Pr[ée]sident|Pr[ée]sidente|Maire|Doyen|Recteur|Rectrice|Secr[ée]taire g[ée]n[ée]ral|Administrateur|Administratrice|Chef|Coordonnateur|Coordonnatrice|Ministre|Pr[ée]fet)\b.*$/i;

function preposition(institution: string): string {
  if (/^[aeiouyhéèêâîôûœ]/i.test(institution)) return "de l'";
  if (/^(Direction|Soci[ée]t[ée]|Caisse|Mairie|Commune|Pr[ée]fecture|Cour|Chambre|Banque|Mutuelle|Cellule|Haute)\b/i.test(institution)) return "de la ";
  return "du ";
}

/** Ville d'expédition : « Bouaké, le 3 novembre 2026 », même collée aux références dans un PDF. */
function villeDuCourrier(text: string, b: ReturnType<typeof decouperCourrier>): string {
  if (b.lieu && !/^(le|la)$/i.test(b.lieu)) return b.lieu;
  const head = text.split("\n").slice(0, 30).join("\n");
  return head.match(new RegExp(`(?<![/\\p{L}])(\\p{Lu}[\\p{L}'-]+(?: \\p{Lu}[\\p{L}'-]+)?),\\s*le\\s+\\d{1,2}(?:er)?\\s+(?:${MOIS_RE})`, "u"))?.[1] ?? "";
}

/** Sigle de l'organisme cité dans le corps : « du CROU-B », « de l'UNA ». */
function sigleDuCourrier(text: string): string {
  const m = sentences(text).join(" ").match(/\b(?:du|de la|de l'|l'|au|le|la)\s*([A-Z][A-Z0-9]{1,9}(?:-[A-Z0-9]{1,4})?)\b(?![a-zà-ÿ])/);
  return m && !/^(MFB|DGBF|DCB|FCFA|MESRS|CFA)$/.test(m[1]) ? m[1] : "";
}

type Expediteur = { titre: string; institution: string; sigle: string; ville: string };

function expediteurDuCourrier(text: string, b: ReturnType<typeof decouperCourrier>): Expediteur | null {
  const lignes = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const head = lignes.slice(0, 25);
  const institution = head.find((l) => INSTITUTION_RE.test(l) && !/^Minist[èe]re/i.test(l) && l.length < 120);
  const titreLigne = [...b.signature.split("\n"), ...head].map((l) => l.trim()).find((l) => TITRE_RE.test(l));
  if (!institution || !titreLigne) return null;
  const m = titreLigne.match(TITRE_RE)!;
  return {
    titre: `${m[1].toLowerCase() === "la" ? "la" : "le"} ${m[2][0].toUpperCase()}${m[2].slice(1).toLowerCase()}`,
    institution: institution.replace(/[,;]$/, ""),
    sigle: sigleDuCourrier(text),
    ville: villeDuCourrier(text, b),
  };
}

/** Bloc destinataire de la réponse, à la manière des courriers signés : « A / Monsieur le Directeur / du … (SIGLE) / V I L L E ». */
function destinataireDepuisExpediteur(e: Expediteur | null): string {
  if (!e) return "";
  const civ = e.titre.startsWith("la ") ? "Madame la" : "Monsieur le";
  const sigle = e.sigle && !e.institution.includes(e.sigle) ? ` (${e.sigle})` : "";
  const ville = e.ville ? `\n\n${villeEspacee(e.ville)}` : "";
  return `A\n${civ} ${e.titre.replace(/^(le|la) /, "")}\n${preposition(e.institution)}${e.institution}${sigle}${ville}`;
}

/** « J'ai l'honneur de vous transmettre… » devient « Le Directeur du CROU-B transmet… ». */
function troisiemePersonne(phrase: string, sujet: string): string {
  const m = phrase.match(/^J'ai l'honneur de (?:vous )?(\p{L}+)\b\s*(.*)$/u);
  if (!m) return phrase;
  const verbe = m[1].toLowerCase();
  const conj = /mettre$/.test(verbe) ? verbe.replace(/mettre$/, "met") : /er$/.test(verbe) ? verbe.replace(/er$/, "e") : verbe;
  return `${sujet} ${conj}${m[2].startsWith(",") ? "" : " "}${m[2]}`.replace(/\s+/g, " ");
}

/** Analyse d'un dossier imputé en mode démo, à partir du texte lu dans les pièces. */
export function analyserDossierDemo(pieces: { nom: string; role: string; texte: string }[]): Analyse {
  const dossier = pieces.filter((p) => p.role === "dossier");
  const principal = dossier.find((p) => p.texte.length > 80) ?? pieces.find((p) => p.texte.length > 80);
  const text = principal?.texte ?? "";
  const all = pieces.map((p) => p.texte).join("\n\n");
  const b = decouperCourrier(text);

  const expediteur = expediteurDuCourrier(text, b);
  const demandeur = destinataireDepuisExpediteur(expediteur);
  const date = text.match(DATE_RE);
  const ref =
    text.match(/\bN°\s*([0-9][\w-]*\/[^\s,;]+)/)?.[1] ??
    text.match(/(?:n\s*\/\s*r[ée]f\.?|r[ée]f(?:[ée]rence)?|dossier n°)\s*[.:]?\s*([^\n]{2,60})/i)?.[1]?.trim() ??
    "";
  const ss = sentences(b.corps.join(" ") || text);
  const demandes = ss.filter((s) => DEMANDE_RE.test(s) || s.endsWith("?")).slice(0, 6);
  const lignesTout = all.split("\n").map((l) => l.trim());
  const instructionExplicite = all.match(/instructions?\s+(?:du|de M(?:onsieur|\.)\s+le)\s+directeur\s*:\s*([^\n]+(?:\n(?![^\n]*:)[^\n]+)*)/i)?.[1];
  const instruction =
    instructionExplicite?.replace(/\s+/g, " ").trim() ??
    lignesTout
      .filter((l) => IMPUTATION_RE.test(l) && l.length < 160 && !/^fiche d'imputation$/i.test(l) && !/^imput[ée]e? [àa]\b/i.test(l))
      .slice(0, 3)
      .join(" ");
  const echeance =
    lignesTout.find((l) => ECHEANCE_RE.test(l) && l.length < 120)?.replace(/^(d[ée]lai|[ée]ch[ée]ance)\s*:\s*/i, "") ??
    sentences(all).find((s) => ECHEANCE_RE.test(s)) ??
    "";
  const sansTexte = pieces.filter((p) => !p.texte.trim()).map((p) => p.nom);
  const dateTexte = date ? `${date[1]} ${date[2].toLowerCase()} ${date[3]}` : "";

  const points = [
    ...(sansTexte.length
      ? [
          `Pièces dont le texte n'a pas pu être lu (scan pâle ou photo floue) : ${sansTexte.join(", ")}. Déposez une version plus nette, ou le fichier Word.`,
        ]
      : []),
    demandeur ? "Vérifier le destinataire de la réponse." : "Compléter le destinataire de la réponse.",
    dateTexte ? "" : "Retrouver la date du courrier reçu.",
    ref ? "" : "Retrouver le numéro du courrier reçu.",
    instruction ? "" : "Relever l'instruction du Directeur portée sur la fiche d'imputation.",
  ].filter(Boolean);

  const sujet = expediteur
    ? `${expediteur.titre[0].toUpperCase()}${expediteur.titre.slice(1)} ${expediteur.sigle ? preposition(expediteur.sigle) + expediteur.sigle : preposition(expediteur.institution) + expediteur.institution}`
    : "L'expéditeur";
  const resume = ss
    .slice(0, 2)
    .map((x) => troisiemePersonne(x, sujet))
    .join(" ");

  return {
    resume: resume || "Aucun texte lisible dans les pièces.",
    demandeur,
    appel: demandeur ? appelDepuisDestinataire(demandeur) : "",
    dateCourrier: dateTexte,
    refCourrier: ref,
    objetCourrier: b.objet,
    demandes,
    instructionDirecteur: instruction,
    echeance,
    elements: pieces
      .filter((p) => p.role === "justificatif")
      .map((p) => `${p.nom} : ${sentences(p.texte)[0] ?? "pièce à examiner"}`),
    pieces: pieces.map((p) => ({ nom: p.nom, apport: sentences(p.texte)[0] ?? "Contenu non lu." })),
    pointsAVerifier: points,
    orientation: "Précisez dans les consignes la suite à donner : favorable, défavorable ou demande de régularisation.",
    objetReponse: b.objet ? (/^(votre|vos)\b/i.test(b.objet) ? b.objet : `Votre ${b.objet.charAt(0).toLowerCase()}${b.objet.slice(1)}`) : "",
    typeReponse: typeDeCourrier(dossier.map((p) => p.texte).join("\n\n") || all),
  };
}

/** La raison donnée après « Refuser : … » ou « Accorder, car … ». */
function motif(r: string): string {
  return r.replace(/^(car|parce que|puisque|en effet,?)\s+/i, "").replace(/[.;]\s*$/, "").trim();
}

/** « ne pas donner suite : le virement exige… » : la raison passe devant, avec « Or, », comme dans les courriers signés. */
function avecMotif(r: string, debut: string, lien = "Au regard de ce qui précède, il paraît indiqué de"): string {
  if (!r) return `${debut} [à compléter].`;
  const [action, ...raison] = r.split(/\s+:\s+/);
  return raison.length ? `Or, ${motif(raison.join(" : "))}. ${lien} ${action}.` : `${debut} ${r}.`;
}

const VERBES: [RegExp, (rest: string, genre: Genre) => string][] = [
  [/^(accepter|accorder|donner une suite favorable|valider|viser)\b\s*/i, (r, g) =>
    (r ? `L'examen du dossier fait ressortir que ${motif(r)}. ` : "") +
    (g === "note"
      ? `${r ? "Par conséquent" : "Au regard de ce qui précède"}, il paraît indiqué d'accorder une suite favorable à la demande.`
      : `${r ? "Par conséquent, j'ai" : "J'ai"} l'honneur de porter à votre connaissance qu'une suite favorable est réservée à votre demande.`)],
  [/^(refuser|rejeter|d[ée]cliner|ne pas donner suite)\b\s*/i, (r, g) =>
    (r ? `Or, ${motif(r)}. ` : "") +
    (g === "note"
      ? "Au regard de ce qui précède, il paraît indiqué de ne pas réserver une suite favorable à la demande."
      : "Au vu de ce qui précède, votre demande ne peut recevoir une suite favorable.")],
  [/^(sugg[ée]rer|inviter [àa]|conseiller)\b\s*(de\s+|d')?/i, (r) => avecMotif(r, "Toutefois, je vous suggère de", "A cet effet, je vous suggère de")],
  [/^(proposer)\b\s*(de\s+|d')?/i, (r) => avecMotif(r, "Au regard de ce qui précède, il paraît indiqué de")],
  [/^(demander|r[ée]clamer|solliciter)\b\s*/i, (r) => `Je vous saurais gré de bien vouloir me faire parvenir ${r || "[à compléter : pièces attendues]"}.`],
  [/^(rappeler)\b\s*(que\s+)?/i, (r) => `Je vous rappelle que ${r || "[à compléter]"}.`],
  [/^(informer|indiquer|pr[ée]ciser|signaler)\b\s*(que\s+)?/i, (r) => `J'ai l'honneur de porter à votre connaissance que ${r || "[à compléter]"}.`],
  [/^(transmettre|envoyer|joindre)\b\s*/i, (r) => `Je vous prie de trouver ci-joint ${r || "les pièces demandées"}.`],
];

/** Élision après « que » et « de » : « que aucune » devient « qu'aucune », « de informer » devient « d'informer ». */
function elider(t: string): string {
  return t.replace(/\b(qu|d)e ([aeiouyéèêëàâîïôûœAEIOUYÉÈÊÀÂÎÔÛŒ])/g, "$1'$2");
}

function phrase(consigne: string, genre: Genre): string {
  const c = consigne.trim().replace(/^[-•*]\s*/, "").replace(/[.;]\s*$/, "");
  for (const [re, build] of VERBES) {
    if (re.test(c)) return elider(build(c.replace(re, "").replace(/^[:,;–—-]\s*/, "").trim(), genre));
  }
  return `${c[0].toUpperCase()}${c.slice(1)}.`;
}

/** Sigle entre parenthèses dans un bloc destinataire : « (UNA) ». */
function sigle(dest: string): string | null {
  return dest.match(/\(([A-ZÀ-Ý0-9-]{2,})\)/)?.[1] ?? null;
}

/** « A / Monsieur le Directeur / du … (CROU-B) » devient « le Directeur du CROU-B ». */
function auteur(demandeur: string): string {
  const lignes = demandeur.split("\n").map((l) => l.trim()).filter(Boolean);
  const titre = lignes.find((l) => /^(Monsieur|Madame)\s+(le|la)\s+/i.test(l));
  const organisme = lignes.find((l) => /^(du|de la|de l'|des)\s*/i.test(l));
  if (!titre) return "[à compléter : auteur]";
  const qui = titre.replace(/^(Monsieur|Madame)\s+/i, "");
  const s = organisme ? sigle(organisme) : null;
  return `${qui}${organisme ? ` ${s ? preposition(s) + s : organisme}` : ""}`;
}

/** Projet de réponse ou de note en mode démo, assemblé à partir des consignes et de formules d'usage. */
export function redigerDemo(input: {
  genre: Genre;
  analyse: Analyse | null;
  consignes: string;
  ton: Ton;
  modele: { genre: Genre; appel: string; politesse: string; destinataire: string; ampliation: string } | null;
  pj: string[];
}): Redaction {
  const a = input.analyse;
  const note = input.genre === "note";
  // Un modèle d'un autre genre (une note pour un courrier, ou l'inverse) ne sert pas pour les formules.
  const modele = input.modele && input.modele.genre === input.genre ? input.modele : null;
  const destinataire = note
    ? modele?.destinataire || "NOTE A\nMONSIEUR LE DIRECTEUR"
    : a?.demandeur || "A\n[à compléter : destinataire]";
  const appel = note ? "" : a?.appel || "[à compléter : formule d'appel],";
  const corps: string[] = [];
  const acte = a?.refCourrier ? ` N°${a.refCourrier}` : "";
  const date = a?.dateCourrier ? ` en date du ${a.dateCourrier}` : "";
  const objet = a?.objetCourrier ? a.objetCourrier.charAt(0).toLowerCase() + a.objetCourrier.slice(1) : "";
  if (note) {
    corps.push(`Par courrier${acte}${date}, ${auteur(a?.demandeur ?? "")} a transmis ${objet ? `un dossier relatif à : ${objet}` : "[à compléter : objet]"}.`);
  } else {
    corps.push(`Par courrier${acte}${date}, vous m'avez transmis ${objet ? `votre ${objet.replace(/^(votre|vos)\s+/i, "")}` : "[à compléter : objet de votre demande]"}.`);
  }
  const consignes = input.consignes
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);
  const phrases = consignes.map((c) => phrase(c, input.genre));
  // Dans la note, la première observation suit « Après analyse, il ressort que… » au lieu d'un « Or, » isolé.
  if (note && phrases.length) {
    const m = phrases[0].match(/^(?:Or, |L'examen du dossier fait ressortir que )(.+)$/s);
    const libre = !VERBES.some(([re]) => re.test(consignes[0].replace(/^[-•*]\s*/, "")));
    if (m) phrases[0] = `Après analyse, il ressort que ${m[1]}`;
    else if (libre) phrases[0] = elider(`Après analyse, il ressort que ${phrases[0].charAt(0).toLowerCase()}${phrases[0].slice(1)}`);
  }
  if (phrases.length) corps.push(...phrases);
  else corps.push("[à compléter : analyse et réponse sur le fond. Indiquez vos consignes pour que Le rédacteur la prépare.]");
  if (input.ton === "ferme" && !note) corps.push("Je vous demande de bien vouloir prendre les dispositions nécessaires dans les meilleurs délais.");

  const politesse = note
    ? modele?.politesse || FORMULE_NOTE
    : modele?.politesse
      ? adapterPolitesse(modele.politesse, modele.appel, appel)
      : politesseDefaut(appel);

  // L'ampliation du modèle est adaptée au nouveau destinataire (« Contrôleur Budgétaire UNA » devient « … CROU-K »).
  let ampliation = modele?.ampliation?.split("\n").filter(Boolean) ?? [];
  const ancien = modele ? sigle(modele.destinataire) : null;
  const nouveau = sigle(destinataire);
  if (ancien && nouveau) ampliation = ampliation.map((l) => l.replaceAll(ancien, nouveau));
  else if (ancien) ampliation = ampliation.map((l) => (l.includes(ancien) ? l.replace(ancien, "[à compléter]") : l));

  return {
    objet: (note ? a?.objetCourrier : a?.objetReponse) || "[à compléter : objet]",
    vref: "",
    destinataire,
    appel,
    corps,
    politesse,
    pj: input.pj,
    ampliation: note ? [] : ampliation,
    remarques: [
      "Projet assemblé à partir de vos consignes et des formules de vos courriers signés : complétez et relisez le fond avant signature.",
      ...(a?.pointsAVerifier.filter((p) => !p.startsWith("Mode démo")) ?? []),
    ],
  };
}

/** Retouches possibles sans IA. */
export function retoucherDemo(r: Redaction, instruction: string): Redaction | null {
  const i = instruction.toLowerCase();
  if (/court|bref|concis|r[ée]sum/.test(i)) {
    return { ...r, corps: r.corps.filter((p) => !/^Je vous demande de bien vouloir prendre les dispositions/.test(p)) };
  }
  if (/ferme|s[ée]v[èe]re|strict/.test(i)) {
    return {
      ...r,
      corps: r.corps.map((p) =>
        p
          .replace(/Je vous saurais gré de bien vouloir/g, "Je vous demande de")
          .replace(/Je vous prie de bien vouloir/g, "Je vous demande de")
          .replace(/je vous suggère de/g, "je vous demande de"),
      ),
    };
  }
  if (/courtois|doux|aimable|poli/.test(i)) {
    return {
      ...r,
      corps: r.corps.map((p) => p.replace(/Je vous demande de/g, "Je vous saurais gré de bien vouloir").replace(/je vous demande de/g, "je vous suggère de")),
    };
  }
  return null;
}
