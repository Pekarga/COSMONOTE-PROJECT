"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { CloseIcon, LetterIcon, SearchIcon, StarIcon, UploadIcon } from "@/components/Icons";
import { SCAN_LU } from "@/components/LecteurScans";
import { formatDate } from "@/components/time";
import { envoyerParLots, uploadForm } from "@/components/upload";
import { GENRES } from "@/lib/style";
import type { SigneCompteurs, SigneSummary } from "@/lib/types";

const PAGE = 50;
type Reponse = { signes: SigneSummary[]; total: number; compteurs: SigneCompteurs };

export default function SignesPage() {
  const [signes, setSignes] = useState<SigneSummary[] | null>(null);
  const [total, setTotal] = useState(0);
  const [compteurs, setCompteurs] = useState<SigneCompteurs | null>(null);
  const [limite, setLimite] = useState(PAGE);
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coller, setColler] = useState(false);
  const [texte, setTexte] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/signes?limite=${limite}&q=${encodeURIComponent(query)}`);
    if (!res.ok) return;
    const r = (await res.json()) as Reponse;
    setSignes(r.signes);
    setTotal(r.total);
    setCompteurs(r.compteurs);
  }, [limite, query]);

  useEffect(() => {
    const t = setTimeout(load, query ? 250 : 0);
    // Un scan vient d'être lu sur l'ordinateur : la liste se met à jour.
    window.addEventListener(SCAN_LU, load);
    return () => {
      clearTimeout(t);
      window.removeEventListener(SCAN_LU, load);
    };
  }, [load, query]);

  const enCours = (compteurs?.enCours ?? 0) + (compteurs?.aLire ?? 0) > 0;
  useEffect(() => {
    if (!enCours) return;
    const t = setTimeout(load, 3000);
    return () => clearTimeout(t);
  }, [enCours, signes, load]);

  type Depot = { ids: string[]; refuses: string[]; message: string | null };

  async function deposer(files: File[]) {
    setError(null);
    setMessage(null);
    setProgress(0);
    try {
      const resultats = await envoyerParLots(
        files,
        (form, _rang, progression) => uploadForm<Depot>("/api/signes", form, progression),
        setProgress,
      );
      const refuses = resultats.flatMap((r) => r.refuses);
      const recus = resultats.reduce((n, r) => n + r.ids.length, 0);
      setMessage(
        [
          files.length > 1 ? `${recus} courrier${recus > 1 ? "s" : ""} reçu${recus > 1 ? "s" : ""} : Le rédacteur les lit un par un, vous pouvez continuer à travailler.` : "",
          refuses.length ? `Non pris en compte : ${refuses.join(", ")}. ${resultats.find((r) => r.message)?.message ?? ""}` : "",
        ]
          .filter(Boolean)
          .join(" ") || null,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setProgress(null);
      await load();
    }
  }

  async function collerTexte() {
    if (!texte.trim()) return;
    setError(null);
    const form = new FormData();
    form.append("texte", texte);
    try {
      await uploadForm("/api/signes", form);
      setTexte("");
      setColler(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    }
    await load();
  }

  async function relireErreurs() {
    setMessage(null);
    await fetch("/api/signes/relire", { method: "POST" });
    window.dispatchEvent(new Event("redacteur:scans-a-lire"));
    await load();
  }

  async function defaut(s: SigneSummary) {
    await fetch(`/api/signes/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaut: true }),
    });
    await load();
  }

  const c = compteurs;

  return (
    <>
      <section className="card panel">
        <h2 className="panel-head">
          <UploadIcon size={20} /> Modèles : vos courriers signés
        </h2>
        <p className="lead">
          Vos courriers déjà signés servent de modèles : Le rédacteur reprend leur en-tête, leurs références, leurs formules et
          leur ton. Plus vous en déposez, plus les projets ressemblent à vos courriers.
        </p>

        <DropZone
          className="lucarne"
          onFiles={deposer}
          disabled={progress !== null}
          icon={<UploadIcon size={30} />}
          title="Déposez ici tous vos courriers signés"
          hint="Autant de fichiers que vous voulez, ou un dossier entier : Word (.docx), PDF, scans ou photos."
        />
        {progress !== null && (
          <div className="upload-strip">
            <span>Envoi… {progress}%</span>
            <div className="progress">
              <div style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {error && <div className="error-box">{error}</div>}
        {message && <div className="info-box">{message}</div>}

        <div className="lucarne-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setColler((v) => !v)}>
            Coller le texte d&apos;un courrier
          </button>
        </div>
        {coller && (
          <form
            className="card panel"
            onSubmit={(e) => {
              e.preventDefault();
              collerTexte();
            }}
          >
            <textarea
              className="input"
              rows={10}
              value={texte}
              onChange={(e) => setTexte(e.target.value)}
              placeholder="Collez ici le texte complet d'un courrier signé, de l'en-tête à l'ampliation."
            />
            <div className="toolbar">
              <button className="btn btn-primary" disabled={!texte.trim() || progress !== null}>
                Ajouter ce courrier
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="card panel">
        <h2 className="panel-head vert">
          <LetterIcon size={20} /> Modèles enregistrés
          <span className="spacer small">{c ? `${c.total} courrier${c.total > 1 ? "s" : ""}` : ""}</span>
        </h2>
        {c && c.total > 0 && (
          <p className="small muted">
            {c.prets} modèle{c.prets > 1 ? "s" : ""} prêt{c.prets > 1 ? "s" : ""}
            {c.prets > 0 && ` : ${c.prets - c.notes} courrier${c.prets - c.notes > 1 ? "s" : ""}, ${c.notes} note${c.notes > 1 ? "s" : ""}`}
            {c.aLire + c.enCours > 0 && ` · ${c.aLire + c.enCours} en cours de lecture`}. Cliquez sur une étoile pour choisir la
            mise en page par défaut ; sinon, Le rédacteur prend le modèle le plus complet.
          </p>
        )}

        {c && c.erreurs > 0 && (
          <div className="info-box relire-box">
            <span>
              {c.erreurs} courrier{c.erreurs > 1 ? "s n'ont" : " n'a"} pas pu être lu{c.erreurs > 1 ? "s" : ""}.
            </span>
            <button className="btn btn-primary btn-sm" onClick={relireErreurs}>
              Relire {c.erreurs > 1 ? `les ${c.erreurs} courriers` : "ce courrier"}
            </button>
          </div>
        )}

        {c && c.total > PAGE && (
          <div className="search">
            <SearchIcon />
            <input
              className="input"
              placeholder="Rechercher un modèle : objet, destinataire, mot du texte…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimite(PAGE);
              }}
              aria-label="Rechercher un modèle"
            />
            {query && (
              <button className="icon-btn search-close" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                <CloseIcon size={16} />
              </button>
            )}
          </div>
        )}

        {signes === null ? (
          <p className="muted">Chargement…</p>
        ) : signes.length === 0 ? (
          <div className="empty">
            <p>{query ? `Aucun modèle ne contient « ${query} ».` : "Aucun courrier signé pour l'instant."}</p>
          </div>
        ) : (
          <ul className="note-list">
            {signes.map((s) => (
              <li key={s.id} className="signe-row">
                <Link href={`/signes/${s.id}`} className="note-item">
                  <span className={`kind ${s.genre === "note" ? "kind-note" : "kind-dossier"}`}>
                    <LetterIcon size={18} />
                  </span>
                  <span className="note-item-main">
                    <span className="note-item-title">{s.status === "ready" ? s.objet || s.nomFichier : s.nomFichier}</span>
                    <span className="note-item-sub">
                      {s.status === "processing" ? (
                        <span>Lecture du courrier…</span>
                      ) : s.status === "a_lire" ? (
                        <span>Scan en attente de lecture sur cet ordinateur</span>
                      ) : s.status === "error" ? (
                        <span className="text-red">Lecture impossible</span>
                      ) : (
                        <>
                          <span>{GENRES[s.genre]}</span>
                          {s.type && <span>· {s.type}</span>}
                          <span>· {formatDate(s.createdAt)}</span>
                        </>
                      )}
                    </span>
                  </span>
                  <span className="note-item-meta">
                    {(s.status === "processing" || s.status === "a_lire") && <span className="spinner" />}
                    {s.status === "error" && <span className="pill pill-red">Erreur</span>}
                  </span>
                </Link>
                {s.status === "ready" && (
                  <button
                    className={`icon-btn star ${s.defaut ? "on" : ""}`}
                    onClick={() => defaut(s)}
                    title={s.defaut ? "Mise en page par défaut" : "Utiliser cette mise en page par défaut"}
                    aria-label="Mise en page par défaut"
                    aria-pressed={s.defaut}
                  >
                    <StarIcon filled={s.defaut} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {signes && total > signes.length && (
          <div className="plus">
            <span className="small muted">
              {signes.length} sur {total}
            </span>
            <button className="btn btn-sm" onClick={() => setLimite((n) => n + PAGE)}>
              Afficher plus
            </button>
          </div>
        )}
      </section>
    </>
  );
}
