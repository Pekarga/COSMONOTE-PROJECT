"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackIcon, OpenIcon, RefreshIcon, StarIcon, TrashIcon } from "@/components/Icons";
import { LetterSheet } from "@/components/LetterSheet";
import { SCAN_LU, signalerScans } from "@/components/LecteurScans";
import { toPng, uploadForm } from "@/components/upload";
import { GENRES } from "@/lib/style";
import type { Genre, Signe } from "@/lib/types";

type Champ = "type" | "objet" | "entete" | "enteteDroite" | "refs" | "lieu" | "destinataire" | "appel" | "politesse" | "signature" | "ampliation" | "pied" | "police" | "style";

const CHAMPS: { key: Champ; label: string; rows?: number; aide?: string }[] = [
  { key: "type", label: "Type de courrier", rows: 1, aide: "Sert à choisir les meilleurs modèles : réponse défavorable, demande de régularisation…" },
  { key: "entete", label: "En-tête de gauche", rows: 8 },
  { key: "enteteDroite", label: "En-tête de droite", rows: 4 },
  { key: "refs", label: "Références", rows: 2 },
  { key: "lieu", label: "Ville", rows: 1 },
  { key: "destinataire", label: "Destinataire (exemple)", rows: 5 },
  { key: "appel", label: "Formule d'appel", rows: 1 },
  { key: "politesse", label: "Formule de politesse", rows: 3 },
  { key: "signature", label: "Signature tapée", rows: 3, aide: "Laissez vide si le Directeur signe à la main." },
  { key: "ampliation", label: "Ampliation (exemple)", rows: 3 },
  { key: "pied", label: "Pied de page", rows: 2 },
  { key: "police", label: "Police", rows: 1 },
  { key: "style", label: "Notes de style", rows: 5, aide: "Ce que Le rédacteur retient de votre manière d'écrire." },
];

export default function SignePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [signe, setSigne] = useState<Signe | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [onglet, setOnglet] = useState<"apercu" | "reglages" | "texte">("apercu");
  const [saved, setSaved] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/signes/${id}`);
    if (res.status === 404) return setNotFound(true);
    if (!res.ok) return;
    setSigne(((await res.json()) as { signe: Signe }).signe);
  }, [id]);

  useEffect(() => {
    load();
    window.addEventListener(SCAN_LU, load);
    return () => window.removeEventListener(SCAN_LU, load);
  }, [load]);

  useEffect(() => {
    if (signe?.status !== "processing" && signe?.status !== "a_lire") return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [signe, load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const body = pending.current;
    pending.current = {};
    if (!Object.keys(body).length) return;
    await fetch(`/api/signes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaved(true);
  }, [id]);

  useEffect(() => () => void flush(), [flush]);

  function change(patch: Partial<Signe>) {
    setSigne((s) => (s ? { ...s, ...patch } : s));
    pending.current = { ...pending.current, ...patch };
    setSaved(false);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  async function action(body: Record<string, unknown>) {
    await flush();
    const res = await fetch(`/api/signes/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) setSigne(((await res.json()) as { signe: Signe }).signe);
  }

  /** Relit le fichier d'origine (un scan repasse par la lecture sur l'ordinateur). */
  async function relire() {
    await action({ relire: true });
    signalerScans();
  }

  async function image(kind: "logo" | "signature", file: File | null) {
    setImgError(null);
    try {
      if (file) {
        const form = new FormData();
        form.append("file", await toPng(file, kind === "logo" ? 600 : 900));
        await uploadForm(`/api/signes/${id}/image?kind=${kind}`, form);
      } else {
        await fetch(`/api/signes/${id}/image?kind=${kind}`, { method: "DELETE" });
      }
      setVersion((v) => v + 1);
      await load();
    } catch (e) {
      setImgError(e instanceof Error ? e.message : "L'image n'a pas pu être enregistrée.");
    }
  }

  async function supprimer() {
    await fetch(`/api/signes/${id}`, { method: "DELETE" });
    router.push("/signes");
  }

  if (notFound)
    return (
      <div className="empty">
        <p>Ce courrier n&apos;existe plus.</p>
        <Link href="/signes" className="btn">
          Retour aux courriers signés
        </Link>
      </div>
    );
  if (!signe) return <p className="muted" style={{ marginTop: 32 }}>Chargement…</p>;

  const logoUrl = signe.hasLogo ? `/api/signes/${id}/image?kind=logo&v=${version}` : null;
  const signatureUrl = signe.hasSignatureImg ? `/api/signes/${id}/image?kind=signature&v=${version}` : null;

  return (
    <div className="editor">
      <div className="note-topbar">
        <Link href="/signes" className="icon-btn" aria-label="Retour">
          <BackIcon />
        </Link>
        <div className="editor-title">
          <span className="small muted">{signe.nomFichier}</span>
          <strong>{signe.objet || signe.nomFichier}</strong>
        </div>
        {!saved && <span className="save-state saving">Enregistrement…</span>}
        <a className="btn btn-sm" href={`/api/signes/${id}/fichier`} target="_blank" rel="noreferrer">
          <OpenIcon size={15} /> Original
        </a>
        {signe.status === "ready" && (
          <button
            className={`btn btn-sm ${signe.defaut ? "btn-on" : ""}`}
            onClick={() => action({ defaut: true })}
            disabled={signe.defaut}
            title="Mise en page utilisée pour les nouveaux projets"
          >
            <StarIcon size={15} filled={signe.defaut} /> {signe.defaut ? "Par défaut" : "Utiliser par défaut"}
          </button>
        )}
        {confirmDelete ? (
          <>
            <button className="btn btn-sm btn-danger" onClick={supprimer}>
              Supprimer
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setConfirmDelete(false)}>
              Annuler
            </button>
          </>
        ) : (
          <button className="icon-btn" onClick={() => setConfirmDelete(true)} aria-label="Supprimer ce courrier">
            <TrashIcon />
          </button>
        )}
      </div>

      {signe.status === "a_lire" && (
        <div className="card processing">
          <span className="spinner" />
          <h2>Scan en attente de lecture…</h2>
          <p className="muted">
            Le rédacteur lit le texte des scans sur cet ordinateur, un par un, sans Internet. Vous pouvez continuer à travailler.
          </p>
        </div>
      )}
      {signe.status === "processing" && (
        <div className="card processing">
          <span className="spinner" />
          <h2>Lecture du courrier…</h2>
          <p className="muted">Le rédacteur relève l&apos;en-tête, les références, les formules et le style.</p>
        </div>
      )}
      {signe.status === "error" && (
        <div className="card panel">
          <div className="error-box">{signe.error}</div>
          <button className="btn btn-primary" onClick={relire}>
            <RefreshIcon size={15} /> Relire le courrier
          </button>
        </div>
      )}

      {signe.status === "ready" && (
        <>
          {signe.resume && <p className="lead">{signe.resume}</p>}
          <div className="segmented" role="tablist">
            {(
              [
                ["apercu", "Mise en page"],
                ["reglages", "Réglages du modèle"],
                ["texte", "Texte lu"],
              ] as const
            ).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={onglet === k} className={onglet === k ? "on" : ""} onClick={() => setOnglet(k)}>
                {label}
              </button>
            ))}
          </div>

          {onglet === "apercu" && (
            <>
              <p className="small muted">
                Voici la mise en page que Le rédacteur reprendra pour les nouveaux projets. Le corps est un rappel du courrier
                d&apos;origine.
              </p>
              <LetterSheet
                value={{
                  genre: signe.genre,
                  entete: signe.entete,
                  enteteDroite: signe.enteteDroite,
                  refs: signe.refs,
                  vref: "",
                  lieu: signe.lieu,
                  date: "",
                  destinataire: signe.destinataire,
                  objet: signe.objet,
                  pj: "",
                  appel: signe.appel,
                  corps: "[…]",
                  politesse: signe.politesse,
                  signature: signe.signature,
                  ampliation: signe.ampliation,
                  pied: signe.pied,
                  police: signe.police,
                }}
                logoUrl={logoUrl}
                signatureUrl={signatureUrl}
              />
            </>
          )}

          {onglet === "reglages" && (
            <div className="card panel form-grid">
              <div className="form-row">
                <span className="field-label">Genre</span>
                <div className="segmented">
                  {(Object.keys(GENRES) as Genre[]).map((g) => (
                    <button key={g} className={signe.genre === g ? "on" : ""} onClick={() => change({ genre: g })}>
                      {GENRES[g]}
                    </button>
                  ))}
                </div>
              </div>
              <label className="check-row">
                <input type="checkbox" checked={signe.dateBlanche} onChange={(e) => change({ dateBlanche: e.target.checked })} />
                <span>Laisser la date en blanc (« {signe.lieu || "Abidjan"}, le »), complétée à la signature</span>
              </label>

              <div className="images-row">
                {(["logo", "signature"] as const).map((kind) => {
                  const url = kind === "logo" ? logoUrl : signatureUrl;
                  return (
                    <div key={kind} className="image-slot">
                      <span className="field-label">{kind === "logo" ? "Logo ou armoiries" : "Signature scannée (facultatif)"}</span>
                      {url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={url} alt={kind} />
                      ) : (
                        <span className="small muted">{kind === "logo" ? "Aucun logo" : "Aucune : espace laissé pour la signature manuscrite"}</span>
                      )}
                      <div className="toolbar">
                        <label className="btn btn-sm">
                          {url ? "Remplacer" : "Ajouter une image"}
                          <input
                            type="file"
                            hidden
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              e.target.value = "";
                              if (f) image(kind, f);
                            }}
                          />
                        </label>
                        {url && (
                          <button className="btn btn-sm btn-ghost" onClick={() => image(kind, null)}>
                            Retirer
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              {imgError && <div className="error-box">{imgError}</div>}

              {CHAMPS.map((c) => (
                <label key={c.key} className="form-row">
                  <span className="field-label">{c.label}</span>
                  <textarea
                    className="input"
                    rows={c.rows ?? 2}
                    value={signe[c.key]}
                    onChange={(e) => change({ [c.key]: e.target.value } as Partial<Signe>)}
                  />
                  {c.aide && <span className="small muted">{c.aide}</span>}
                </label>
              ))}
              <div className="toolbar">
                <button className="btn btn-ghost btn-sm" onClick={relire}>
                  <RefreshIcon size={15} /> Relire le fichier d&apos;origine
                </button>
              </div>
            </div>
          )}

          {onglet === "texte" && (
            <div className="card panel">
              <p className="small muted">Texte lu dans le fichier. Il sert d&apos;exemple de style lors de la rédaction.</p>
              <textarea className="input pre" rows={24} value={signe.texte} onChange={(e) => change({ texte: e.target.value })} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
