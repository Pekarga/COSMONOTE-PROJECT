import type { Note, Segment } from "./types";

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function speakerName(speakers: Record<string, string>, index: number): string {
  return speakers[String(index)] || `Intervenant ${index + 1}`;
}

export function transcriptToText(segments: Segment[], speakers: Record<string, string>): string {
  return segments
    .map((s) => `[${formatTime(s.start)}] ${speakerName(speakers, s.speaker)} : ${s.text}`)
    .join("\n");
}

export function noteToContext(note: Note): string {
  const parts = [
    `<note id="${note.id}" titre="${note.title.replace(/"/g, "'")}" date="${note.createdAt.slice(0, 10)}">`,
    `L'essentiel : ${note.essentiel}`,
    `Résumé :\n${note.resume}`,
  ];
  if (note.questions.length) parts.push(`Questions ouvertes :\n- ${note.questions.join("\n- ")}`);
  if (note.actions.length)
    parts.push(`Actions :\n- ${note.actions.map((a) => `${a.done ? "[fait] " : ""}${a.text}`).join("\n- ")}`);
  parts.push(`Transcription :\n${transcriptToText(note.segments, note.speakers)}`, "</note>");
  return parts.join("\n\n");
}
