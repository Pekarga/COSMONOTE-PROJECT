"use client";
import { useEffect, useState } from "react";
import { CourrierList, type CourrierLigne } from "@/components/CourrierList";
import { CloseIcon, HistoryIcon, SearchIcon } from "@/components/Icons";

/** Historique : tous les projets de courriers et de notes, du plus récent au plus ancien. */
export default function CourriersPage() {
  const [courriers, setCourriers] = useState<CourrierLigne[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let annule = false;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/courriers?q=${encodeURIComponent(query)}`);
      if (!res.ok || annule) return;
      setCourriers(((await res.json()) as { courriers: CourrierLigne[] }).courriers);
    }, query ? 250 : 0);
    return () => {
      annule = true;
      clearTimeout(t);
    };
  }, [query]);

  return (
    <section className="card panel">
      <h2 className="panel-head">
        <HistoryIcon size={20} /> Mes courriers
        <span className="spacer small">{courriers ? `${courriers.length} projet${courriers.length > 1 ? "s" : ""}` : ""}</span>
      </h2>
      <div className="search">
        <SearchIcon />
        <input
          className="input"
          placeholder="Rechercher un objet, un destinataire, un mot du texte…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Rechercher dans mes courriers"
        />
        {query && (
          <button className="icon-btn search-close" onClick={() => setQuery("")} aria-label="Effacer la recherche">
            <CloseIcon size={16} />
          </button>
        )}
      </div>
      {courriers === null ? (
        <p className="muted">Chargement…</p>
      ) : courriers.length === 0 ? (
        <div className="empty">
          <p>{query ? `Aucun courrier ne contient « ${query} ».` : "Aucun projet rédigé pour l'instant. Ouvrez un dossier et cliquez sur Rédiger."}</p>
        </div>
      ) : (
        <CourrierList courriers={courriers} />
      )}
    </section>
  );
}
