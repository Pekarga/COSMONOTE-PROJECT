/**
 * Consignes et formats de réponse communs aux deux rédacteurs : le modèle installé sur l'ordinateur
 * (lib/local.ts) et, pour une installation web avec clé, Claude (lib/claude.ts).
 */
import { z } from "zod";
import { REGLES_ANTI_IA } from "./relecture";
import { REGLES_REDACTION } from "./style";
import type { Analyse, Genre, Redaction, Signe, Ton } from "./types";

export const ROLE = `Tu es « Le rédacteur », un rédacteur administratif chevronné, rompu à la correspondance administrative en français. Tu travailles pour un agent qui reçoit des dossiers imputés par son directeur et prépare les projets de réponse qu'il fera signer.`;

/* ───────────── Analyse d'un dossier imputé ───────────── */

export const AnalyseSchema = z.object({
  resume: z.string().describe("L'essentiel du dossier en 2 à 4 phrases"),
  demandeur: z.string().describe("À qui répondre : l'expéditeur du courrier reçu (l'organisme qui écrit et son responsable), jamais la direction de l'agent qui reçoit ce courrier. Présenté en bloc destinataire comme dans les courriers signés de l'agent, une ligne par ligne : « A », la qualité (« Monsieur le Directeur »), l'organisme avec son sigle (« du Centre Régional des Œuvres Universitaires de KORHOGO (CROU-K) »), une ligne vide, puis la ville en capitales espacées (« K O R H O G O »)"),
  appel: z.string().describe("La formule d'appel à employer dans la réponse, par exemple « Monsieur le Directeur, »"),
  date_courrier: z.string().describe("La date du courrier reçu, écrite en toutes lettres (« 3 novembre 2026 »), vide si inconnue"),
  ref_courrier: z.string().describe("La référence du courrier reçu, qui deviendra « V/Réf. » dans la réponse, vide si aucune"),
  objet_courrier: z.string().describe("L'objet du courrier reçu"),
  demandes: z.array(z.string()).describe("Ce que le demandeur demande, une demande par élément"),
  instruction_directeur: z.string().describe("L'instruction du directeur portée sur le dossier ou la fiche d'imputation (annotation, cachet, mention « pour réponse », « sous ma signature », délai…), vide si aucune"),
  echeance: z.string().describe("Le délai de réponse ou la date limite s'il y en a un, vide sinon"),
  elements: z.array(z.string()).describe("Les faits et éléments utiles à la réponse, tirés des pièces et des justificatifs"),
  pieces: z.array(z.object({ nom: z.string(), apport: z.string() })).describe("Pour chaque pièce, son nom et ce qu'elle apporte au dossier"),
  points_a_verifier: z.array(z.string()).describe("Ce que l'agent doit vérifier ou compléter avant de répondre"),
  orientation: z.string().describe("La réponse que tu proposes, en 2 ou 3 phrases, en tenant compte de l'instruction du directeur"),
  objet_reponse: z.string().describe("L'objet proposé pour la réponse"),
  type_reponse: z.string().describe("La catégorie de la réponse : « Réponse favorable », « Réponse défavorable », « Demande de régularisation », « Demande de pièces », « Transmission »…"),
});

export const CONSIGNE_ANALYSE = `On te confie un dossier imputé par le directeur : le courrier reçu, souvent la fiche d'imputation ou l'annotation du directeur, et des pièces justificatives. Analyse-le pour préparer la réponse.
- Appuie-toi uniquement sur les pièces. N'invente ni noms, ni dates, ni montants, ni textes de loi.
- Lis avec soin les annotations manuscrites et les cachets : l'instruction du directeur oriente la réponse.
- Vérifie les montants, les dates et la cohérence entre les pièces ; signale dans « points_a_verifier » ce qui manque ou paraît incohérent.
- Présente le destinataire et la formule d'appel comme dans les courriers signés de l'agent, fournis ci-dessous.`;

export function analyseDepuis(out: z.infer<typeof AnalyseSchema>): Analyse {
  return {
    resume: out.resume,
    demandeur: out.demandeur,
    appel: out.appel,
    dateCourrier: out.date_courrier,
    refCourrier: out.ref_courrier,
    objetCourrier: out.objet_courrier,
    demandes: out.demandes,
    instructionDirecteur: out.instruction_directeur,
    echeance: out.echeance,
    elements: out.elements,
    pieces: out.pieces,
    pointsAVerifier: out.points_a_verifier,
    orientation: out.orientation,
    objetReponse: out.objet_reponse,
    typeReponse: out.type_reponse,
  };
}

/* ───────────── Rédaction ───────────── */

export const RedactionSchema = z.object({
  objet: z.string().describe("L'objet du courrier, sans le mot « Objet : »"),
  vref: z.string().describe("La référence du courrier auquel on répond (V/Réf.), vide si aucune"),
  destinataire: z.string().describe("Le bloc destinataire, une ligne par ligne"),
  appel: z.string().describe("La formule d'appel, par exemple « Madame, »"),
  corps: z.array(z.string()).describe("Les paragraphes du corps du courrier, dans l'ordre, sans la formule d'appel ni la formule de politesse"),
  politesse: z.string().describe("La formule de politesse, qui reprend la formule d'appel"),
  pj: z.array(z.string()).describe("Les pièces jointes, une par élément, vide s'il n'y en a pas"),
  ampliation: z.array(z.string()).describe("Les destinataires en copie (« Ampliation »), comme dans les courriers signés de même nature, vide pour une note ou s'il n'y en a pas"),
  remarques: z.array(z.string()).describe("Pour l'agent : les points à vérifier ou à compléter avant signature, et chaque [à compléter] laissé dans le texte"),
});

export const CONSIGNE_REDACTION = `Tu rédiges des projets de courriers administratifs que l'agent relira puis fera signer.

${REGLES_REDACTION}

${REGLES_ANTI_IA}

- Les courriers déjà signés par l'agent, fournis ci-dessous, sont ta référence : reprends leur ton, leur vocabulaire, leurs formules d'appel et de politesse, la longueur de leurs paragraphes et leurs habitudes. Ils priment sur les règles générales quand ils diffèrent.
- Suis l'instruction du directeur portée sur le dossier, puis les consignes de l'agent.
- Rédige seulement l'objet, le destinataire, la formule d'appel, le corps, la formule de politesse (ou la formule finale d'une note), les pièces jointes et l'ampliation : l'en-tête, les références, la date et la signature viennent de la mise en page.`;

/** Les courriers signés, en exemples de style. limite : nombre de caractères gardés par courrier. */
export function exemplesTexte(modeles: Signe[], limite = Infinity): string {
  if (!modeles.length) {
    return "<courriers_signes>(aucun courrier signé déposé pour l'instant : applique les usages de la correspondance administrative)</courriers_signes>";
  }
  const exemples = modeles
    .map((m, i) => {
      let texte = m.texte.trim() || [m.destinataire, m.appel, m.politesse, m.ampliation].join("\n");
      if (texte.length > limite) texte = `${texte.slice(0, limite).replace(/\s+\S*$/, "")}\n[…]`;
      return `<courrier_signe numero="${i + 1}" genre="${m.genre}" type="${m.type}">\n${texte}\n</courrier_signe>`;
    })
    .join("\n\n");
  return `<courriers_signes>\n${exemples}\n</courriers_signes>`;
}

export const TONS: Record<Ton, string> = {
  courtois: "courtois et neutre",
  ferme: "ferme, sans être désobligeant",
  bienveillant: "bienveillant et attentif à la situation de la personne",
};

export type DemandeRedaction = {
  genre: Genre;
  analyse: Analyse | null;
  consignes: string;
  ton: Ton;
  pj: string[];
  modeles: Signe[];
  miseEnPage: { entete: string; signature: string; destinataire: string };
  date: string;
};

/** Ce qui est demandé au rédacteur pour un courrier ou une note, après les pièces. */
export function briefRedaction(input: DemandeRedaction): string {
  const quoi =
    input.genre === "note"
      ? `Document à rédiger : une note au Directeur, qui expose le dossier, ton analyse et ta proposition, sans formule d'appel ni de politesse, et se termine par une formule finale comme dans les notes signées. Destinataire de la note : ${input.miseEnPage.destinataire || "NOTE A MONSIEUR LE DIRECTEUR"}.`
      : "Document à rédiger : le courrier de réponse au demandeur, à la signature du Directeur.";
  return [
    quoi,
    `<analyse_du_dossier>\n${JSON.stringify(input.analyse ?? {}, null, 2)}\n</analyse_du_dossier>`,
    `<mise_en_page>\nExpéditeur :\n${input.miseEnPage.entete}\n\nSignataire :\n${input.miseEnPage.signature || "(signature manuscrite)"}\n\nDate : ${input.date || "laissée en blanc, complétée à la signature"}\n</mise_en_page>`,
    `<consignes_de_l_agent>\n${input.consignes.trim() || "(aucune consigne : appuie-toi sur l'analyse et l'instruction du directeur)"}\n</consignes_de_l_agent>`,
    `Ton demandé : ${TONS[input.ton]}.`,
    input.pj.length ? `Pièces à joindre (P.J.) : ${input.pj.join(" ; ")}.` : "",
    input.genre === "note" ? "Rédige la note." : "Rédige le projet de réponse.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Demande de retouche d'un projet existant. */
export function consigneRetouche(courrier: Redaction, instruction: string): string {
  return `<courrier_actuel>\n${JSON.stringify(courrier, null, 2)}\n</courrier_actuel>

<demande_de_l_agent>\n${instruction}\n</demande_de_l_agent>

Applique la demande de l'agent au courrier actuel. Garde tel quel tout ce que la demande ne concerne pas, y compris les passages que l'agent a lui-même écrits. Renvoie le courrier complet.`;
}

/** Champs attendus, avec leur description, pour un modèle qui ne voit pas le schéma. */
export function champsAttendus(schema: z.ZodObject): string {
  return Object.entries(schema.shape)
    .map(([cle, champ]) => {
      const t = champ as z.ZodType;
      const liste = t instanceof z.ZodArray ? " (liste)" : "";
      return `- « ${cle} »${liste} : ${t.description ?? ""}`;
    })
    .join("\n");
}
