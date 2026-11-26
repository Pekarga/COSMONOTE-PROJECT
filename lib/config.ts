import path from "node:path";

export const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
export const MEDIA_DIR = path.join(DATA_DIR, "media");

/** Vrai si une clé Anthropic est configurée : notes et assistant par Claude. */
export function hasClaude(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

/** Vrai si une clé Deepgram est configurée : vraie transcription. */
export function hasDeepgram(): boolean {
  return Boolean(process.env.DEEPGRAM_API_KEY);
}

export function transcriptionLanguage(): string {
  return process.env.TRANSCRIPTION_LANGUAGE || "fr";
}

export const CLAUDE_MODEL = "claude-opus-5-5";
