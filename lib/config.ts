import { getSetting } from "./db";

export const CLAUDE_MODEL = "claude-opus-5-5";

// Les clés saisies dans la page Réglages priment sur les variables d'environnement.
export function anthropicKey(): string | null {
  return getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY || null;
}

export function deepgramKey(): string | null {
  return getSetting("deepgram_api_key") || process.env.DEEPGRAM_API_KEY || null;
}

/** Vrai si une clé Anthropic est configurée : notes et assistant par Claude. */
export function hasClaude(): boolean {
  return Boolean(anthropicKey() || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Vrai si une clé Deepgram est configurée : vraie transcription. */
export function hasDeepgram(): boolean {
  return Boolean(deepgramKey());
}

export function transcriptionLanguage(): string {
  return getSetting("transcription_language") || process.env.TRANSCRIPTION_LANGUAGE || "fr";
}
