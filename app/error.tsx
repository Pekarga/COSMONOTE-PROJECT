"use client";
import { useEffect, useState } from "react";

/** Une erreur dans une page : message lisible et bouton pour recharger, au lieu d'une page blanche. */
export default function Erreur({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [bureau, setBureau] = useState(false);
  useEffect(() => setBureau(Boolean(window.redacteur?.ouvrirJournal)), []);
  useEffect(() => {
    console.error("Erreur de page :", error?.message, error?.digest ?? "", error?.stack ?? "");
  }, [error]);
  return (
    <section className="card panel" style={{ maxWidth: 760 }}>
      <h2 className="panel-head">Cette page n&apos;a pas pu s&apos;afficher</h2>
      <p>Rechargez la page. Si l&apos;erreur revient, envoyez une capture de ce message.</p>
      <pre className="small muted" style={{ whiteSpace: "pre-wrap" }}>
        {error?.message || "Erreur inconnue"}
        {error?.digest ? `\nRéférence : ${error.digest}` : ""}
      </pre>
      <div className="toolbar">
        <button className="btn btn-primary" onClick={() => reset()}>
          Réessayer
        </button>
        <button className="btn" onClick={() => window.location.assign("/")}>
          Revenir à l&apos;accueil
        </button>
        {bureau && (
          <button className="btn btn-ghost" onClick={() => window.redacteur?.ouvrirJournal?.()}>
            Ouvrir le journal
          </button>
        )}
      </div>
    </section>
  );
}
