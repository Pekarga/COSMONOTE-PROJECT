"use client";
import { useEffect, useState } from "react";

/** Erreur dans la mise en page générale (bandeau, menus) : page de secours autonome. */
export default function ErreurGenerale({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [bureau, setBureau] = useState(false);
  useEffect(() => setBureau(Boolean(window.redacteur?.ouvrirJournal)), []);
  useEffect(() => {
    console.error("Erreur générale :", error?.message, error?.digest ?? "", error?.stack ?? "");
  }, [error]);
  return (
    <html lang="fr">
      <body style={{ fontFamily: "Segoe UI, Arial, sans-serif", background: "#f3f5f7", color: "#1d3550", padding: 32 }}>
        <h1 style={{ color: "#ef7d00" }}>Le rédacteur n&apos;a pas pu afficher cette page</h1>
        <p>Cliquez sur « Réessayer ». Si l&apos;erreur revient, envoyez une capture de ce message.</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#fff", padding: 12, borderRadius: 8 }}>
          {error?.message || "Erreur inconnue"}
          {error?.digest ? `\nRéférence : ${error.digest}` : ""}
        </pre>
        <button onClick={() => reset()} style={{ padding: "10px 18px", fontSize: 16, marginRight: 8 }}>
          Réessayer
        </button>
        <button onClick={() => window.location.assign("/")} style={{ padding: "10px 18px", fontSize: 16, marginRight: 8 }}>
          Revenir à l&apos;accueil
        </button>
        {bureau && (
          <button onClick={() => window.redacteur?.ouvrirJournal?.()} style={{ padding: "10px 18px", fontSize: 16 }}>
            Ouvrir le journal
          </button>
        )}
      </body>
    </html>
  );
}
