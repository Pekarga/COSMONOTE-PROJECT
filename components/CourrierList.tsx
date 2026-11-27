"use client";
import Link from "next/link";
import { LetterIcon } from "./Icons";
import { formatDate } from "./time";
import type { Genre } from "@/lib/types";

export type CourrierLigne = {
  id: string;
  dossierId: string | null;
  dossierTitre: string;
  genre: Genre;
  objet: string;
  destinataire: string;
  status: string;
  demo: boolean;
  updatedAt: string;
};

/** « A / Monsieur le Directeur / du … (CROU-B) » devient « Monsieur le Directeur du … (CROU-B) ». */
function destinataireCourt(d: string) {
  return d
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(NOTE\s+)?A$/i.test(l) && !/^(?:\S ){2,}\S$/.test(l))
    .slice(0, 2)
    .join(" ");
}

export function CourrierList({ courriers }: { courriers: CourrierLigne[] }) {
  return (
    <ul className="note-list">
      {courriers.map((c) => (
        <li key={c.id}>
          <Link href={`/courriers/${c.id}`} className="note-item">
            <span className={`kind ${c.genre === "note" ? "kind-note" : "kind-dossier"}`}>
              <LetterIcon size={18} />
            </span>
            <span className="note-item-main">
              <span className="note-item-title">{c.objet || "Projet sans objet"}</span>
              <span className="note-item-sub">
                <span>{c.genre === "note" ? "Note au Directeur" : destinataireCourt(c.destinataire) || "Courrier"}</span>
                {c.dossierTitre && <span>· Dossier : {c.dossierTitre}</span>}
                {c.demo && <span className="tag tag-mini">démo</span>}
              </span>
            </span>
            <span className="note-item-meta">
              {c.status === "processing" ? (
                <span className="spinner" />
              ) : c.status === "error" ? (
                <span className="pill pill-red">Erreur</span>
              ) : (
                formatDate(c.updatedAt)
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
