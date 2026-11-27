"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { CourrierList, type CourrierLigne } from "@/components/CourrierList";
import { FolderIcon, LetterIcon, SearchIcon } from "@/components/Icons";
import { formatDate } from "@/components/time";
import type { DossierSummary } from "@/lib/types";

/** Recherche dans les dossiers imputés (et le texte de leurs pièces) et dans les projets rédigés. */
export default function RecherchePage() {
  const [query, setQuery] = useState("");
  const [dossiers, setDossiers] = useState<DossierSummary[]>([]);
  const [courriers, setCourriers] = useState<CourrierLigne[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setDossiers([]);
      setCourriers([]);
      return;
    }
    let annule = false;
    const t = setTimeout(async () => {
      const [d, c] = await Promise.all([
        fetch(`/api/dossiers?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : { dossiers: [] })),
        fetch(`/api/courriers?q=${encodeURIComponent(q)}`).then((r) => (r.ok ? r.json() : { courriers: [] })),
      ]);
      if (annule) return;
      setDossiers(d.dossiers);
      setCourriers(c.courriers);
    }, 250);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [query]);

  const q = query.trim();
  return (
    <div className="stack">
      <section className="card panel">
        <h2 className="panel-head">
          <SearchIcon size={20} /> Recherche
        </h2>
        <div className="search">
          <SearchIcon />
          <input
            className="input"
            autoFocus
            placeholder="Un nom, un sigle, un numéro de courrier, un objet…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Rechercher"
          />
        </div>
        <p className="small muted">La recherche porte sur les dossiers imputés, le texte de leurs pièces et vos projets de courriers.</p>
      </section>

      {q && (
        <>
          <section className="card panel">
            <h2 className="panel-head vert">
              <FolderIcon size={20} /> Dossiers ({dossiers.length})
            </h2>
            {dossiers.length === 0 ? (
              <p className="muted small">Aucun dossier.</p>
            ) : (
              <ul className="note-list">
                {dossiers.map((d) => (
                  <li key={d.id}>
                    <Link href={`/dossiers/${d.id}`} className="note-item">
                      <span className="kind kind-dossier">
                        <FolderIcon size={18} />
                      </span>
                      <span className="note-item-main">
                        <span className="note-item-title">{d.titre}</span>
                        <span className="note-item-sub">{formatDate(d.createdAt)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="card panel">
            <h2 className="panel-head clair">
              <LetterIcon size={18} /> Courriers ({courriers.length})
            </h2>
            {courriers.length === 0 ? <p className="muted small">Aucun courrier.</p> : <CourrierList courriers={courriers} />}
          </section>
        </>
      )}
    </div>
  );
}
