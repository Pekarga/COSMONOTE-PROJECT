import { hasClaude, hasDeepgram } from "./config";
import { getMediaPath, getNote, updateNote } from "./db";
import { demoNote, demoTranscript } from "./demo";
import { transcriptToText } from "./format";
import { generateNoteWithClaude } from "./claude";
import { transcribeWithDeepgram } from "./transcribe";

/** Transcrit puis rédige la note. Tourne en tâche de fond après l'envoi. */
export async function processNote(id: string): Promise<void> {
  try {
    const media = getMediaPath(id);
    const note = getNote(id);
    if (!media || !note) return;

    updateNote(id, { step: "Transcription en cours" });
    const realTranscript = hasDeepgram();
    const { segments, duration } = realTranscript
      ? await transcribeWithDeepgram(media.path, media.type)
      : demoTranscript();
    if (!segments.length) throw new Error("Aucune parole n'a été détectée dans ce fichier.");
    updateNote(id, { segments, duration, step: "Rédaction de la note" });

    const realNote = hasClaude();
    const generated = realNote
      ? await generateNoteWithClaude(transcriptToText(segments, {}))
      : demoNote(segments);

    const userTitle = note.title && !note.title.startsWith("Note du ");
    updateNote(id, {
      title: userTitle ? note.title : generated.title,
      essentiel: generated.essentiel,
      resume: generated.resume,
      questions: generated.questions,
      actions: generated.actions,
      demo: !realTranscript || !realNote,
      status: "ready",
      step: null,
      error: null,
    });
  } catch (err) {
    console.error("[processNote]", err);
    updateNote(id, {
      status: "error",
      step: null,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    });
  }
}
