"use client";
import { useEffect, useState } from "react";

type Settings = { anthropic: string | null; deepgram: string | null; language: string };

const LANGUAGES = [
  ["fr", "Français"],
  ["en", "Anglais"],
  ["es", "Espagnol"],
  ["de", "Allemand"],
  ["it", "Italien"],
  ["pt", "Portugais"],
  ["ar", "Arabe"],
  ["multi", "Plusieurs langues"],
];

export default function SettingsPage() {
  const [current, setCurrent] = useState<Settings | null>(null);
  const [anthropic, setAnthropic] = useState("");
  const [deepgram, setDeepgram] = useState("");
  const [language, setLanguage] = useState("fr");
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch("/api/settings");
    if (!res.ok) return;
    const s = (await res.json()) as Settings;
    setCurrent(s);
    setLanguage(s.language);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(patch: Partial<Record<"anthropic" | "deepgram" | "language", string>>) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    setAnthropic("");
    setDeepgram("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    await load();
    // Recharge pour mettre à jour le bandeau du mode démo.
    window.location.reload();
  }

  function KeyField(props: {
    label: string;
    help: React.ReactNode;
    value: string;
    onChange: (v: string) => void;
    currentKey: string | null | undefined;
    field: "anthropic" | "deepgram";
    placeholder: string;
  }) {
    return (
      <section className="card panel">
        <h2>{props.label}</h2>
        <p className="small muted">{props.help}</p>
        <p className="small">
          {props.currentKey ? (
            <>
              Clé enregistrée : <code>{props.currentKey}</code>
            </>
          ) : (
            <span className="pill">Mode démo</span>
          )}
        </p>
        <div className="toolbar">
          <input
            className="input"
            type="password"
            autoComplete="off"
            placeholder={props.placeholder}
            value={props.value}
            onChange={(e) => props.onChange(e.target.value)}
            style={{ flex: 1, minWidth: 200 }}
          />
          <button
            className="btn btn-primary"
            disabled={!props.value.trim()}
            onClick={() => save({ [props.field]: props.value })}
          >
            Enregistrer
          </button>
          {props.currentKey && (
            <button className="btn btn-ghost" onClick={() => save({ [props.field]: "" })}>
              Retirer
            </button>
          )}
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Réglages</h1>
          <p>Ajoute tes clés pour passer du mode démo à la vraie IA. Elles restent sur ton ordinateur.</p>
        </div>
        {saved && <span className="pill">Enregistré</span>}
      </div>
      <div className="notes-grid">
        {KeyField({
          label: "Transcription (Deepgram)",
          help: (
            <>
              Transcrit l&apos;audio et reconnaît les intervenants. Crée une clé sur{" "}
              <a href="https://console.deepgram.com" target="_blank" rel="noreferrer">
                console.deepgram.com
              </a>
              .
            </>
          ),
          value: deepgram,
          onChange: setDeepgram,
          currentKey: current?.deepgram,
          field: "deepgram",
          placeholder: "Colle ta clé Deepgram",
        })}
        {KeyField({
          label: "Notes et assistant (Claude)",
          help: (
            <>
              Rédige les notes et répond à tes questions. Crée une clé sur{" "}
              <a href="https://console.anthropic.com" target="_blank" rel="noreferrer">
                console.anthropic.com
              </a>
              .
            </>
          ),
          value: anthropic,
          onChange: setAnthropic,
          currentKey: current?.anthropic,
          field: "anthropic",
          placeholder: "sk-ant-…",
        })}
        <section className="card panel">
          <h2>Langue parlée</h2>
          <p className="small muted">La langue principale de tes enregistrements, pour une meilleure transcription.</p>
          <select
            className="input"
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              save({ language: e.target.value });
            }}
          >
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </select>
        </section>
      </div>
    </>
  );
}
