"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useRef, useState } from "react";
import { BackIcon, CopyIcon, MoreIcon, PenIcon, PlusIcon, SendIcon, SparkIcon, TrashIcon } from "@/components/Icons";
import { Markdown } from "@/components/Markdown";
import { formatDate, formatDuration } from "@/components/time";
import { formatTime, speakerName } from "@/lib/format";
import type { Note } from "@/lib/types";

type Tab = "notes" | "source";

function noteToMarkdown(n: Note): string {
  const lines = [`# ${n.title}`, "", "## L'essentiel", n.essentiel];
  if (n.questions.length) lines.push("", "## Questions ouvertes", ...n.questions.map((q) => `- ${q}`));
  lines.push("", "## Résumé", n.resume);
  if (n.actions.length) lines.push("", "## Actions", ...n.actions.map((a) => `- [${a.done ? "x" : " "}] ${a.text}`));
  return lines.join("\n");
}

export default function NotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [note, setNote] = useState<Note | null>(null);
  const [missing, setMissing] = useState(false);
  const [tab, setTab] = useState<Tab>("notes");
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editingResume, setEditingResume] = useState(false);
  const [resumeDraft, setResumeDraft] = useState("");
  const [addingTag, setAddingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState("");
  const [question, setQuestion] = useState("");
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

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

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
    router.push("/");
  }

  function renameSpeaker(index: number) {
    if (!note) return;
    const name = window.prompt("Nom de cet intervenant :", speakerName(note.speakers, index));
    if (name === null) return;
    const speakers = { ...note.speakers, [String(index)]: name.trim() };
    if (!name.trim()) delete speakers[String(index)];
    save({ speakers });
  }

  function addTag() {
    const t = tagDraft.trim();
    if (note && t && !note.tags.includes(t)) save({ tags: [...note.tags, t] });
    setTagDraft("");
    setAddingTag(false);
  }

  function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    router.push(`/assistant?note=${id}&q=${encodeURIComponent(question.trim())}`);
  }

  if (missing)
    return (
      <div className="empty">
        <h2>Note introuvable</h2>
        <p>Elle a peut-être été supprimée.</p>
        <Link href="/" className="btn">
          Retour à mes notes
        </Link>
      </div>
    );
  if (!note) return <p className="muted" style={{ marginTop: 32 }}>Chargement…</p>;

  const ready = note.status === "ready";
  const isScan = note.kind === "scan";
  const src = `/api/notes/${id}/media`;
  const meta = [
    formatDate(note.createdAt),
    isScan ? `${note.pages} page${note.pages > 1 ? "s" : ""}` : formatDuration(note.duration),
  ].filter(Boolean);

  return (
    <div className={ready ? "with-askbar" : ""}>
      <div className="note-topbar">
        <Link href="/" className="icon-btn" aria-label="Retour">
          <BackIcon />
        </Link>
        <div className="segmented" role="tablist">
          <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>
            Notes
          </button>
          <button role="tab" aria-selected={tab === "source"} className={tab === "source" ? "on" : ""} onClick={() => setTab("source")}>
            {isScan ? "Document" : "Transcription"}
          </button>
        </div>
        <div className="menu-wrap">
          <button
            className="icon-btn"
            aria-label="Plus d'actions"
            onClick={(e) => {
              e.stopPropagation();
              setMenu((m) => !m);
            }}
          >
            <MoreIcon />
          </button>
          {menu && (
            <div className="menu card" onClick={(e) => e.stopPropagation()}>
              {ready && (
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(noteToMarkdown(note));
                    setCopied(true);
                    setMenu(false);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  <CopyIcon size={15} /> Copier la note
                </button>
              )}
              {ready && (
                <Link href={`/assistant?note=${id}`}>
                  <SparkIcon size={15} /> Discuter de cette note
                </Link>
              )}
              <button className="danger" onClick={remove}>
                <TrashIcon size={15} /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>

      <textarea
        className="title-input"
        rows={1}
        defaultValue={note.title}
        key={note.title}
        aria-label="Titre de la note"
        onBlur={(e) => {
          const v = e.target.value.trim();
          if (v && v !== note.title) save({ title: v });
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
      />
      <p className="note-meta">
        {meta.join(" · ")}
        {note.demo && <span className="tag tag-mini">exemple (mode démo)</span>}
        {copied && <span className="tag tag-mini">copiée</span>}
      </p>

      <div className="tags">
        {note.tags.map((t) => (
          <button key={t} className="tag" title="Retirer ce tag" onClick={() => save({ tags: note.tags.filter((x) => x !== t) })}>
            {t}
          </button>
        ))}
        {addingTag ? (
          <input
            className="tag tag-input"
            autoFocus
            value={tagDraft}
            placeholder="Nouveau tag"
            onChange={(e) => setTagDraft(e.target.value)}
            onBlur={addTag}
            onKeyDown={(e) => {
              if (e.key === "Enter") addTag();
              if (e.key === "Escape") setAddingTag(false);
            }}
          />
        ) : (
          <button className="tag tag-add" onClick={() => setAddingTag(true)}>
            <PlusIcon size={12} /> Tag
          </button>
        )}
      </div>

      {note.status === "processing" && (
        <div className="processing">
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

      {ready && tab === "notes" && (
        <article className="note-body">
          <section>
            <h2 className="hl hl-red">L&apos;essentiel</h2>
            <p className="essentiel">{note.essentiel}</p>
          </section>

          {note.questions.length > 0 && (
            <section>
              <h2 className="hl hl-ochre">Questions ouvertes</h2>
              <ul>
                {note.questions.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <div className="section-row">
              <h2 className="hl hl-sage">Résumé</h2>
              {!editingResume && (
                <button
                  className="icon-btn icon-btn-sm"
                  aria-label="Modifier le résumé"
                  onClick={() => {
                    setResumeDraft(note.resume);
                    setEditingResume(true);
                  }}
                >
                  <PenIcon size={14} />
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

          {note.actions.length > 0 && (
            <section>
              <div className="section-row">
                <h2 className="hl hl-slate">À faire</h2>
                <span className="small muted">
                  {note.actions.filter((a) => a.done).length}/{note.actions.length}
                </span>
              </div>
              <ul className="list-plain">
                {note.actions.map((a, i) => (
                  <li key={i}>
                    <label className={`action ${a.done ? "done" : ""}`}>
                      <input
                        type="checkbox"
                        checked={a.done}
                        onChange={() => save({ actions: note.actions.map((x, j) => (j === i ? { ...x, done: !x.done } : x)) })}
                      />
                      <span>{a.text}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </article>
      )}

      {tab === "source" && (
        <div className="note-body">
          {isScan ? (
            <>
              <div className="pages">
                {Array.from({ length: note.pages }, (_, i) => (
                  <a key={i} href={`${src}?page=${i + 1}`} target="_blank" rel="noreferrer" className="page-thumb">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`${src}?page=${i + 1}`} alt={`Page ${i + 1}`} loading="lazy" />
                    <span>{i + 1}</span>
                  </a>
                ))}
              </div>
              {note.docText && <div className="doc-text">{note.docText.split(/\n\s*\n/).map((p, i) => <p key={i}>{p}</p>)}</div>}
            </>
          ) : (
            <>
              {note.kind === "video" ? (
                <video ref={(el) => { media.current = el; }} src={src} controls preload="metadata" />
              ) : (
                <audio ref={(el) => { media.current = el; }} src={src} controls preload="metadata" />
              )}
              {note.segments.length > 0 && (
                <p className="small muted" style={{ margin: "14px 0 4px" }}>
                  Clique sur un horaire pour réécouter, sur un nom pour renommer l&apos;intervenant.
                </p>
              )}
              {note.segments.map((s, i) => (
                <div key={i} className="segment">
                  <button
                    className="seg-time"
                    onClick={() => {
                      if (media.current) {
                        media.current.currentTime = s.start;
                        media.current.play().catch(() => {});
                      }
                    }}
                  >
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
            </>
          )}
        </div>
      )}

      {ready && (
        <form className="askbar" onSubmit={ask}>
          <SparkIcon size={16} />
          <input
            placeholder="Une question sur cette note ?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            aria-label="Poser une question sur cette note"
          />
          <button className="icon-btn icon-btn-sm" disabled={!question.trim()} aria-label="Envoyer">
            <SendIcon size={15} />
          </button>
        </form>
      )}
    </div>
  );
}
