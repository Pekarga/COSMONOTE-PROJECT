"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { DropZone } from "@/components/DropZone";
import { LetterIcon, StarIcon, UploadIcon } from "@/components/Icons";
import { formatDate } from "@/components/time";
import { relireSignes, sansCle } from "@/components/ocr";
import { joindreFichiers, uploadForm } from "@/components/upload";
import { GENRES } from "@/lib/style";
import type { SigneSummary } from "@/lib/types";

export default function SignesPage() {
  const [signes, setSignes] = useState<SigneSummary[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [coller, setColler] = useState(false);
  const [texte, setTexte] = useState("");
  const [lecture, setLecture] = useState<string | null>(null);
  const [relecture, setRelecture] = useState<string | null>(null);
  const [demo, setDemo] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/signes");
    if (!res.ok) return;
    setSignes(((await res.json()) as { signes: SigneSummary[] }).signes);
  }, []);

  useEffect(() => {
    load();
    sansCle().then(setDemo);
  }, [load]);

  useEffect(() => {
    if (!signes?.some((s) => s.status === "processing")) return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [signes, load]);

  async function envoyer(form: FormData) {
    setError(null);
    setMessage(null);
    setProgress(0);
    try {
      const r = await uploadForm<{
        ids: string[];
        refuses: string[];
        message: string | null;
      }>("/api/signes", form, setProgress);
      if (r.refuses.length) setMessage(`Non pris en compte : ${r.refuses.join(", ")}. ${r.message ?? ""}`);
      setTexte("");
      setColler(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    } finally {
      setProgress(null);
    }
  }

  async function deposer(files: File[]) {
    setError(null);
    setMessage(null);
    const form = new FormData();
    try {
      await joindreFichiers(form, files, setLecture);
    } finally {
      setLecture(null);
    }
    await envoyer(form);
  }

  async function relireErreurs() {
    const enErreur = (signes ?? []).filter((s) => s.status === "error");
    setError(null);
    setMessage(null);
    setRelecture("Préparation…");
    try {
      const n = await relireSignes(enErreur, (m) => setRelecture(m ?? "Analyse des courriers…"));
      if (demo && n < enErreur.length) {
        setMessage(
          n
            ? `${n} scan${n > 1 ? "s" : ""} lu${n > 1 ? "s" : ""} sur ${enErreur.length}. Pour les autres, déposez une version Word ou un PDF plus net.`
            : "Aucun texte n'a pu être lu sur ces fichiers. Déposez une version Word, ou un scan plus net.",
        );
      }
    } finally {
      await load();
      setRelecture(null);
    }
  }

  async function defaut(s: SigneSummary) {
    await fetch(`/api/signes/${s.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ defaut: true }),
    });
    await load();
  }

  const prets = signes?.filter((s) => s.status === "ready") ?? [];
  const notes = prets.filter((s) => s.genre === "note").length;
  const enErreur = signes?.filter((s) => s.status === "error").length ?? 0;

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
          disabled={progress !== null || lecture !== null || relecture !== null}
          icon={<UploadIcon size={30} />}
          title="Déposez ici tous vos courriers signés"
          hint="Plusieurs fichiers à la fois : Word (.docx) de préférence, PDF, ou photos et scans."
        />
        {lecture && (
          <div className="upload-strip">
            <span className="spinner" />
            <span>{lecture}</span>
          </div>
        )}
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
              if (!texte.trim()) return;
              const form = new FormData();
              form.append("texte", texte);
              envoyer(form);
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
        </h2>
        {signes && signes.length > 0 && (
          <p className="small muted">
            {prets.length} modèle{prets.length > 1 ? "s" : ""} prêt
            {prets.length > 1 ? "s" : ""}
            {prets.length > 0 &&
              ` : ${prets.length - notes} courrier${prets.length - notes > 1 ? "s" : ""}, ${notes} note${notes > 1 ? "s" : ""}`}
            .{" "}
          {signes.some((s) => s.defaut)
            ? "L'étoile marque la mise en page utilisée par défaut."
            : "Cliquez sur une étoile pour choisir la mise en page par défaut ; sinon, Le rédacteur prend le modèle le plus complet."}
          </p>
        )}

        {(enErreur > 0 || relecture) && (
          <div className="info-box relire-box">
            <span>
              {enErreur} courrier{enErreur > 1 ? "s n'ont" : " n'a"} pas pu être lu{enErreur > 1 ? "s" : ""}
              {demo ? " : ce sont sans doute des scans. Le rédacteur peut les lire sur cet ordinateur, sans Internet ni clé." : "."}
            </span>
            {relecture ? (
              <span className="upload-strip">
                <span className="spinner" />
                <span>{relecture}</span>
              </span>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={relireErreurs} disabled={lecture !== null || progress !== null}>
                {demo ? "Lire les scans sur cet ordinateur" : "Relire ces courriers"}
              </button>
            )}
          </div>
        )}

        {signes === null ? (
          <p className="muted">Chargement…</p>
        ) : signes.length === 0 ? (
          <div className="empty">
            <p>Aucun courrier signé pour l&apos;instant.</p>
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
                      ) : s.status === "error" ? (
                        <span className="text-red">Lecture impossible</span>
                      ) : (
                        <>
                          <span>{GENRES[s.genre]}</span>
                          {s.type && <span>· {s.type}</span>}
                          <span>· {formatDate(s.createdAt)}</span>
                        </>
                      )}
                      {s.demo && <span className="tag tag-mini">démo</span>}
                    </span>
                  </span>
                  <span className="note-item-meta">
                    {s.status === "processing" && <span className="spinner" />}
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
      </section>
    </>
  );
}
