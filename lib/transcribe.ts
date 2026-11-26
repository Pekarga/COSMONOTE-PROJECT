import fs from "node:fs/promises";
import { transcriptionLanguage } from "./config";
import type { Segment } from "./types";

interface DeepgramUtterance {
  speaker?: number;
  start: number;
  end: number;
  transcript: string;
}

interface DeepgramResponse {
  metadata?: { duration?: number };
  results?: { utterances?: DeepgramUtterance[] };
}

/**
 * Transcrit un fichier audio ou vidéo avec Deepgram (modèle nova-3),
 * en séparant les intervenants (diarisation).
 */
export async function transcribeWithDeepgram(
  filePath: string,
  mediaType: string | null,
): Promise<{ segments: Segment[]; duration: number }> {
  const params = new URLSearchParams({
    model: "nova-3",
    language: transcriptionLanguage(),
    diarize: "true",
    utterances: "true",
    smart_format: "true",
    punctuate: "true",
  });
  const body = await fs.readFile(filePath);
  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
      "Content-Type": mediaType || "application/octet-stream",
    },
    body,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`La transcription a échoué (Deepgram ${res.status}). ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as DeepgramResponse;
  const utterances = data.results?.utterances ?? [];
  const segments: Segment[] = utterances
    .filter((u) => u.transcript.trim())
    .map((u) => ({ speaker: u.speaker ?? 0, start: u.start, end: u.end, text: u.transcript.trim() }));
  return { segments, duration: data.metadata?.duration ?? segments.at(-1)?.end ?? 0 };
}
