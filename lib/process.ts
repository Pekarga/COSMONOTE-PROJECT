import fs from "node:fs/promises";
import path from "node:path";
import { hasClaude, hasDeepgram } from "./config";
import { getMediaPath, getNote, updateNote } from "./db";
import { DEMO_DOC, demoNote, demoNoteFromText, demoTranscript } from "./demo";
import { transcriptToText } from "./format";
import { generateNoteWithClaude, readScanWithClaude } from "./claude";
import { transcribeWithDeepgram } from "./transcribe";

const IMAGE_TYPES = { ".jpg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" } as const;

function finish(id: string, keepTitle: boolean, currentTitle: string, generated: { title: string; essentiel: string; resume: string; questions: string[]; actions: { text: string; done: boolean }[] }, demo: boolean) {
  updateNote(id, {
    title: keepTitle ? currentTitle : generated.title,
    essentiel: generated.essentiel,
    resume: generated.resume,
    questions: generated.questions,
    actions: generated.actions,
    demo,
    status: "ready",
    step: null,
    error: null,
  });
}

/** Transcrit (ou lit le document) puis rédige la note. Tourne en tâche de fond après l'envoi. */
export async function processNote(id: string): Promise<void> {
  try {
    const media = getMediaPath(id);
    const note = getNote(id);
    if (!media || !note) return;
    const userTitle = Boolean(note.title) && !/^(Note|Document) du /.test(note.title);

    if (note.kind === "scan") {
      updateNote(id, { step: "Lecture du document" });
      if (hasClaude()) {
        const files = (await fs.readdir(media.path))
          .filter((f) => f.startsWith("page-"))
          .sort((a, b) => parseInt(a.slice(5)) - parseInt(b.slice(5)));
        const images = await Promise.all(
          files.map(async (f) => ({
            mediaType: IMAGE_TYPES[path.extname(f) as keyof typeof IMAGE_TYPES] ?? "image/jpeg",
            data: (await fs.readFile(path.join(media.path, f))).toString("base64"),
          })),
        );
        const out = await readScanWithClaude(images);
        updateNote(id, { docText: out.text });
        finish(id, userTitle, note.title, out, false);
      } else {
        updateNote(id, { docText: DEMO_DOC });
        finish(id, userTitle, note.title, demoNoteFromText(DEMO_DOC), true);
      }
      return;
    }

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
    finish(id, userTitle, note.title, generated, !realTranscript || !realNote);
  } catch (err) {
    console.error("[processNote]", err);
    updateNote(id, {
      status: "error",
      step: null,
      error: err instanceof Error ? err.message : "Erreur inconnue",
    });
  }
}
