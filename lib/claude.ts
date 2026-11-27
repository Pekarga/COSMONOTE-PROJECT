import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CLAUDE_MODEL, anthropicKey } from "./config";
import {
  AnalyseSchema,
  CONSIGNE_ANALYSE,
  CONSIGNE_REDACTION,
  ROLE,
  RedactionSchema,
  analyseDepuis,
  briefRedaction,
  consigneRetouche,
  exemplesTexte,
  type DemandeRedaction,
} from "./consignes";
import type { Analyse, Redaction, Signe } from "./types";

let client: { key: string | null; instance: Anthropic } | null = null;
function getClient(): Anthropic {
  // La clé peut changer depuis la page Paramètres : on recrée le client si besoin.
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

export async function analyserDossierClaude(pieces: Block[], modeles: Signe[]): Promise<Analyse> {
  const out = await ask({
    schema: AnalyseSchema,
    effort: "medium",
    system: [{ type: "text", text: `${ROLE}\n${CONSIGNE_ANALYSE}` }, exemplesBlock(modeles)],
    content: [...pieces, { type: "text", text: "Voici les pièces du dossier. Analyse-le." }],
  });
  return analyseDepuis(out);
}

/* ───────────── Rédaction ───────────── */

/** Les courriers signés servent d'exemples de style. Bloc mis en cache : il change peu. */
function exemplesBlock(modeles: Signe[]): Anthropic.Beta.BetaTextBlockParam {
  return { type: "text", text: exemplesTexte(modeles), cache_control: { type: "ephemeral" } };
}

function systemeRedaction(modeles: Signe[]): Anthropic.Beta.BetaTextBlockParam[] {
  return [{ type: "text", text: `${ROLE}\n${CONSIGNE_REDACTION}` }, exemplesBlock(modeles)];
}

export async function redigerClaude(input: DemandeRedaction & { pieces: Block[] }): Promise<Redaction> {
  return ask({
    schema: RedactionSchema,
    effort: "high",
    system: systemeRedaction(input.modeles),
    content: [...input.pieces, { type: "text", text: briefRedaction(input) }],
  });
}

export async function retoucherClaude(input: { courrier: Redaction; instruction: string; modeles: Signe[] }): Promise<Redaction> {
  return ask({
    schema: RedactionSchema,
    effort: "medium",
    system: systemeRedaction(input.modeles),
    content: [{ type: "text", text: consigneRetouche(input.courrier, input.instruction) }],
  });
}
