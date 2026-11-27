import { getSetting } from "./db";

export const CLAUDE_MODEL = "claude-opus-5-5";

// La clé saisie dans la page Réglages prime sur la variable d'environnement.
export function anthropicKey(): string | null {
  return getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY || null;
}

/** Vrai si une clé Anthropic est configurée : analyse et rédaction par Claude. */
export function hasClaude(): boolean {
  return Boolean(anthropicKey() || process.env.ANTHROPIC_AUTH_TOKEN);
}
