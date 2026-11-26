import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, MEDIA_DIR } from "./paths";
import type { ActionItem, Note, NoteSummary, Segment } from "./types";

let db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "redacteur.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT,
      error TEXT,
      source_name TEXT,
      media_path TEXT,
      media_type TEXT,
      duration REAL,
      segments TEXT NOT NULL DEFAULT '[]',
      speakers TEXT NOT NULL DEFAULT '{}',
      essentiel TEXT NOT NULL DEFAULT '',
      resume TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '[]',
      actions TEXT NOT NULL DEFAULT '[]',
      demo INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

type Row = Record<string, unknown>;

function toNote(r: Row): Note {
  return {
    id: String(r.id),
    title: String(r.title),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    status: r.status as Note["status"],
    step: (r.step as string) ?? null,
    error: (r.error as string) ?? null,
    sourceName: (r.source_name as string) ?? null,
    mediaType: (r.media_type as string) ?? null,
    duration: (r.duration as number) ?? null,
    segments: JSON.parse(String(r.segments)) as Segment[],
    speakers: JSON.parse(String(r.speakers)) as Record<string, string>,
    essentiel: String(r.essentiel),
    resume: String(r.resume),
    questions: JSON.parse(String(r.questions)) as string[],
    actions: JSON.parse(String(r.actions)) as ActionItem[],
    demo: Boolean(r.demo),
  };
}

export function createNote(input: {
  title: string;
  sourceName: string | null;
  mediaType: string | null;
  ext: string;
}): { id: string; mediaPath: string } {
  const id = randomUUID();
  const now = new Date().toISOString();
  const mediaPath = path.join(MEDIA_DIR, `${id}${input.ext}`);
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  getDb()
    .prepare(
      `INSERT INTO notes (id, title, created_at, updated_at, status, step, source_name, media_path, media_type)
       VALUES (?, ?, ?, ?, 'processing', 'Envoi du fichier', ?, ?, ?)`,
    )
    .run(id, input.title, now, now, input.sourceName, mediaPath, input.mediaType);
  return { id, mediaPath };
}

export function getNote(id: string): Note | null {
  const r = getDb().prepare("SELECT * FROM notes WHERE id = ?").get(id) as Row | undefined;
  return r ? toNote(r) : null;
}

export function getMediaPath(id: string): { path: string; type: string | null } | null {
  const r = getDb().prepare("SELECT media_path, media_type FROM notes WHERE id = ?").get(id) as
    | Row
    | undefined;
  if (!r || !r.media_path) return null;
  return { path: String(r.media_path), type: (r.media_type as string) ?? null };
}

export function listNotes(query?: string): NoteSummary[] {
  const cols = "id, title, created_at, status, essentiel, duration, demo";
  const rows = (
    query && query.trim()
      ? getDb()
          .prepare(
            `SELECT ${cols} FROM notes
             WHERE title LIKE ? OR essentiel LIKE ? OR resume LIKE ? OR segments LIKE ? OR actions LIKE ?
             ORDER BY created_at DESC`,
          )
          .all(...Array(5).fill(`%${query.trim()}%`))
      : getDb().prepare(`SELECT ${cols} FROM notes ORDER BY created_at DESC`).all()
  ) as Row[];
  return rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    createdAt: String(r.created_at),
    status: r.status as Note["status"],
    essentiel: String(r.essentiel),
    duration: (r.duration as number) ?? null,
    demo: Boolean(r.demo),
  }));
}

export function listReadyNotes(): Note[] {
  return (
    getDb().prepare("SELECT * FROM notes WHERE status = 'ready' ORDER BY created_at DESC").all() as Row[]
  ).map(toNote);
}

const columns: Record<string, string> = {
  title: "title",
  status: "status",
  step: "step",
  error: "error",
  duration: "duration",
  segments: "segments",
  speakers: "speakers",
  essentiel: "essentiel",
  resume: "resume",
  questions: "questions",
  actions: "actions",
  demo: "demo",
};

export function updateNote(id: string, patch: Partial<Note>): void {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = columns[key];
    if (!col) continue;
    sets.push(`${col} = ?`);
    if (value === null || value === undefined) values.push(null);
    else if (typeof value === "boolean") values.push(value ? 1 : 0);
    else if (typeof value === "object") values.push(JSON.stringify(value));
    else values.push(value as string | number);
  }
  if (!sets.length) return;
  sets.push("updated_at = ?");
  values.push(new Date().toISOString(), id);
  getDb()
    .prepare(`UPDATE notes SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

export function deleteNote(id: string): void {
  const media = getMediaPath(id);
  getDb().prepare("DELETE FROM notes WHERE id = ?").run(id);
  if (media) fs.rm(media.path, { force: true }, () => {});
}

export function getSetting(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return r ? String(r.value) : null;
}

export function setSetting(key: string, value: string): void {
  if (value) {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  } else {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}
