"use client";
import { useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { toPng } from "@/components/upload";

type Settings = {
  nom: string;
  fonction: string;
  armoiries: "choisies" | "courriers" | null;
  donnees: { dossier: string; signes: number; dossiers: number; pieces: number; courriers: number };
  sauvegarde: { derniere: string | null; dossier: string; nombre: number };
};

const dateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function SettingsPage() {
  const [current, setCurrent] = useState<Settings | null>(null);
  const [nom, setNom] = useState("");
  const [fonction, setFonction] = useState("");
  const [version, setVersion] = useState(0);
  const [erreur, setErreur] = useState<string | null>(null);
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);

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

  async function save(patch: { nom?: string; fonction?: string }) {
    await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    // Recharge pour mettre à jour le bandeau (nom et fonction).
    window.location.reload();
  }

  async function armoiries(file: File | null) {
    setErreur(null);
    try {
      if (file) {
        const form = new FormData();
        form.append("file", await toPng(file, 600));
        const res = await fetch("/api/logo", { method: "POST", body: form });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Image refusée.");
      } else {
        await fetch("/api/logo", { method: "DELETE" });
      }
      // Recharge pour afficher les nouvelles armoiries dans le bandeau.
      window.location.reload();
    } catch (e) {
      setErreur(e instanceof Error ? e.message : "Image refusée.");
    }
    setVersion((v) => v + 1);
  }

  async function sauvegarderMaintenant() {
    setSauvegardeEnCours(true);
    const res = await fetch("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sauvegarder: true }),
    });
    if (res.ok) setCurrent((await res.json()) as Settings);
    setSauvegardeEnCours(false);
  }

  const d = current?.donnees;
  const s = current?.sauvegarde;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Paramètres</h1>
          <p>Tout fonctionne sur cet ordinateur, sans Internet : lecture des courriers et des scans, analyse et rédaction.</p>
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

        <section className="card panel" id="armoiries">
          <h2 className="panel-head">Armoiries</h2>
          <p className="small muted">
            Affichées en haut à gauche de l&apos;application et en en-tête des courriers dont le modèle n&apos;a pas son propre logo.
            {current?.armoiries === "courriers" && " Pour l'instant, ce sont celles relevées dans vos courriers Word."}
          </p>
          {current?.armoiries && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="armoiries-apercu" src={`/api/logo?v=${version}`} alt="Armoiries" />
          )}
          <DropZone
            compact
            multiple={false}
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            onFiles={(f) => armoiries(f[0] ?? null)}
            title={current?.armoiries ? "Remplacer les armoiries" : "Ajouter les armoiries"}
            hint="Image PNG ou JPEG, de préférence sur fond transparent ou blanc."
          />
          {erreur && <div className="error-box">{erreur}</div>}
          {current?.armoiries === "choisies" && (
            <div className="toolbar">
              <button className="btn btn-ghost btn-sm" onClick={() => armoiries(null)}>
                Retirer ces armoiries
              </button>
            </div>
          )}
        </section>

        <section className="card panel">
          <h2 className="panel-head clair">Vos données</h2>
          <p className="small muted">
            Les courriers signés, les dossiers, les pièces et les projets restent sur cet ordinateur. Rien n&apos;est envoyé sur
            Internet.
          </p>
          {d && (
            <ul className="chiffres">
              <li>
                <strong>{d.signes}</strong> courrier{d.signes > 1 ? "s" : ""} signé{d.signes > 1 ? "s" : ""}
              </li>
              <li>
                <strong>{d.dossiers}</strong> dossier{d.dossiers > 1 ? "s" : ""} ({d.pieces} pièce{d.pieces > 1 ? "s" : ""})
              </li>
              <li>
                <strong>{d.courriers}</strong> projet{d.courriers > 1 ? "s" : ""} rédigé{d.courriers > 1 ? "s" : ""}
              </li>
            </ul>
          )}
          {d && (
            <p className="small muted">
              Dossier des données : <code className="chemin">{d.dossier}</code>
            </p>
          )}
          <h3 className="sous-titre">Sauvegardes</h3>
          <p className="small muted">
            Une copie de la base est faite automatiquement chaque jour ; les dix dernières sont gardées.
            {s?.derniere ? ` Dernière sauvegarde : ${dateHeure(s.derniere)}.` : " Aucune sauvegarde pour l'instant."}
          </p>
          {s && (
            <p className="small muted">
              Dossier des sauvegardes : <code className="chemin">{s.dossier}</code>
            </p>
          )}
          <div className="toolbar">
            <button className="btn btn-sm" onClick={sauvegarderMaintenant} disabled={sauvegardeEnCours}>
              {sauvegardeEnCours ? "Sauvegarde…" : "Sauvegarder maintenant"}
            </button>
          </div>
        </section>
      </div>
    </>
  );
}
