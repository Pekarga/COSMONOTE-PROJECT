"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PenIcon, SearchIcon } from "@/components/Icons";
import { formatDate, formatDuration } from "@/components/time";
import type { NoteSummary } from "@/lib/types";

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);
  const [query, setQuery] = useState("");

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

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Mes notes</h1>
          <p>Tout ce que tu as enregistré, transcrit et résumé.</p>
        </div>
        <Link href="/nouvelle" className="btn btn-primary">
          <PenIcon /> Nouvelle note
        </Link>
      </div>

      <div className="search">
        <SearchIcon />
        <input
          className="input"
          placeholder="Rechercher dans les titres, résumés et transcriptions…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher"
        />
      </div>

      {notes === null ? (
        <p className="muted">Chargement…</p>
      ) : notes.length === 0 ? (
        <div className="card empty">
          {query ? (
            <>
              <h2>Aucun résultat</h2>
              <p>Aucune note ne contient « {query} ».</p>
            </>
          ) : (
            <>
              <h2>Ta première note t&apos;attend</h2>
              <p>Enregistre un cours, une réunion ou une idée, ou importe un fichier audio ou vidéo. Le rédacteur s&apos;occupe du reste.</p>
              <Link href="/nouvelle" className="btn btn-primary">
                <PenIcon /> Créer une note
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="notes-grid">
          {notes.map((n) => (
            <Link key={n.id} href={`/notes/${n.id}`} className="card note-row">
              <div className="meta">
                <span>{formatDate(n.createdAt)}</span>
                {formatDuration(n.duration) && <span>· {formatDuration(n.duration)}</span>}
                {n.status === "processing" && (
                  <span className="pill pill-red">
                    <span className="spinner" /> En cours
                  </span>
                )}
                {n.status === "error" && <span className="pill pill-red">Erreur</span>}
                {n.demo && <span className="pill">Démo</span>}
              </div>
              <h2>{n.title}</h2>
              {n.essentiel && <p>{n.essentiel}</p>}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
