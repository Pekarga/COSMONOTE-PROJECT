"use client";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertIcon,
  BackIcon,
  BulbIcon,
  CloseIcon,
  EyeIcon,
  FileIcon,
  GridIcon,
  PaletteIcon,
  PlusIcon,
  PrinterIcon,
  RedoIcon,
  SaveIcon,
  SearchIcon,
  SendIcon,
  SlidersIcon,
  SparkIcon,
  TrashIcon,
  UndoIcon,
} from "@/components/Icons";
import { LetterSheet, type LetterFields } from "@/components/LetterSheet";
import { useShellActions, useShellStatus } from "@/components/Shell";
import { GENRES, POLICES, aujourdhui, refsPourNouveauCourrier } from "@/lib/style";
import type { Courrier, MiseEnForme, Signe, SigneSummary } from "@/lib/types";

type Data = { courrier: Courrier; images: { logo: boolean; logoCommun?: boolean; signature: boolean } };
type Etat = { fields: LetterFields; forme: MiseEnForme };

const CHAMPS: (keyof LetterFields)[] = [
  "genre",
  "entete",
  "enteteDroite",
  "refs",
  "vref",
  "lieu",
  "date",
  "destinataire",
  "objet",
  "pj",
  "appel",
  "corps",
  "politesse",
  "signature",
  "ampliation",
  "pied",
  "police",
];

function champs(c: Courrier): LetterFields {
  return Object.fromEntries(CHAMPS.map((k) => [k, c[k]])) as LetterFields;
}

const RETOUCHES = ["Ton plus ferme", "Plus court", "Ton plus courtois", "Ajouter un paragraphe de rappel des textes"];

function heure(d: Date) {
  return `${d.toLocaleDateString("fr-FR")} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}`;
}

function compter(f: LetterFields) {
  const texte = [f.destinataire, f.objet, f.appel, f.corps, f.politesse].filter(Boolean).join("\n");
  return {
    lignes: texte.split("\n").filter((l) => l.trim()).length,
    mots: texte.split(/\s+/).filter(Boolean).length,
    caracteres: texte.length,
  };
}

export default function CourrierPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [etat, setEtat] = useState<Etat | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [saved, setSaved] = useState<"ok" | "saving" | "error">("ok");
  const [derniere, setDerniere] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [retouche, setRetouche] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [apercu, setApercu] = useState(false);
  const [modeles, setModeles] = useState<SigneSummary[]>([]);
  const [filtre, setFiltre] = useState("");
  const [infosOuvertes, setInfosOuvertes] = useState(true);
  const pending = useRef<Record<string, unknown>>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const annuler = useRef<Etat[]>([]);
  const retablir = useRef<Etat[]>([]);
  const dernierPas = useRef<{ key: string; t: number }>({ key: "", t: 0 });
  const [, forcer] = useState(0);

  useEffect(() => {
    try {
      if (localStorage.getItem("infos-repliees") === "1") setInfosOuvertes(false);
    } catch {}
  }, []);

  function basculerInfos(v: boolean) {
    setInfosOuvertes(v);
    try {
      localStorage.setItem("infos-repliees", v ? "0" : "1");
    } catch {}
  }

  const load = useCallback(async () => {
    const res = await fetch(`/api/courriers/${id}`);
    if (res.status === 404) return setNotFound(true);
    if (!res.ok) return;
    const d = (await res.json()) as Data;
    setData(d);
    if (d.courrier.status !== "processing") {
      setEtat({ fields: champs(d.courrier), forme: d.courrier.forme });
      setDerniere(heure(new Date(d.courrier.updatedAt)));
    }
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/signes")
      .then((r) => (r.ok ? r.json() : { signes: [] }))
      .then((d: { signes: SigneSummary[] }) => setModeles(d.signes.filter((s) => s.status === "ready")));
  }, [load]);

  useEffect(() => {
    if (data?.courrier.status !== "processing") return;
    const t = setTimeout(load, 2000);
    return () => clearTimeout(t);
  }, [data, load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    const body = pending.current;
    pending.current = {};
    if (!Object.keys(body).length) return true;
    setSaved("saving");
    const res = await fetch(`/api/courriers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);
    setSaved(res?.ok ? "ok" : "error");
    if (res?.ok) setDerniere(heure(new Date()));
    return Boolean(res?.ok);
  }, [id]);

  useEffect(() => () => void flush(), [flush]);

  function planifier(patch: Record<string, unknown>) {
    pending.current = { ...pending.current, ...patch };
    setSaved("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  }

  /** Garde l'état précédent pour « Annuler » (un pas par champ et par seconde de frappe). */
  function memoriser(key: string) {
    if (!etat) return;
    const t = Date.now();
    if (key !== dernierPas.current.key || t - dernierPas.current.t > 1200) {
      annuler.current.push(etat);
      if (annuler.current.length > 100) annuler.current.shift();
      retablir.current = [];
    }
    dernierPas.current = { key, t };
  }

  function change(key: keyof LetterFields, value: string) {
    memoriser(key);
    setEtat((e) => (e ? { ...e, fields: { ...e.fields, [key]: value } } : e));
    planifier({ [key]: value });
  }

  function changeForme(patch: Partial<MiseEnForme>) {
    if (!etat) return;
    memoriser("forme");
    const forme = { ...etat.forme, ...patch };
    setEtat({ ...etat, forme });
    planifier({ forme });
  }

  function restaurer(depuis: Etat[], vers: Etat[]) {
    const prec = depuis.pop();
    if (!prec || !etat) return;
    vers.push(etat);
    setEtat(prec);
    dernierPas.current = { key: "", t: 0 };
    const { genre: _g, ...champsModifiables } = prec.fields;
    void _g;
    planifier({ ...champsModifiables, forme: prec.forme });
    forcer((n) => n + 1);
  }

  async function enregistrer() {
    const ok = await flush();
    setInfo(ok ? null : "L'enregistrement a échoué. Vérifiez que l'application est toujours ouverte.");
  }

  async function imprimer() {
    await flush();
    window.print();
  }

  async function pdf() {
    await flush();
    const nom = (etat?.fields.objet || "Courrier").replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80);
    if (window.redacteur?.savePdf) {
      const chemin = await window.redacteur.savePdf(nom);
      if (chemin) setInfo(`PDF enregistré : ${chemin}`);
    } else {
      window.print();
    }
  }

  async function word() {
    await flush();
    window.location.href = `/api/courriers/${id}/docx`;
  }

  useShellActions(etat ? { enregistrer, imprimer, pdf, word } : null);
  useShellStatus(
    etat
      ? {
          message: saved === "saving" ? "Enregistrement…" : saved === "error" ? "Non enregistré" : "Prêt",
          compteurs: compter(etat.fields),
          sauvegarde: derniere,
        }
      : null,
  );

  // Ctrl+S enregistre, Ctrl+P imprime la feuille.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        void enregistrer();
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        void imprimer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function appliquerModele(s: SigneSummary) {
    const res = await fetch(`/api/signes/${s.id}`);
    if (!res.ok || !etat) return;
    const m = ((await res.json()) as { signe: Signe }).signe;
    memoriser("modele");
    const patch = {
      entete: m.entete,
      enteteDroite: m.enteteDroite,
      refs: refsPourNouveauCourrier(m.refs),
      pied: m.pied,
      police: m.police || etat.fields.police,
      lieu: m.lieu || etat.fields.lieu,
    };
    setEtat({ ...etat, fields: { ...etat.fields, ...patch } });
    setData((d) =>
      d ? { ...d, courrier: { ...d.courrier, signeId: m.id }, images: { ...d.images, logo: m.hasLogo, signature: m.hasSignatureImg } } : d,
    );
    planifier({ ...patch, signeId: m.id });
    setInfo(`Mise en page de « ${m.objet || m.nomFichier} » appliquée.`);
  }

  async function retoucher(texte: string) {
    if (!texte.trim()) return;
    await flush();
    setRetouche(true);
    setInfo(null);
    const res = await fetch(`/api/courriers/${id}/retouche`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: texte }),
    });
    const d = (await res.json().catch(() => ({}))) as { courrier?: Courrier; info?: string | null; error?: string };
    setRetouche(false);
    if (!res.ok) return setInfo(d.error ?? "La retouche a échoué.");
    if (d.info) return setInfo(d.info);
    if (d.courrier && etat) {
      annuler.current.push(etat);
      retablir.current = [];
      setData((x) => (x ? { ...x, courrier: d.courrier! } : x));
      setEtat({ fields: champs(d.courrier), forme: d.courrier.forme });
      setInstruction("");
    }
  }

  async function nouveau() {
    await flush();
    const form = new FormData();
    form.append("libre", "1");
    const res = await fetch("/api/dossiers", { method: "POST", body: form });
    const d = (await res.json().catch(() => ({}))) as { id?: string };
    if (d.id) router.push(`/dossiers/${d.id}`);
  }

  async function supprimer() {
    await fetch(`/api/courriers/${id}`, { method: "DELETE" });
    router.push(data?.courrier.dossierId ? `/dossiers/${data.courrier.dossierId}` : "/courriers");
  }

  const c = data?.courrier;
  const liste = useMemo(() => {
    const q = filtre.trim().toLowerCase();
    return modeles
      .filter((s) => !c || s.genre === c.genre)
      .filter((s) => !q || `${s.objet} ${s.type} ${s.nomFichier}`.toLowerCase().includes(q));
  }, [modeles, filtre, c]);

  if (notFound)
    return (
      <div className="empty">
        <p>Ce projet n&apos;existe plus.</p>
        <Link href="/courriers" className="btn">
          Voir mes courriers
        </Link>
      </div>
    );
  if (!data || !c) return <p className="muted">Chargement…</p>;
  const retour = c.dossierId ? `/dossiers/${c.dossierId}` : "/courriers";
  const note = c.genre === "note";

  if (c.status === "processing" || !etat) {
    return (
      <div className="card processing">
        <span className="spinner" />
        <h2>{note ? "Rédaction de la note…" : "Rédaction du projet de réponse…"}</h2>
        <p className="muted">Le rédacteur s&apos;appuie sur l&apos;analyse du dossier, vos consignes et vos courriers signés.</p>
      </div>
    );
  }
  if (c.status === "error") {
    return (
      <div className="card panel">
        <div className="error-box">La rédaction a échoué : {c.error}</div>
        <Link href={retour} className="btn">
          Retour au dossier
        </Link>
      </div>
    );
  }

  const { fields, forme } = etat;
  const aCompleter =
    Object.values(fields)
      .join("\n")
      .match(/\[à compléter[^\]]*\]/gi)?.length ?? 0;
  const logoUrl =
    data.images.logo && c.signeId ? `/api/signes/${c.signeId}/image?kind=logo` : data.images.logoCommun ? "/api/logo" : null;
  const signatureUrl = data.images.signature && c.signeId ? `/api/signes/${c.signeId}/image?kind=signature` : null;
  const polices = POLICES.includes(fields.police) ? POLICES : [fields.police, ...POLICES];

  return (
    <div className="editor-grid">
      {/* ── Modèles de courriers ── */}
      <aside className="editor-models no-print">
        <section className="card panel compact">
          <h2 className="panel-head">
            <GridIcon size={20} /> Modèles de courriers
          </h2>
          <div className="search-mini">
            <input
              className="input"
              placeholder="Rechercher un modèle…"
              value={filtre}
              onChange={(e) => setFiltre(e.target.value)}
            />
            <SearchIcon size={18} />
          </div>
          {liste.length === 0 ? (
            <p className="small muted">
              Aucun modèle de ce genre. Déposez vos courriers signés dans <Link href="/signes">Modèles</Link>.
            </p>
          ) : (
            <ul className="model-list">
              {liste.map((s) => (
                <li key={s.id}>
                  <button
                    className={c.signeId === s.id ? "on" : ""}
                    onClick={() => appliquerModele(s)}
                    title={s.objet || s.nomFichier}
                  >
                    <FileIcon size={18} />
                    <span>
                      <strong>{s.type || GENRES[s.genre]}</strong>
                      <small>{s.objet || s.nomFichier}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="conseil">
          <BulbIcon size={26} />
          <div>
            <strong>Conseil</strong>
            <p>Cliquez sur un modèle pour reprendre sa mise en page : en-tête, références et pied de page.</p>
          </div>
        </section>
      </aside>

      {/* ── Éditeur ── */}
      <div className="editor-center">
        <div className="editor-actions no-print">
          <Link href={retour} className="btn btn-sm btn-ghost" aria-label="Retour">
            <BackIcon size={16} />
          </Link>
          <button className="btn btn-sm btn-green" onClick={nouveau}>
            <PlusIcon size={16} /> Nouveau
          </button>
          <button className="btn btn-sm btn-primary" onClick={enregistrer}>
            <SaveIcon size={16} /> Sauvegarder
          </button>
          <button className="btn btn-sm" onClick={() => setApercu(true)}>
            <EyeIcon size={16} /> Aperçu
          </button>
          <button className="btn btn-sm" onClick={imprimer}>
            <PrinterIcon size={16} /> Imprimer
          </button>
          <button
            className="btn btn-sm"
            onClick={() => restaurer(annuler.current, retablir.current)}
            disabled={!annuler.current.length}
          >
            <UndoIcon size={16} /> Annuler
          </button>
          <button
            className="btn btn-sm"
            onClick={() => restaurer(retablir.current, annuler.current)}
            disabled={!retablir.current.length}
          >
            <RedoIcon size={16} /> Rétablir
          </button>
          <span className="actions-end" />
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
            <button
              className="icon-btn icon-btn-sm"
              onClick={() => setConfirmDelete(true)}
              aria-label="Supprimer ce projet"
              title="Supprimer ce projet"
            >
              <TrashIcon size={16} />
            </button>
          )}
        </div>

        <section className="card infos no-print">
          <h2 className="panel-head clair">
            <FileIcon size={18} /> Informations du {note ? "document" : "courrier"}
            <span className="small muted spacer">{GENRES[c.genre]}</span>
            <button
              className="icon-btn icon-btn-sm"
              onClick={() => basculerInfos(!infosOuvertes)}
              aria-expanded={infosOuvertes}
              aria-label={infosOuvertes ? "Replier" : "Déplier"}
              title={infosOuvertes ? "Replier" : "Déplier"}
            >
              {infosOuvertes ? "−" : "+"}
            </button>
          </h2>
          {infosOuvertes && (
            <div className="infos-grid">
              <label>
                <span>Destinataire :</span>
                <textarea
                  className="input auto"
                  rows={1}
                  value={fields.destinataire}
                  onChange={(e) => change("destinataire", e.target.value)}
                />
              </label>
              <label>
                <span>Date :</span>
                <span className="date-row">
                  <input
                    className="input"
                    type="date"
                    value={fields.date}
                    onChange={(e) => change("date", e.target.value)}
                    aria-label="Date du courrier"
                  />
                </span>
              </label>
              <label>
                <span>Objet :</span>
                <textarea
                  className="input auto"
                  rows={1}
                  value={fields.objet}
                  onChange={(e) => change("objet", e.target.value)}
                />
              </label>
              <label>
                <span>Référence :</span>
                <textarea className="input auto" rows={1} value={fields.refs} onChange={(e) => change("refs", e.target.value)} />
              </label>
            </div>
          )}
        </section>

        {(c.remarques.length > 0 || aCompleter > 0) && (
          <details className="warn-box no-print">
            <summary>
              <AlertIcon size={16} />
              <strong>Avant signature</strong>
              <span>
                {c.remarques.length > 0 && `${c.remarques.length} remarque${c.remarques.length > 1 ? "s" : ""}`}
                {c.remarques.length > 0 && aCompleter > 0 && " · "}
                {aCompleter > 0 && `${aCompleter} passage${aCompleter > 1 ? "s" : ""} [à compléter]`}
              </span>
            </summary>
            <ul className="an-list">
              {c.remarques.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </details>
        )}
        {info && <div className="info-box no-print">{info}</div>}

        <LetterSheet value={fields} onChange={change} logoUrl={logoUrl} signatureUrl={signatureUrl} forme={forme} />

        <div className="retouche no-print">
          <form
            className="askbar"
            onSubmit={(e) => {
              e.preventDefault();
              retoucher(instruction);
            }}
          >
            {retouche ? <span className="spinner" /> : <SparkIcon size={18} />}
            <input
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={
                retouche ? "Retouche en cours…" : "Demander une retouche : ton plus ferme, citer l'article 64, raccourcir…"
              }
              disabled={retouche}
              aria-label="Retouche"
            />
            <button className="send" disabled={retouche || !instruction.trim()} aria-label="Envoyer">
              <SendIcon size={16} />
            </button>
          </form>
          <div className="retouche-chips">
            {RETOUCHES.map((r) => (
              <button key={r} className="chip" disabled={retouche} onClick={() => retoucher(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Options ── */}
      <aside className="editor-options no-print">
        <section className="card panel compact">
          <h2 className="panel-head vert">
            <SlidersIcon size={20} /> Options d&apos;édition
          </h2>
          <label className="check-row">
            <input type="checkbox" checked={forme.entete} onChange={(e) => changeForme({ entete: e.target.checked })} />
            <span>Ajouter l&apos;en-tête officiel</span>
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={Boolean(fields.date)}
              onChange={(e) => change("date", e.target.checked ? aujourdhui() : "")}
            />
            <span>
              Ajouter la date {fields.date ? "" : <small className="muted">(« {fields.lieu || "Abidjan"}, le » en blanc)</small>}
            </span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={forme.refs} onChange={(e) => changeForme({ refs: e.target.checked })} />
            <span>Ajouter la référence</span>
          </label>
          <label className="check-row">
            <input type="checkbox" checked={forme.pied} onChange={(e) => changeForme({ pied: e.target.checked })} />
            <span>Ajouter le pied de page</span>
          </label>
          <p className="small muted">Signature : l&apos;espace reste vide pour la signature manuscrite.</p>
        </section>

        <section className="card panel compact">
          <h2 className="panel-head">
            <PaletteIcon size={20} /> Mise en page
          </h2>
          <label className="opt-row">
            <span>Police :</span>
            <select className="input" value={fields.police} onChange={(e) => change("police", e.target.value)}>
              {polices.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
          </label>
          <label className="opt-row">
            <span>Taille :</span>
            <select className="input" value={forme.taille} onChange={(e) => changeForme({ taille: Number(e.target.value) })}>
              {[10, 11, 12, 13, 14].map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <div className="opt-row">
            <span>Alignement :</span>
            <div className="align-btns">
              <button
                className={forme.alignement === "left" ? "on" : ""}
                onClick={() => changeForme({ alignement: "left" })}
                title="Aligné à gauche"
                aria-label="Aligné à gauche"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 10h10M4 14h16M4 18h10" />
                </svg>
              </button>
              <button
                className={forme.alignement === "justify" ? "on" : ""}
                onClick={() => changeForme({ alignement: "justify" })}
                title="Justifié"
                aria-label="Justifié"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
          <label className="opt-row">
            <span>Interligne :</span>
            <select
              className="input"
              value={forme.interligne}
              onChange={(e) => changeForme({ interligne: Number(e.target.value) })}
            >
              {[1, 1.15, 1.5, 2].map((t) => (
                <option key={t} value={t}>
                  {String(t).replace(".", ",")}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="card panel compact">
          <h2 className="panel-head vert">
            <EyeIcon size={20} /> Aperçu rapide
          </h2>
          <button className="thumb-btn" onClick={() => setApercu(true)} aria-label="Ouvrir l'aperçu">
            <LetterSheet value={fields} logoUrl={logoUrl} signatureUrl={signatureUrl} forme={forme} zoom={0.27} />
          </button>
        </section>
      </aside>

      {apercu && (
        <div className="overlay no-print" role="dialog" aria-label="Aperçu" onClick={() => setApercu(false)}>
          <div className="overlay-bar" onClick={(e) => e.stopPropagation()}>
            <strong>Aperçu avant impression</strong>
            <button className="btn btn-sm" onClick={imprimer}>
              <PrinterIcon size={16} /> Imprimer
            </button>
            <button className="btn btn-sm btn-primary" onClick={pdf}>
              Exporter PDF
            </button>
            <button className="icon-btn" onClick={() => setApercu(false)} aria-label="Fermer">
              <CloseIcon />
            </button>
          </div>
          <div className="overlay-page" onClick={(e) => e.stopPropagation()}>
            <LetterSheet value={fields} logoUrl={logoUrl} signatureUrl={signatureUrl} forme={forme} zoom={0.9} />
          </div>
        </div>
      )}
    </div>
  );
}
