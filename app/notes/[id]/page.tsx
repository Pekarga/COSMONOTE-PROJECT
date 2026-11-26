"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { CopyIcon, PenIcon, SparkIcon, TrashIcon } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { formatDate, formatDuration } from "@/components/time";
import { formatTime, speakerName } from "@/lib/format";
import type { Note } from "@/lib/types";

type Tab = "note" | "transcription";

function noteToMarkdown(n: Note): string {
  const lines = [`# ${n.title}`, "", "## L'essentiel", n.essentiel, "", "## Résumé", n.resume];
  if (n.questions.length) lines.push("", "## Questions ouvertes", ...n.questions.map((q) => `- ${q}`));
  if (n.actions.length) lines.push("", "## Actions", ...n.actions.map((a) => `- [${a.done ? "x" : " "}] ${a.text}`));
  return lines.join("\n");
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("note");
  const [editingResume, setEditingResume] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const media = useRef<HTMLMediaElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/notes/${id}`);
    if (res.status === 404) return setMissing(true);
    if (res.ok) setNote(((await res.json()) as { note: Note }).note);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (note?.status !== "processing") return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [note, load]);

  async function save(patch: Partial<Note> & { retry?: boolean }) {
    if (note) setNote({ ...note, ...patch } as Note);
    const res = await fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) setNote(((await res.json()) as { note: Note }).note);
  }

  async function remove() {
    if (!window.confirm("Supprimer définitivement cette note et son fichier ?")) return;
    await fetch(`/api/notes/${id}`, { method: "DELETE" });
    window.location.href = "/";
  }

  function renameSpeaker(index: number) {
    if (!note) return;
    const name = window.prompt("Nom de cet intervenant :", speakerName(note.speakers, index));
    if (name === null) return;
    const speakers = { ...note.speakers, [String(index)]: name.trim() };
    if (!name.trim()) delete speakers[String(index)];
    save({ speakers });
  }

  function seek(t: number) {
    if (media.current) {
      media.current.currentTime = t;
      media.current.play().catch(() => {});
    }
  }

  if (missing)
    return (
      <div className="card empty" style={{ marginTop: 32 }}>
        <h2>Note introuvable</h2>
        <p>Elle a peut-être été supprimée.</p>
        <Link href="/" className="btn">
          Retour à mes notes
        </Link>
      </div>
    );
  if (!note) return <p className="muted" style={{ marginTop: 32 }}>Chargement…</p>;

  const isVideo = note.mediaType?.startsWith("video/");
  const src = `/api/notes/${id}/media`;

  return (
    <>
      <div className="note-head">
        <Link href="/" className="small muted" style={{ textDecoration: "none" }}>
          ← Mes notes
        </Link>
        <input
          className="title-input"
          defaultValue={note.title}
          key={note.title}
          aria-label="Titre de la note"
          onBlur={(e) => {
            const v = e.target.value.trim();
            if (v && v !== note.title) save({ title: v });
          }}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        />
        <div className="toolbar small muted">
          <span>{formatDate(note.createdAt)}</span>
          {formatDuration(note.duration) && <span>· {formatDuration(note.duration)}</span>}
          {note.demo && <span className="pill">Exemple généré en mode démo</span>}
          <span className="spacer" />
          {note.status === "ready" && (
            <>
              <button
                className="btn btn-sm btn-ghost"
                onClick={async () => {
                  await navigator.clipboard.writeText(noteToMarkdown(note));
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
              >
                <CopyIcon size={14} /> {copied ? "Copiée !" : "Copier"}
              </button>
              <Link href={`/assistant?note=${id}`} className="btn btn-sm btn-ghost">
                <SparkIcon size={14} /> Questionner
              </Link>
            </>
          )}
          <button className="btn btn-sm btn-ghost" onClick={remove}>
            <TrashIcon size={14} /> Supprimer
          </button>
        </div>
      </div>

      {isVideo ? (
        <video ref={(el) => { media.current = el; }} src={src} controls preload="metadata" />
      ) : (
        <audio ref={(el) => { media.current = el; }} src={src} controls preload="metadata" />
      )}

      {note.status === "processing" && (
        <div className="card processing" style={{ marginTop: 16 }}>
          <span className="spinner" style={{ width: 24, height: 24, color: "var(--red)" }} />
          <h2>{note.step ?? "Traitement en cours"}…</h2>
          <p className="muted">Tu peux quitter cette page, la note sera prête dans ta liste.</p>
        </div>
      )}

      {note.status === "error" && (
        <div className="error-box" style={{ marginTop: 16 }}>
          <p>{note.error}</p>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => save({ retry: true, status: "processing" })}>
            Réessayer
          </button>
        </div>
      )}

      {note.status === "ready" && (
        <>
          <div className="tabs" role="tablist">
            <button className={`tab ${tab === "note" ? "active" : ""}`} onClick={() => setTab("note")} role="tab">
              Note
            </button>
            <button
              className={`tab ${tab === "transcription" ? "active" : ""}`}
              onClick={() => setTab("transcription")}
              role="tab"
            >
              Transcription
            </button>
          </div>

          {tab === "note" ? (
            <>
              <section className="card section">
                <div className="kicker" style={{ marginBottom: 10 }}>L&apos;essentiel</div>
                <p className="essentiel">{note.essentiel}</p>
              </section>

              <section className="card section">
                <div className="section-head">
                  <h2>Résumé</h2>
                  {!editingResume && (
                    <button
                      className="btn btn-sm btn-ghost"
                      onClick={() => {
                        setResumeDraft(note.resume);
                        setEditingResume(true);
                      }}
                    >
                      <PenIcon size={14} /> Modifier
                    </button>
                  )}
                </div>
                {editingResume ? (
                  <>
                    <textarea className="textarea" value={resumeDraft} onChange={(e) => setResumeDraft(e.target.value)} />
                    <div className="toolbar" style={{ marginTop: 10 }}>
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={() => {
                          save({ resume: resumeDraft });
                          setEditingResume(false);
                        }}
                      >
                        Enregistrer
                      </button>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditingResume(false)}>
                        Annuler
                      </button>
                    </div>
                  </>
                ) : (
                  <Markdown text={note.resume} />
                )}
              </section>

              {note.questions.length > 0 && (
                <section className="card section">
                  <div className="section-head">
                    <h2>Questions ouvertes</h2>
                  </div>
                  <ul className="list-plain">
                    {note.questions.map((q, i) => (
                      <li key={i} className="question">
                        {q}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {note.actions.length > 0 && (
                <section className="card section">
                  <div className="section-head">
                    <h2>Actions</h2>
                    <span className="small muted">
                      {note.actions.filter((a) => a.done).length}/{note.actions.length} faites
                    </span>
                  </div>
                  <ul className="list-plain">
                    {note.actions.map((a, i) => (
                      <li key={i}>
                        <label className={`action ${a.done ? "done" : ""}`}>
                          <input
                            type="checkbox"
                            checked={a.done}
                            onChange={() =>
                              save({ actions: note.actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })
                            }
                          />
                          <span>{a.text}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          ) : (
            <section className="card section">
              <p className="small muted" style={{ marginBottom: 8 }}>
                Clique sur un horaire pour réécouter le passage, et sur un nom pour renommer l&apos;intervenant.
              </p>
              {note.segments.map((s, i) => (
                <div key={i} className="segment">
                  <button className="seg-time" onClick={() => seek(s.start)}>
                    {formatTime(s.start)}
                  </button>
                  <div>
                    <button className="speaker" onClick={() => renameSpeaker(s.speaker)}>
                      {speakerName(note.speakers, s.speaker)}
                    </button>
                    <p>{s.text}</p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
