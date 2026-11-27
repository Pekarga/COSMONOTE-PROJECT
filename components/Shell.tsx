"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckIcon,
  FolderIcon,
  GearIcon,
  HistoryIcon,
  HomeIcon,
  InfoIcon,
  LetterIcon,
  PdfIcon,
  PenIcon,
  PlusIcon,
  PowerIcon,
  PrinterIcon,
  SaveIcon,
  SearchIcon,
  StarIcon,
  TemplateIcon,
  WordIcon,
} from "./Icons";

declare global {
  interface Window {
    redacteur?: { savePdf: (name: string) => Promise<string | null>; quitter?: () => void };
  }
}

/** Actions de la barre d'outils fournies par la page ouverte (l'éditeur surtout). */
export type ShellActions = { enregistrer?: () => void; imprimer?: () => void; pdf?: () => void; word?: () => void };
export type ShellStatus = {
  message?: string | null;
  compteurs?: { lignes: number; mots: number; caracteres: number } | null;
  sauvegarde?: string | null;
};

type Setters = { setActions: (a: ShellActions | null) => void; setStatus: (s: ShellStatus | null) => void };
const SettersCtx = createContext<Setters | null>(null);

/** La page déclare ses actions (Enregistrer, Imprimer, Exporter…) ; elles se retirent quand on la quitte. */
export function useShellActions(actions: ShellActions | null) {
  const ctx = useContext(SettersCtx);
  const ref = useRef(actions);
  ref.current = actions;
  const cles = actions ? Object.keys(actions).filter((k) => actions[k as keyof ShellActions]).sort().join(",") : "";
  useEffect(() => {
    if (!ctx) return;
    if (!cles) {
      ctx.setActions(null);
      return;
    }
    const stable: ShellActions = {};
    for (const k of cles.split(",") as (keyof ShellActions)[]) stable[k] = () => ref.current?.[k]?.();
    ctx.setActions(stable);
    return () => ctx.setActions(null);
  }, [ctx, cles]);
}

export function useShellStatus(status: ShellStatus | null) {
  const ctx = useContext(SettersCtx);
  const json = JSON.stringify(status);
  useEffect(() => {
    if (!ctx) return;
    ctx.setStatus(json === "null" ? null : (JSON.parse(json) as ShellStatus));
  }, [ctx, json]);
  useEffect(() => () => ctx?.setStatus(null), [ctx]);
}

/** Crée un courrier sans dossier imputé et ouvre son espace de préparation. */
async function nouveauCourrier(router: ReturnType<typeof useRouter>) {
  const form = new FormData();
  form.append("libre", "1");
  const res = await fetch("/api/dossiers", { method: "POST", body: form });
  const d = (await res.json().catch(() => ({}))) as { id?: string };
  if (d.id) router.push(`/dossiers/${d.id}`);
}

function Armoiries() {
  const [ok, setOk] = useState(true);
  return ok ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="banner-logo" src="/api/logo" alt="Armoiries" onError={() => setOk(false)} />
  ) : (
    <svg className="banner-logo" viewBox="0 0 100 100" aria-hidden="true">
      <circle cx="50" cy="50" r="46" fill="#fff" stroke="#f08a00" strokeWidth="5" />
      <path d="M50 18 72 30v18c0 16-10 27-22 33-12-6-22-17-22-33V30Z" fill="#0a9a57" />
      <path d="M50 26 64 34v13c0 11-6 19-14 24-8-5-14-13-14-24V34Z" fill="#fff" />
      <path d="M41 48h18M41 55h14" stroke="#f08a00" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

function Bandeau({ nom, fonction }: { nom: string; fonction: string }) {
  const initiales = nom
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((m) => m[0].toUpperCase())
    .join("");
  return (
    <header className="banner no-print">
      <svg className="banner-swoosh" viewBox="0 0 1000 120" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="orangeBand" x1="0" x2="1">
            <stop offset="0" stopColor="#f7a21b" stopOpacity="0" />
            <stop offset="0.35" stopColor="#f7941d" />
            <stop offset="1" stopColor="#ef7d00" />
          </linearGradient>
          <linearGradient id="greenBand" x1="0" x2="1">
            <stop offset="0" stopColor="#16a35f" stopOpacity="0" />
            <stop offset="0.4" stopColor="#0f9d58" />
            <stop offset="1" stopColor="#00843d" />
          </linearGradient>
        </defs>
        <path d="M250 120C430 108 560 70 700 0H790C640 78 480 116 330 120Z" fill="url(#orangeBand)" />
        <path d="M352 120C520 112 660 76 812 0H836C690 80 540 118 380 120Z" fill="#fff" />
        <path d="M392 120C560 114 700 78 850 0H930C780 84 610 120 440 120Z" fill="url(#greenBand)" />
      </svg>
      <Link href="/" className="banner-brand">
        <Armoiries />
        <span>
          <strong className="banner-title">Rédacteur de Courriers Administratifs</strong>
          <em className="banner-sub">Rédigez, gérez et imprimez vos courriers en toute simplicité</em>
        </span>
      </Link>
      <p className="banner-slogan">
        Une administration efficace
        <br />
        au service du citoyen
      </p>
      <Link href="/reglages" className="banner-user" title="Modifier votre nom et votre fonction">
        <span className="avatar">{initiales || "?"}</span>
        <span>
          <strong>{nom || "Votre nom"}</strong>
          <small>{fonction || "Ajoutez votre fonction"}</small>
        </span>
      </Link>
    </header>
  );
}

function Outil(props: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  const cls = `tool ${props.active ? "active" : ""}`;
  if (props.href)
    return (
      <Link href={props.href} className={cls} title={props.title}>
        {props.icon}
        <span>{props.label}</span>
      </Link>
    );
  return (
    <button type="button" className={cls} onClick={props.onClick} disabled={props.disabled} title={props.title}>
      {props.icon}
      <span>{props.label}</span>
    </button>
  );
}

function BarreOutils({ actions }: { actions: ShellActions | null }) {
  const path = usePathname();
  const router = useRouter();
  const [bureau, setBureau] = useState(false);
  useEffect(() => setBureau(Boolean(window.redacteur?.quitter)), []);
  const sans = "Ouvrez un projet de courrier pour utiliser cette action";
  return (
    <nav className="toolbar-main no-print" aria-label="Barre d'outils">
      <Outil href="/" icon={<HomeIcon size={26} />} label="Accueil" active={path === "/"} />
      <span className="tool-sep" />
      <Outil href="/signes" icon={<TemplateIcon size={26} />} label="Modèles" active={path.startsWith("/signes")} />
      <Outil onClick={() => nouveauCourrier(router)} icon={<span className="ico-green"><PlusIcon size={28} /></span>} label="Nouveau" />
      <Outil onClick={actions?.enregistrer} disabled={!actions?.enregistrer} title={actions?.enregistrer ? undefined : sans} icon={<SaveIcon size={26} />} label="Enregistrer" />
      <Outil onClick={actions?.imprimer} disabled={!actions?.imprimer} title={actions?.imprimer ? undefined : sans} icon={<PrinterIcon size={26} />} label="Imprimer" />
      <Outil onClick={actions?.pdf} disabled={!actions?.pdf} title={actions?.pdf ? undefined : sans} icon={<PdfIcon size={28} />} label="Exporter PDF" />
      <Outil onClick={actions?.word} disabled={!actions?.word} title={actions?.word ? undefined : sans} icon={<WordIcon size={28} />} label="Exporter Word" />
      <span className="tool-sep" />
      <Outil href="/courriers" icon={<HistoryIcon size={26} />} label="Historique" active={path === "/courriers"} />
      <Outil href="/reglages" icon={<GearIcon size={26} />} label="Paramètres" active={path.startsWith("/reglages")} />
      <Outil href="/a-propos" icon={<InfoIcon size={26} />} label="À propos" active={path.startsWith("/a-propos")} />
      {bureau && <Outil onClick={() => window.redacteur?.quitter?.()} icon={<span className="ico-red"><PowerIcon size={26} /></span>} label="Quitter" />}
    </nav>
  );
}

function MenuLateral() {
  const path = usePathname();
  const router = useRouter();
  const items = [
    { href: "/", label: "Dossiers imputés", icon: <FolderIcon size={22} />, on: path === "/" || path.startsWith("/dossiers") },
    { href: "/courriers", label: "Mes courriers", icon: <LetterIcon size={22} />, on: path.startsWith("/courriers") },
    { href: "/signes", label: "Modèles signés", icon: <StarIcon size={22} filled />, on: path.startsWith("/signes") },
    { href: "/recherche", label: "Recherche", icon: <SearchIcon size={22} />, on: path.startsWith("/recherche") },
  ];
  return (
    <aside className="side no-print">
      <button type="button" className="side-new" onClick={() => nouveauCourrier(router)}>
        <PenIcon size={22} /> <span>Nouveau courrier</span>
      </button>
      <nav className="side-nav">
        {items.map((i) => (
          <Link key={i.href} href={i.href} className={i.on ? "on" : ""} title={i.label}>
            {i.icon}
            <span>{i.label}</span>
          </Link>
        ))}
      </nav>
      <div className="side-deco" aria-hidden="true">
        <p>
          Professionnalisme
          <br />
          et Performance
        </p>
        <svg viewBox="0 0 200 150" preserveAspectRatio="xMidYMax meet">
          <path d="M0 60C60 40 130 50 200 20V34C130 64 60 56 0 78Z" fill="#f7941d" />
          <path d="M0 82C70 62 140 70 200 40V50C140 82 70 76 0 94Z" fill="#0f9d58" />
          <g fill="#f6c58a" opacity="0.9">
            <rect x="96" y="58" width="8" height="70" />
            <path d="M92 60h16l-8-26Z" />
            <rect x="60" y="100" width="18" height="28" />
            <rect x="80" y="88" width="12" height="40" />
            <rect x="110" y="92" width="16" height="36" />
            <rect x="128" y="104" width="22" height="24" />
            <rect x="40" y="110" width="16" height="18" />
          </g>
          <g stroke="#2e7d32" strokeWidth="3" fill="none" strokeLinecap="round">
            <path d="M22 128c2-18 4-30 2-44" />
            <path d="M24 84c-10-6-18-4-22 2M24 84c8-8 18-8 24-2M24 84c-4-10-2-16 4-20M24 84c-12 0-16 6-18 10" />
            <path d="M176 128c-2-14-2-26 2-36" />
            <path d="M178 92c-8-6-16-4-20 2M178 92c8-6 16-4 20 2M178 92c0-8 4-14 10-16" />
          </g>
          <rect x="0" y="126" width="200" height="24" fill="#fbe3c4" />
        </svg>
      </div>
    </aside>
  );
}

function BarreEtat({ status, demo }: { status: ShellStatus | null; demo: boolean }) {
  const c = status?.compteurs;
  return (
    <footer className="statusbar no-print">
      <span className="status-ok">
        <span className="status-dot">
          <CheckIcon size={12} />
        </span>
        {status?.message || "Prêt"}
        {demo && (
          <Link href="/reglages" className="status-demo" title="Ajoutez votre clé Claude dans les Paramètres">
            Mode démo
          </Link>
        )}
      </span>
      <span className="status-counts">
        {c && (
          <>
            <span>Lignes : {c.lignes}</span>
            <span>Mots : {c.mots}</span>
            <span>Caractères : {c.caracteres}</span>
          </>
        )}
      </span>
      <span className="status-save">{status?.sauvegarde ? `Dernière sauvegarde : ${status.sauvegarde}` : ""}</span>
    </footer>
  );
}

/** Cadre de l'application : bandeau, barre d'outils, menu latéral, contenu et barre d'état. */
export function Shell(props: { children: ReactNode; nom: string; fonction: string; demo: boolean }) {
  const path = usePathname();
  const [actions, setActions] = useState<ShellActions | null>(null);
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const [setters] = useState<Setters>(() => ({ setActions, setStatus }));

  if (path === "/connexion") return <main className="login-page">{props.children}</main>;

  return (
    <SettersCtx.Provider value={setters}>
      <div className="app">
        <Bandeau nom={props.nom} fonction={props.fonction} />
        <BarreOutils actions={actions} />
        <div className="app-body">
          <MenuLateral />
          <main className="app-main">{props.children}</main>
        </div>
        <BarreEtat status={status} demo={props.demo} />
      </div>
    </SettersCtx.Provider>
  );
}
