"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { BulbIcon, CloseIcon, FolderIcon, PenIcon, SearchIcon, StarIcon, UploadIcon } from "@/components/Icons";
import { formatDate } from "@/components/time";
import { prepareFiles, uploadForm } from "@/components/upload";
import type { DossierSummary, SigneSummary } from "@/lib/types";

function Etat({ d }: { d: DossierSummary }) {
  if (d.status === "processing")
    return (
      <span className="pill">
        <span className="spinner" /> Analyse…
      </span>
    );
  if (d.status === "error") return <span className="pill pill-red">Erreur</span>;
  if (d.courriers > 0) return <span className="pill pill-ok">Réponse préparée</span>;
  if (d.status === "ready") return <span className="pill">Analysé</span>;
  return <span className="pill">À rédiger</span>;
}

export default function DossiersPage() {
  const router = useRouter();
  const [dossiers, setDossiers] = useState<DossierSummary[] | null>(null);
  const [signes, setSignes] = useState<SigneSummary[] | null>(null);
  const [query, setQuery] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const res = await fetch(`/api/dossiers?q=${encodeURIComponent(query)}`);
      if (!res.ok || cancelled) return;
      const data = (await res.json()) as { dossiers: DossierSummary[] };
      setDossiers(data.dossiers);
      if (data.dossiers.some((d) => d.status === "processing")) timer = setTimeout(load, 2500);
    };
    const debounce = setTimeout(load, query ? 250 : 0);
    return () => {
      cancelled = true;
      clearTimeout(debounce);
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    fetch("/api/signes")
      .then((r) => (r.ok ? r.json() : { signes: [] }))
      .then((d: { signes: SigneSummary[] }) => setSignes(d.signes));
  }, []);

  async function deposer(files: File[]) {
    setError(null);
    setProgress(0);
    const form = new FormData();
    for (const f of await prepareFiles(files)) form.append("file", f);
    try {
      const { id } = await uploadForm<{ id: string }>("/api/dossiers", form, setProgress);
      router.push(`/dossiers/${id}`);
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    }
  }

  async function courrierLibre() {
    const form = new FormData();
    form.append("libre", "1");
    try {
      const { id } = await uploadForm<{ id: string }>("/api/dossiers", form);
      router.push(`/dossiers/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "La création a échoué.");
    }
  }

  const prets = (signes ?? []).filter((s) => s.status === "ready");
  const sansModele = signes !== null && prets.length === 0;

  return (
    <div className="grid-2">
      <div className="stack">
        <section className="card panel lucarne-wrap">
          <h2 className="panel-head">
            <FolderIcon size={20} /> Lucarne des dossiers imputés
          </h2>
          <DropZone
            className="lucarne"
            onFiles={deposer}
            disabled={progress !== null}
            icon={<FolderIcon size={34} />}
            title="Déposez ici le dossier imputé par le Directeur"
            hint={
              <>
                Le courrier reçu, la fiche d&apos;imputation et les pièces jointes, en une fois : PDF, Word, photos ou scans.
                <br />
                Le rédacteur l&apos;analyse et prépare le projet de réponse.
              </>
            }
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
          <div className="lucarne-actions">
            <button className="btn btn-sm" onClick={courrierLibre}>
              <PenIcon size={15} /> Rédiger un courrier sans dossier
            </button>
          </div>
        </section>

        <section className="card panel">
          <h2 className="panel-head vert">
            <FolderIcon size={20} /> Dossiers
            <span className="spacer small">{dossiers ? `${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""}` : ""}</span>
          </h2>
          <div className="search">
            <SearchIcon />
            <input
              className="input"
              placeholder="Rechercher un dossier, un nom, un objet…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Rechercher"
            />
            {query && (
              <button className="icon-btn search-close" onClick={() => setQuery("")} aria-label="Effacer la recherche">
                <CloseIcon size={16} />
              </button>
            )}
          </div>
          {dossiers === null ? (
            <p className="muted">Chargement…</p>
          ) : dossiers.length === 0 ? (
            <div className="empty">
              {query ? (
                <p>Aucun dossier ne contient « {query} ».</p>
              ) : (
                <p>Aucun dossier pour l&apos;instant. Déposez le premier dans la lucarne ci-dessus.</p>
              )}
            </div>
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
                      <span className="note-item-sub">
                        {formatDate(d.createdAt)}
                        {d.pieces > 0 && (
                          <span>
                            · {d.pieces} pièce{d.pieces > 1 ? "s" : ""}
                          </span>
                        )}
                        {d.demo && <span className="tag tag-mini">démo</span>}
                      </span>
                    </span>
                    <span className="note-item-meta">
                      <Etat d={d} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="stack">
        <section className="card panel compact">
          <h2 className="panel-head vert">
            <StarIcon size={20} filled /> Vos modèles signés
          </h2>
          {signes === null ? (
            <p className="muted small">Chargement…</p>
          ) : sansModele ? (
            <p className="small">
              Aucun modèle pour l&apos;instant. Déposez vos courriers signés : Le rédacteur reprendra leur en-tête, leurs formules
              et leur ton dans chaque réponse.
            </p>
          ) : (
            <p className="small">
              <strong>{prets.filter((s) => s.genre === "courrier").length}</strong> courrier(s) de réponse et{" "}
              <strong>{prets.filter((s) => s.genre === "note").length}</strong> note(s) au Directeur servent de modèles.
            </p>
          )}
          <Link href="/signes" className="btn btn-sm">
            <UploadIcon size={15} /> {sansModele ? "Déposer mes courriers signés" : "Gérer les modèles"}
          </Link>
        </section>
        <section className="conseil">
          <BulbIcon size={26} />
          <div>
            <strong>Comment ça marche</strong>
            <ol className="steps">
              <li>Déposez vos courriers signés dans Modèles.</li>
              <li>Glissez le dossier imputé dans la lucarne.</li>
              <li>Ajoutez les pièces justificatives et vos consignes.</li>
              <li>Relisez le projet, puis exportez-le en Word ou en PDF.</li>
            </ol>
          </div>
        </section>
      </aside>
    </div>
  );
}
