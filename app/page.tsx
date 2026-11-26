"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MicIcon, PlayIcon, ScanIcon, SearchIcon, UploadIcon, CloseIcon } from "@/components/Icons";
import { RecorderSheet } from "@/components/RecorderSheet";
import { formatDate, formatDuration } from "@/components/time";
import { uploadNote } from "@/components/upload";
import type { NoteSummary } from "@/lib/types";

function KindIcon({ note }: { note: NoteSummary }) {
  if (note.kind === "scan") return <ScanIcon size={18} />;
  if (note.kind === "video") return <PlayIcon size={15} />;
  return <MicIcon size={18} />;
}

export default function NotesPage() {
  const router = useRouter();
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const res = await fetch(`/api/notes?q=${encodeURIComponent(query)}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { notes: NoteSummary[] };
      setNotes(data.notes);
      if (data.notes.some((n) => n.status === "processing")) timer = setTimeout(load, 2500);
    };
    const debounce = setTimeout(load, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(timer);
    };
  }, [query]);

  async function send(file: File) {
    setRecording(false);
    setError(null);
    setProgress(0);
    const form = new FormData();
    form.append("file", file);
    try {
      const id = await uploadNote(form, setProgress);
      router.push(`/notes/${id}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    }
  }

  return (
    <div className="with-dock">
      <div className="list-head">
        {searching ? (
          <div className="search">
            <SearchIcon />
            <input
              className="input"
              autoFocus
              placeholder="Rechercher dans tes notes…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher"
            />
            <button
              className="icon-btn search-close"
              onClick={() => {
                setQuery("");
                setSearching(false);
              }}
              aria-label="Fermer la recherche"
            >
              <CloseIcon size={16} />
            </button>
          </div>
        ) : (
          <>
            <h1>Toutes les notes</h1>
            <button className="icon-btn" onClick={() => setSearching(true)} aria-label="Rechercher">
              <SearchIcon />
            </button>
          </>
        )}
      </div>

      {progress !== null && (
        <div className="upload-strip">
          <span>Envoi… {progress}%</span>
          <div className="progress">
            <div style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}
      {error && <div className="error-box" style={{ marginBottom: 12 }}>{error}</div>}

      {notes === null ? (
        <p className="muted">Chargement…</p>
      ) : notes.length === 0 ? (
        <div className="empty">
          {query ? (
            <>
              <h2>Aucun résultat</h2>
              <p>Aucune note ne contient « {query} ».</p>
            </>
          ) : (
            <>
              <h2>Ta première note t&apos;attend</h2>
              <p>
                Enregistre un cours ou une réunion, scanne un document, ou importe un fichier audio ou vidéo. Le
                rédacteur s&apos;occupe du reste.
              </p>
            </>
          )}
        </div>
      ) : (
        <ul className="note-list">
          {notes.map((n) => (
            <li key={n.id}>
              <Link href={`/notes/${n.id}`} className="note-item">
                <span className={`kind kind-${n.kind}`}>
                  <KindIcon note={n} />
                </span>
                <span className="note-item-main">
                  <span className="note-item-title">{n.title}</span>
                  <span className="note-item-sub">
                    {formatDate(n.createdAt)}
                    {n.tags.length > 0 && <span className="tag tag-mini">{n.tags[0]}</span>}
                    {n.demo && <span className="tag tag-mini">démo</span>}
                  </span>
                </span>
                <span className="note-item-meta">
                  {n.status === "processing" ? (
                    <span className="spinner" aria-label="En cours" />
                  ) : n.status === "error" ? (
                    <span className="pill pill-red">Erreur</span>
                  ) : n.kind === "scan" ? (
                    `${n.pages} page${n.pages > 1 ? "s" : ""}`
                  ) : (
                    formatDuration(n.duration)
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="dock" role="toolbar" aria-label="Créer une note">
        <button className="dock-btn" onClick={() => fileInput.current?.click()} disabled={progress !== null}>
          <UploadIcon />
          <span>Importer</span>
        </button>
        <button
          className="dock-rec"
          onClick={() => setRecording(true)}
          disabled={progress !== null}
          aria-label="Enregistrer"
        >
          <MicIcon size={26} />
        </button>
        <Link href="/scanner" className="dock-btn">
          <ScanIcon />
          <span>Scanner</span>
        </Link>
      </div>
      <input
        ref={fileInput}
        type="file"
        accept="audio/*,video/*"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) send(f);
          e.target.value = "";
        }}
      />
      {recording && <RecorderSheet onDone={send} onClose={() => setRecording(false)} />}
    </div>
  );
}
