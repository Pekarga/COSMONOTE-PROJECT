import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CLAUDE_MODEL, anthropicKey } from "./config";
import { REGLES_REDACTION } from "./style";
import type { Analyse, Genre, Redaction, Signe } from "./types";

let client: { key: string | null; instance: Anthropic } | null = null;
function getClient(): Anthropic {
  // La clé peut changer depuis la page Réglages : on recrée le client si besoin.
  const key = anthropicKey();
  if (!client || client.key !== key) {
    client = { key, instance: key ? new Anthropic({ apiKey: key }) : new Anthropic() };
  }
  return client.instance;
}

export type Block = Anthropic.Beta.BetaContentBlockParam;

/**
 * Envoie une demande à Claude et renvoie la réponse structurée.
 * En streaming, pour ne pas buter sur le délai des longues réponses.
 * Si le modèle principal décline, l'API relance la demande sur un modèle de repli.
 */
async function ask<S extends z.ZodType>(opts: {
  schema: S;
  system: Anthropic.Beta.BetaTextBlockParam[];
  content: Block[];
  effort: "low" | "medium" | "high";
}): Promise<z.infer<S>> {
  const stream = getClient().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: opts.effort, format: betaZodOutputFormat(opts.schema) },
    system: opts.system,
    messages: [{ role: "user", content: opts.content }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === "refusal") throw new Error("Claude n'a pas pu traiter ce contenu.");
  if (message.stop_reason === "max_tokens") throw new Error("La réponse de Claude a été coupée : le dossier est peut-être trop long.");
  const out = message.parsed_output as z.infer<S> | null | undefined;
  if (!out) throw new Error("La réponse de Claude n'a pas pu être lue.");
  return out;
}

const ROLE = `Tu es « Le rédacteur », un rédacteur administratif chevronné de la fonction publique française. Tu travailles pour un agent qui reçoit des dossiers imputés par son directeur et prépare les projets de réponse qu'il fera signer.`;

/* ───────────── Lecture d'un courrier signé ───────────── */

const SigneSchema = z.object({
  type_courrier: z
    .string()
    .describe("Catégorie courte : « Réponse à une demande », « Réponse défavorable », « Convocation », « Relance », « Mise en demeure », « Attestation », « Transmission », « Demande de pièces », « Notification de décision »…"),
  objet: z.string().describe("L'objet du courrier, sans le mot « Objet : »"),
  resume: z.string().describe("Ce que dit le courrier, en une phrase"),
  genre: z.enum(["courrier", "note"]).describe("« note » pour une note adressée à un supérieur (« NOTE A MONSIEUR LE DIRECTEUR… »), « courrier » sinon"),
  entete: z.string().describe("Le timbre ou bloc d'en-tête de gauche (ministère, direction générale, direction, « LE DIRECTEUR »…), une ligne par ligne, séparateurs « ______ » compris, sans le logo"),
  entete_droite: z.string().describe("Le bloc d'en-tête de droite s'il existe (« REPUBLIQUE DE COTE D'IVOIRE / Union – Discipline – Travail / ______ »), une ligne par ligne, vide sinon"),
  refs: z.string().describe("Les lignes de références et de contact sous l'en-tête (« N°______/MFB/DGBF/DCB/… », Affaire suivie par, Tél., Courriel…), recopiées telles quelles, blancs compris"),
  lieu: z.string().describe("La ville de la ligne de date (« Abidjan » pour « Abidjan, le … »)"),
  date_en_blanc: z.boolean().describe("Vrai si la date est laissée en blanc pour être complétée à la signature (« Abidjan, le » sans date)"),
  destinataire: z.string().describe("Le bloc destinataire, une ligne par ligne, tel qu'il est présenté (par exemple « A », la qualité, l'organisme, une ligne vide puis la ville en capitales espacées) ; pour une note, la ligne « NOTE A … »"),
  appel: z.string().describe("La formule d'appel, par exemple « Monsieur le Directeur, », vide pour une note"),
  politesse: z.string().describe("La formule de politesse complète, ou la formule finale d'une note (« Vos instructions m'obligeraient. »)"),
  signature: z.string().describe("Le bloc de signature tapé (mention de délégation, qualité, prénom et nom), une ligne par ligne ; vide s'il n'y en a pas"),
  ampliation: z.string().describe("Les destinataires en copie listés sous « Ampliation » ou « Copie à », un par ligne, vide s'il n'y en a pas"),
  pied: z.string().describe("Le pied de page (adresse, téléphone, courriel), vide s'il n'y en a pas"),
  style: z.string().describe("En 2 à 4 phrases : le ton, les tournures récurrentes, la longueur des paragraphes, les habitudes de mise en forme"),
});

const SigneAvecTexteSchema = SigneSchema.extend({
  texte: z.string().describe("Le texte intégral du courrier, retranscrit fidèlement, paragraphes séparés par une ligne vide"),
});

export type SigneLu = Pick<
  Signe,
  | "type"
  | "objet"
  | "resume"
  | "genre"
  | "entete"
  | "enteteDroite"
  | "refs"
  | "lieu"
  | "dateBlanche"
  | "destinataire"
  | "appel"
  | "politesse"
  | "signature"
  | "ampliation"
  | "pied"
  | "style"
> & { texte?: string };

/** Lit un courrier signé. Sans texte déjà extrait, Claude le retranscrit aussi. */
export async function analyserSigneClaude(source: Block[], texteConnu: boolean): Promise<SigneLu> {
  const schema = texteConnu ? SigneSchema : SigneAvecTexteSchema;
  const out = (await ask({
    schema,
    effort: "medium",
    system: [
      {
        type: "text",
        text: `${ROLE}
On te confie un courrier que l'agent a déjà signé. Il servira de modèle pour les prochains courriers : relève fidèlement sa mise en page, ses formules et son style. Reprends le texte tel qu'il est écrit, sans le corriger. Laisse un champ vide s'il n'existe pas dans le courrier.`,
      },
    ],
    content: [...source, { type: "text", text: "Voici le courrier signé à étudier." }],
  })) as z.infer<typeof SigneAvecTexteSchema>;
  return {
    type: out.type_courrier,
    objet: out.objet,
    resume: out.resume,
    genre: out.genre,
    entete: out.entete,
    enteteDroite: out.entete_droite,
    refs: out.refs,
    lieu: out.lieu,
    dateBlanche: out.date_en_blanc,
    destinataire: out.destinataire,
    appel: out.appel,
    politesse: out.politesse,
    signature: out.signature,
    ampliation: out.ampliation,
    pied: out.pied,
    style: out.style,
    texte: out.texte,
  };
}

/* ───────────── Analyse d'un dossier imputé ───────────── */

const AnalyseSchema = z.object({
  resume: z.string().describe("L'essentiel du dossier en 2 à 4 phrases"),
  demandeur: z.string().describe("À qui répondre, sous forme de bloc destinataire présenté comme dans les courriers signés de l'agent s'il y en a (par exemple « A / Monsieur le Directeur / du Centre Régional des Œuvres Universitaires de KORHOGO (CROU-K) / ligne vide / K O R H O G O »), une ligne par ligne"),
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

export async function analyserDossierClaude(pieces: Block[], modeles: Signe[]): Promise<Analyse> {
  const out = await ask({
    schema: AnalyseSchema,
    effort: "medium",
    system: [
      {
        type: "text",
        text: `${ROLE}
On te confie un dossier imputé par le directeur : le courrier reçu, souvent la fiche d'imputation ou l'annotation du directeur, et des pièces justificatives. Analyse-le pour préparer la réponse.
- Appuie-toi uniquement sur les pièces. N'invente ni noms, ni dates, ni montants, ni textes de loi.
- Lis avec soin les annotations manuscrites et les cachets : l'instruction du directeur oriente la réponse.
- Vérifie les montants, les dates et la cohérence entre les pièces ; signale dans « points_a_verifier » ce qui manque ou paraît incohérent.
- Présente le destinataire et la formule d'appel comme dans les courriers signés de l'agent, fournis ci-dessous.`,
      },
      exemplesBlock(modeles),
    ],
    content: [...pieces, { type: "text", text: "Voici les pièces du dossier. Analyse-le." }],
  });
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

const RedactionSchema = z.object({
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

/** Les courriers signés servent d'exemples de style. Bloc mis en cache : il change peu. */
function exemplesBlock(modeles: Signe[]): Anthropic.Beta.BetaTextBlockParam {
  const exemples = modeles
    .map(
      (m, i) =>
        `<courrier_signe numero="${i + 1}" genre="${m.genre}" type="${m.type}">\n${m.texte.trim() || [m.destinataire, m.appel, m.politesse, m.ampliation].join("\n")}\n</courrier_signe>`,
    )
    .join("\n\n");
  return {
    type: "text",
    text: modeles.length
      ? `<courriers_signes>\n${exemples}\n</courriers_signes>`
      : "<courriers_signes>(aucun courrier signé déposé pour l'instant : applique les usages de la correspondance administrative)</courriers_signes>",
    cache_control: { type: "ephemeral" },
  };
}

function systemeRedaction(modeles: Signe[]): Anthropic.Beta.BetaTextBlockParam[] {
  return [
    {
      type: "text",
      text: `${ROLE}
Tu rédiges des projets de courriers administratifs que l'agent relira puis fera signer.

${REGLES_REDACTION}
- Les courriers déjà signés par l'agent, fournis ci-dessous, sont ta référence : reprends leur ton, leur vocabulaire, leurs formules d'appel et de politesse, la longueur de leurs paragraphes et leurs habitudes. Ils priment sur les règles générales quand ils diffèrent.
- Suis l'instruction du directeur portée sur le dossier, puis les consignes de l'agent.
- Rédige seulement l'objet, le destinataire, la formule d'appel, le corps, la formule de politesse (ou la formule finale d'une note), les pièces jointes et l'ampliation : l'en-tête, les références, la date et la signature viennent de la mise en page.`,
    },
    exemplesBlock(modeles),
  ];
}

const TONS = {
  courtois: "courtois et neutre",
  ferme: "ferme, sans être désobligeant",
  bienveillant: "bienveillant et attentif à la situation de la personne",
};

export async function redigerClaude(input: {
  genre: Genre;
  pieces: Block[];
  analyse: Analyse | null;
  consignes: string;
  ton: keyof typeof TONS;
  pj: string[];
  modeles: Signe[];
  miseEnPage: { entete: string; signature: string; destinataire: string };
  date: string;
}): Promise<Redaction> {
  const quoi =
    input.genre === "note"
      ? `Document à rédiger : une note au Directeur, qui expose le dossier, ton analyse et ta proposition, sans formule d'appel ni de politesse, et se termine par une formule finale comme dans les notes signées. Destinataire de la note : ${input.miseEnPage.destinataire || "NOTE A MONSIEUR LE DIRECTEUR"}.`
      : "Document à rédiger : le courrier de réponse au demandeur, à la signature du Directeur.";
  const brief = [
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
  const out = await ask({
    schema: RedactionSchema,
    effort: "high",
    system: systemeRedaction(input.modeles),
    content: [...input.pieces, { type: "text", text: brief }],
  });
  return out;
}

export async function retoucherClaude(input: {
  courrier: Redaction;
  instruction: string;
  modeles: Signe[];
}): Promise<Redaction> {
  return ask({
    schema: RedactionSchema,
    effort: "medium",
    system: systemeRedaction(input.modeles),
    content: [
      {
        type: "text",
        text: `<courrier_actuel>\n${JSON.stringify(input.courrier, null, 2)}\n</courrier_actuel>

<demande_de_l_agent>\n${input.instruction}\n</demande_de_l_agent>

Applique la demande de l'agent au courrier actuel. Garde tel quel tout ce que la demande ne concerne pas, y compris les passages que l'agent a lui-même écrits. Renvoie le courrier complet.`,
      },
    ],
  });
}
