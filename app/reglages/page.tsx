"use client";
import { useEffect, useState } from "react";

type Settings = { anthropic: string | null; nom: string; fonction: string };

export default function SettingsPage() {
  const [current, setCurrent] = useState<Settings | null>(null);
  const [cle, setCle] = useState("");
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");

  async function load() {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const s = (await res.json()) as Settings;
    setCurrent(s);
    setNom(s.nom);
    setFonction(s.fonction);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(patch: { anthropic?: string; nom?: string; fonction?: string }) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setCle("");
    // Recharge pour mettre à jour le bandeau du mode démo.
    window.location.reload();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <p>La clé reste sur votre ordinateur, dans la base de données de l&apos;application.</p>
        </div>
      </div>

      <div className="settings-grid">
        <section className="card panel">
          <h2 className="panel-head vert">Votre nom et votre fonction</h2>
          <p className="small muted">Affichés en haut à droite de l&apos;application.</p>
          <form
            className="form-grid panel"
            style={{ padding: 0 }}
            onSubmit={(e) => {
              e.preventDefault();
              save({ nom, fonction });
            }}
          >
            <label className="form-row">
              <span className="field-label">Nom</span>
              <input className="input" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex. : Abdel …" />
            </label>
            <label className="form-row">
              <span className="field-label">Fonction</span>
              <input
                className="input"
                value={fonction}
                onChange={(e) => setFonction(e.target.value)}
                placeholder="Ex. : Chargé d'études, DCB"
              />
            </label>
            <div className="toolbar">
              <button className="btn btn-primary">Enregistrer</button>
            </div>
          </form>
        </section>

        <section className="card panel">
          <h2 className="panel-head">Rédaction par l&apos;IA (Claude)</h2>
          <p className="small muted">
            Sans clé, Le rédacteur fonctionne en mode démo : il reprend la mise en page et les formules de vos courriers signés et
            construit le projet à partir de vos consignes. Il lit les photos et les scans sur cet ordinateur, sans Internet ; vérifiez
            ce texte, car un scan pâle ou de travers se lit moins bien. La rédaction reste simple.
            Avec une clé Claude, il lit tout le dossier, analyse la demande et rédige dans votre style. Créez une clé sur{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            .
          </p>
          <p className="small">
            {current?.anthropic ? (
              <>
                Clé enregistrée : <code>{current.anthropic}</code>
              </>
            ) : (
              <span className="pill">Mode démo</span>
            )}
          </p>
          <form
            className="toolbar"
            onSubmit={(e) => {
              e.preventDefault();
              if (cle.trim()) save({ anthropic: cle });
            }}
          >
            <input
              className="input"
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={cle}
              onChange={(e) => setCle(e.target.value)}
              style={{ flex: 1, minWidth: 200 }}
              aria-label="Clé Claude"
            />
            <button className="btn btn-primary" disabled={!cle.trim()}>
              Enregistrer
            </button>
            {current?.anthropic && (
              <button type="button" className="btn btn-ghost" onClick={() => save({ anthropic: "" })}>
                Retirer
              </button>
            )}
          </form>
        </section>

        <section className="card panel">
          <h2 className="panel-head clair">Vos données</h2>
          <p className="small muted">
            Les courriers signés, les dossiers, les pièces et les projets restent sur cet ordinateur. Avec une clé Claude, le
            contenu d&apos;un dossier est envoyé à Claude au moment de l&apos;analyse et de la rédaction. Selon les conditions de
            l&apos;API d&apos;Anthropic, il ne sert pas à entraîner les modèles.
          </p>
        </section>
      </div>
    </>
  );
}
