import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { CLAUDE_MODEL, anthropicKey } from "./config";
import type { ActionItem } from "./types";

let client: { key: string | null; instance: Anthropic } | null = null;
function getClient(): Anthropic {
  // La clé peut changer depuis la page Réglages : on recrée le client si besoin.
  const key = anthropicKey();
  if (!client || client.key !== key) {
    client = { key, instance: key ? new Anthropic({ apiKey: key }) : new Anthropic() };
  }
  return client.instance;
}

// Si le modèle principal décline une demande, l'API relance automatiquement
// la même requête sur un modèle de repli choisi par Anthropic.
const FALLBACK = {
  betas: ["server-side-fallback-2026-07-01" as const],
  fallbacks: "default" as const,
};

const NoteSchema = z.object({
  titre: z.string().describe("Un titre court et précis, 3 à 8 mots"),
  essentiel: z.string().describe("Les points clés en 2 ou 3 phrases"),
  resume: z
    .string()
    .describe("Un résumé structuré en liste à puces Markdown (lignes commençant par '- ')"),
  questions_ouvertes: z.array(z.string()).describe("Les questions restées sans réponse"),
  actions: z.array(z.string()).describe("Les actions à faire, avec la personne concernée si elle est connue"),
});

const NOTE_SYSTEM = `Tu es « Le rédacteur », un assistant qui transforme des transcriptions (cours, réunions, entretiens, notes vocales) en notes claires et fiables.
Règles :
- Écris dans la langue principale de la transcription.
- Appuie-toi uniquement sur ce qui est dit. N'invente ni chiffres, ni noms, ni décisions.
- « essentiel » : 2 ou 3 phrases qui disent ce qu'il faut retenir.
- « resume » : une liste à puces Markdown qui suit le déroulé, une idée par puce.
- « questions_ouvertes » : seulement les questions qui restent sans réponse. Liste vide s'il n'y en a pas.
- « actions » : les tâches concrètes à faire, sous forme de phrases courtes. Liste vide s'il n'y en a pas.`;

export async function generateNoteWithClaude(transcript: string): Promise<{
  title: string;
  essentiel: string;
  resume: string;
  questions: string[];
  actions: ActionItem[];
}> {
  const response = await getClient().beta.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    ...FALLBACK,
    output_config: { effort: "medium", format: betaZodOutputFormat(NoteSchema) },
    system: NOTE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Voici la transcription à transformer en note :\n\n<transcription>\n${transcript}\n</transcription>`,
      },
    ],
  });
  if (response.stop_reason === "refusal") {
    throw new Error("Claude n'a pas pu traiter ce contenu.");
  }
  const out = response.parsed_output;
  if (!out) throw new Error("La note générée n'a pas pu être lue.");
  return {
    title: out.titre,
    essentiel: out.essentiel,
    resume: out.resume,
    questions: out.questions_ouvertes,
    actions: out.actions.map((text) => ({ text, done: false })),
  };
}

const CHAT_SYSTEM = `Tu es « Le rédacteur », l'assistant personnel de prise de notes de l'utilisateur.
Tu réponds à ses questions à partir de ses notes, fournies ci-dessous entre balises <note>.
- Réponds dans la langue de la question, de façon directe et concise.
- Cite le titre des notes sur lesquelles tu t'appuies.
- Si la réponse n'est pas dans les notes, dis-le clairement au lieu de deviner.
- Sur demande, tu peux produire un QCM, des fiches de révision, un tableau ou un plan à partir des notes.`;

export function streamChatWithClaude(
  notesContext: string,
  messages: { role: "user" | "assistant"; content: string }[],
) {
  return getClient().beta.messages.stream({
    model: CLAUDE_MODEL,
    max_tokens: 64000,
    ...FALLBACK,
    output_config: { effort: "low" },
    system: [
      { type: "text", text: CHAT_SYSTEM },
      {
        type: "text",
        text: `<notes>\n${notesContext || "(aucune note pour l'instant)"}\n</notes>`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages,
  });
}
