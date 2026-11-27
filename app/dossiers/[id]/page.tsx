"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DropZone } from "@/components/DropZone";
import {
  AlertIcon,
  BackIcon,
  ClipIcon,
  FileIcon,
  FolderIcon,
  LetterIcon,
  OpenIcon,
  RefreshIcon,
  SparkIcon,
  TrashIcon,
} from "@/components/Icons";
import { formatDate } from "@/components/time";
import { joindreFichiers, uploadForm } from "@/components/upload";
import type { Dossier, Genre, Piece, PieceRole, SigneSummary, Ton } from "@/lib/types";

type CourrierLigne = {
  id: string;
  objet: string;
  createdAt: string;
  status: string;
  demo: boolean;
};
type Data = { dossier: Dossier; pieces: Piece[]; courriers: CourrierLigne[] };

const EXEMPLES: Record<Genre, string[]> = {
  courrier: [
    "Refuser : le virement entre natures de dépense différentes exige un arrêté ministériel",
    "Suggérer de faire viser la décision par le Contrôleur Budgétaire",
    "Accorder une suite favorable à la modification",
  ],
  note: [
    "Proposer d'accorder une suite favorable : aucune irrégularité",
    "Proposer de ne pas donner suite : les crédits de restauration deviendraient insuffisants",
  ],
};

function taille(n: number) {
  return n > 1_000_000 ? `${(n / 1_000_000).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1000))} ko`;
}

function Bloc({ titre, couleur, children }: { titre: string; couleur: string; children: React.ReactNode }) {
  return (
    <section className="an-bloc">
      <span className={`hl hl-${couleur}`}>{titre}</span>
      <div>{children}</div>
    </section>
  );
}

function Liste({ items }: { items: string[] }) {
  return (
    <ul className="an-list">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

export default function DossierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [signes, setSignes] = useState<SigneSummary[]>([]);
  const [titre, setTitre] = useState("");
  const [consignes, setConsignes] = useState("");
  const [ton, setTon] = useState<Ton>("courtois");
  const [genre, setGenre] = useState<Genre>("courrier");
  const [signeId, setSigneId] = useState<string>("");
  const [envoi, setEnvoi] = useState<{ role: PieceRole; pct: number } | null>(null);
  const [lecture, setLecture] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redaction, setRedaction] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dossiers/${id}`);
    if (res.status === 404) return setNotFound(true);
    if (!res.ok) return;
    const d = (await res.json()) as Data;
    setData(d);
    if (!loaded.current) {
      loaded.current = true;
      setTitre(d.dossier.titre);
      setConsignes(d.dossier.consignes);
      setTon(d.dossier.ton);
      setGenre(d.dossier.genre);
      setSigneId(d.dossier.signeId ?? "");
    } else {
      setTitre((t) => (d.dossier.titre !== t && document.activeElement?.id !== "titre" ? d.dossier.titre : t));
    }
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/signes")
      .then((r) => (r.ok ? r.json() : { signes: [] }))
      .then((d: { signes: SigneSummary[] }) => setSignes(d.signes.filter((s) => s.status === "ready")));
  }, [load]);

  const enCours = data?.dossier.status === "processing" || data?.courriers.some((c) => c.status === "processing");
  useEffect(() => {
    if (!enCours) return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [enCours, data, load]);

  async function patch(body: Record<string, unknown>) {
    await fetch(`/api/dossiers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function ajouter(files: File[], role: PieceRole) {
    setError(null);
    setEnvoi({ role, pct: 0 });
    const form = new FormData();
    form.append("role", role);
    setLecture("Préparation des fichiers…");
    try {
      await joindreFichiers(form, files, setLecture);
    } finally {
      setLecture(null);
    }
    try {
      const r = await uploadForm<{ message: string | null; refuses: string[] }>(`/api/dossiers/${id}/pieces`, form, (pct) =>
        setEnvoi({ role, pct }),
      );
      if (r.refuses?.length) setError(`Non ajoutés : ${r.refuses.join(", ")}. ${r.message ?? ""}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "L'envoi a échoué.");
    }
    setEnvoi(null);
    load();
  }

  async function retirer(piece: Piece) {
    await fetch(`/api/pieces/${piece.id}`, { method: "DELETE" });
    load();
  }

  async function joindre(piece: Piece, value: boolean) {
    setData(
      (d) =>
        d && {
          ...d,
          pieces: d.pieces.map((p) => (p.id === piece.id ? { ...p, joindre: value } : p)),
        },
    );
    await fetch(`/api/pieces/${piece.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ joindre: value }),
    });
  }

  async function relancer() {
    await fetch(`/api/dossiers/${id}/analyse`, { method: "POST" });
    load();
  }

  async function rediger() {
    setError(null);
    setRedaction(true);
    const res = await fetch(`/api/dossiers/${id}/rediger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ consignes, ton, genre, signeId: signeId || null }),
    });
    const d = (await res.json().catch(() => ({}))) as {
      id?: string;
      error?: string;
    };
    if (res.ok && d.id) router.push(`/courriers/${d.id}`);
    else {
      setRedaction(false);
      setError(d.error ?? "La rédaction n'a pas pu démarrer.");
    }
  }

  async function supprimer() {
    await fetch(`/api/dossiers/${id}`, { method: "DELETE" });
    router.push("/");
  }

  if (notFound)
    return (
      <div className="empty">
        <p>Ce dossier n&apos;existe plus.</p>
        <Link href="/" className="btn">
          Retour aux dossiers
        </Link>
      </div>
    );
  if (!data)
    return (
      <p className="muted" style={{ marginTop: 32 }}>
        Chargement…
      </p>
    );

  const { dossier, pieces, courriers } = data;
  const a = dossier.analyse;
  const piecesDossier = pieces.filter((p) => p.role === "dossier");
  const justificatifs = pieces.filter((p) => p.role === "justificatif");
  const modeles = signes.filter((s) => s.genre === genre);

  const ligne = (p: Piece) => (
    <li key={p.id} className="piece">
      <span className="piece-icon">{p.role === "justificatif" ? <ClipIcon size={16} /> : <FileIcon size={16} />}</span>
      <span className="piece-main">
        <a href={`/api/pieces/${p.id}`} target="_blank" rel="noreferrer" className="piece-nom" title="Ouvrir">
          {p.nom}
        </a>
        <span className="piece-sub">
          {taille(p.taille)}
          {!p.texte && !/\.(jpe?g|png|webp)$/i.test(p.nom) && " · sans texte lisible"}
          {/\.(jpe?g|png|webp)$/i.test(p.nom) && " · photo"}
        </span>
      </span>
      {p.role === "justificatif" && (
        <label className="joindre" title="Mentionner cette pièce en P.J. du courrier">
          <input type="checkbox" checked={p.joindre} onChange={(e) => joindre(p, e.target.checked)} /> P.J.
        </label>
      )}
      <a className="icon-btn icon-btn-sm" href={`/api/pieces/${p.id}`} target="_blank" rel="noreferrer" aria-label="Ouvrir">
        <OpenIcon size={15} />
      </a>
      <button className="icon-btn icon-btn-sm" onClick={() => retirer(p)} aria-label={`Retirer ${p.nom}`}>
        <TrashIcon size={15} />
      </button>
    </li>
  );

  return (
    <div className="dossier">
      <div className="note-topbar">
        <Link href="/" className="icon-btn" aria-label="Retour aux dossiers">
          <BackIcon />
        </Link>
        <input
          id="titre"
          className="title-input"
          value={titre}
          onChange={(e) => setTitre(e.target.value)}
          onBlur={() => titre.trim() && titre !== dossier.titre && patch({ titre })}
          aria-label="Titre du dossier"
        />
        {confirmDelete ? (
          <span className="toolbar">
            <button className="btn btn-sm btn-danger" onClick={supprimer}>
              Supprimer le dossier
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </span>
        ) : (
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Supprimer le dossier">
            <TrashIcon />
          </button>
        )}
      </div>
      <p className="note-meta">
        Créé {formatDate(dossier.createdAt).toLowerCase()} · {pieces.length} pièce{pieces.length > 1 ? "s" : ""}
        {dossier.demo && <span className="tag tag-mini">analyse démo</span>}
      </p>

      {error && (
        <div className="error-box" style={{ margin: "12px 0" }}>
          {error}
        </div>
      )}

      <div className="dossier-grid">
        <aside className="dossier-pieces">
          <section className="card panel">
            <h2 className="panel-head">
              <FolderIcon size={20} /> Dossier imputé
            </h2>
            {piecesDossier.length > 0 && <ul className="pieces">{piecesDossier.map(ligne)}</ul>}
            <DropZone
              compact
              onFiles={(f) => ajouter(f, "dossier")}
              disabled={envoi !== null}
              title={envoi?.role === "dossier" ? (lecture ?? `Envoi… ${envoi.pct}%`) : "Ajouter des pièces au dossier"}
              hint="Courrier reçu, fiche d'imputation, décision…"
            />
          </section>

          <section className="card panel">
            <h2 className="panel-head vert">
              <ClipIcon size={20} /> Pièces justificatives
            </h2>
            {justificatifs.length > 0 ? (
              <ul className="pieces">{justificatifs.map(ligne)}</ul>
            ) : (
              <p className="small muted">
                Situation d&apos;exécution, marché, arrêté, tableau… Elles servent à l&apos;analyse ; cochez P.J. pour les joindre
                au courrier.
              </p>
            )}
            <DropZone
              compact
              onFiles={(f) => ajouter(f, "justificatif")}
              disabled={envoi !== null}
              title={envoi?.role === "justificatif" ? (lecture ?? `Envoi… ${envoi.pct}%`) : "Ajouter des pièces justificatives"}
            />
          </section>
        </aside>

        <div className="dossier-main">
          <section className="card panel">
            <h2 className="panel-head">
              <SparkIcon size={20} /> Analyse du dossier
              {pieces.length > 0 && dossier.status !== "processing" && (
                <button className="btn btn-sm spacer" onClick={relancer}>
                  <RefreshIcon size={14} /> Relancer
                </button>
              )}
            </h2>
            {dossier.status === "processing" ? (
              <div className="processing">
                <span className="spinner" />
                <span>{dossier.step ?? "Analyse en cours"}…</span>
              </div>
            ) : dossier.status === "error" ? (
              <div className="error-box">L&apos;analyse a échoué : {dossier.error}</div>
            ) : !a ? (
              <p className="muted">
                Déposez les pièces du dossier à gauche pour les faire analyser, ou écrivez directement vos consignes ci-dessous.
              </p>
            ) : (
              <div className="analyse">
                <p className="essentiel">{a.resume}</p>
                {a.instructionDirecteur && (
                  <Bloc titre="Instruction du Directeur" couleur="red">
                    <p>{a.instructionDirecteur}</p>
                  </Bloc>
                )}
                {(a.refCourrier || a.dateCourrier || a.objetCourrier) && (
                  <Bloc titre="Courrier reçu" couleur="slate">
                    <p>
                      {a.refCourrier && <>N°{a.refCourrier.replace(/^N°\s*/i, "")} </>}
                      {a.dateCourrier && <>du {a.dateCourrier}</>}
                    </p>
                    {a.objetCourrier && <p>Objet : {a.objetCourrier}</p>}
                  </Bloc>
                )}
                {a.demandeur && (
                  <Bloc titre="Répondre à" couleur="slate">
                    <p className="pre">{a.demandeur}</p>
                  </Bloc>
                )}
                {a.demandes.length > 0 && (
                  <Bloc titre="Ce qui est demandé" couleur="ochre">
                    <Liste items={a.demandes} />
                  </Bloc>
                )}
                {a.elements.length > 0 && (
                  <Bloc titre="Éléments clés" couleur="sage">
                    <Liste items={a.elements} />
                  </Bloc>
                )}
                {a.echeance && (
                  <Bloc titre="Échéance" couleur="red">
                    <p>{a.echeance}</p>
                  </Bloc>
                )}
                {a.orientation && (
                  <Bloc titre="Proposition" couleur="sage">
                    <p>{a.orientation}</p>
                  </Bloc>
                )}
                {a.pointsAVerifier.length > 0 && (
                  <div className="warn-box">
                    <AlertIcon size={16} />
                    <div>
                      <strong>Points à vérifier</strong>
                      <Liste items={a.pointsAVerifier} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="card panel">
            <h2 className="panel-head vert">
              <LetterIcon size={20} /> Préparer le projet
            </h2>
            <div className="segmented" role="tablist">
              {(["courrier", "note"] as Genre[]).map((g) => (
                <button
                  key={g}
                  className={genre === g ? "on" : ""}
                  onClick={() => {
                    setGenre(g);
                    setSigneId("");
                  }}
                >
                  {g === "courrier" ? "Courrier de réponse" : "Note au Directeur"}
                </button>
              ))}
            </div>
            <label className="field-label" htmlFor="consignes">
              {genre === "courrier" ? "Ce que la réponse doit dire" : "Ce que la note doit proposer"}
            </label>
            <textarea
              id="consignes"
              className="textarea"
              placeholder={
                genre === "courrier"
                  ? "Une idée par ligne. Ex. : Refuser : le virement exige un arrêté ministériel. Suggérer de reformuler la requête."
                  : "Une idée par ligne. Ex. : Proposer d'accorder une suite favorable, aucune irrégularité relevée."
              }
              value={consignes}
              onChange={(e) => setConsignes(e.target.value)}
              onBlur={() => patch({ consignes })}
            />
            <div className="chips">
              {EXEMPLES[genre].map((x) => (
                <button key={x} className="chip" onClick={() => setConsignes((c) => (c.trim() ? `${c.trim()}\n${x}` : x))}>
                  {x}
                </button>
              ))}
            </div>
            <div className="form-row">
              <label>
                <span className="field-label">Ton</span>
                <select className="input" value={ton} onChange={(e) => setTon(e.target.value as Ton)}>
                  <option value="courtois">Courtois et neutre</option>
                  <option value="ferme">Ferme</option>
                  <option value="bienveillant">Bienveillant</option>
                </select>
              </label>
              <label>
                <span className="field-label">Mise en page</span>
                <select className="input" value={signeId} onChange={(e) => setSigneId(e.target.value)}>
                  <option value="">{modeles.length ? "Votre modèle par défaut" : "Aucun modèle de ce type déposé"}</option>
                  {modeles.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.objet || s.nomFichier}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button
              className="btn btn-primary btn-wide"
              onClick={rediger}
              disabled={redaction || dossier.status === "processing"}
            >
              {redaction ? <span className="spinner" /> : <SparkIcon size={16} />}
              {genre === "courrier" ? "Rédiger le projet de réponse" : "Rédiger la note au Directeur"}
            </button>
          </section>

          {courriers.length > 0 && (
            <section className="card panel">
              <h2 className="panel-head clair">
                <LetterIcon size={18} /> Projets rédigés
              </h2>
              <ul className="note-list">
                {courriers.map((c) => (
                  <li key={c.id}>
                    <Link href={`/courriers/${c.id}`} className="note-item">
                      <span className="kind">
                        <LetterIcon size={16} />
                      </span>
                      <span className="note-item-main">
                        <span className="note-item-title">{c.objet || "Projet en cours de rédaction"}</span>
                        <span className="note-item-sub">
                          {formatDate(c.createdAt)}
                          {c.demo && <span className="tag tag-mini">démo</span>}
                        </span>
                      </span>
                      <span className="note-item-meta">
                        {c.status === "processing" ? (
                          <span className="spinner" />
                        ) : c.status === "error" ? (
                          <span className="pill pill-red">Erreur</span>
                        ) : null}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
