export type NoteStatus = "processing" | "ready" | "error";

export interface Segment {
  speaker: number;
  start: number;
  end: number;
  text: string;
}

export interface ActionItem {
  text: string;
  done: boolean;
}

export type NoteKind = "audio" | "video" | "scan";

export interface Note {
  id: string;
  kind: NoteKind;
  tags: string[];
  /** Texte extrait d'un document scanné. */
  docText: string;
  /** Nombre de pages d'un document scanné. */
  pages: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: NoteStatus;
  step: string | null;
  error: string | null;
  sourceName: string | null;
  mediaType: string | null;
  duration: number | null;
  segments: Segment[];
  speakers: Record<string, string>;
  essentiel: string;
  resume: string;
  questions: string[];
  actions: ActionItem[];
  demo: boolean;
}

export type NoteSummary = Pick<
  Note,
  "id" | "title" | "createdAt" | "status" | "essentiel" | "duration" | "demo" | "kind" | "pages" | "tags"
>;
