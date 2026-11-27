export const CLAUDE_MODEL = "claude-opus-5-5";

/**
 * Le rédacteur fonctionne entièrement sur l'ordinateur, sans clé ni Internet.
 * Une clé Anthropic n'est prise en compte que si elle est fournie au serveur par variable d'environnement
 * (installation web, développement) ; l'appli de bureau ne propose pas de la saisir.
 */
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || null;
}

/** Vrai si une clé Anthropic est fournie au serveur : analyse et rédaction par Claude. */
export function hasClaude(): boolean {
  return Boolean(anthropicKey() || process.env.ANTHROPIC_AUTH_TOKEN);
}
