import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, FILES_DIR } from "./paths";
import { MISE_EN_FORME_DEFAUT } from "./style";
import type {
  Analyse,
  Courrier,
  MiseEnForme,
  Dossier,
  DossierSummary,
  Piece,
  PieceRole,
  Signe,
  SigneSummary,
} from "./types";

let db: DatabaseSync | null = null;
type Row = Record<string, unknown>;
type Value = string | number | null;

// La base garde aussi l'ancienne table « notes » des versions 0.1 et 0.2 :
// on n'y touche pas, pour ne rien effacer.
function getDb(): DatabaseSync {
  if (db) return db;
  fs.mkdirSync(FILES_DIR, { recursive: true });
  db = new DatabaseSync(path.join(DATA_DIR, "redacteur.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS signes (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      demo INTEGER NOT NULL DEFAULT 0,
      nom_fichier TEXT NOT NULL DEFAULT '',
      chemin TEXT,
      mime TEXT,
      type TEXT NOT NULL DEFAULT '',
      objet TEXT NOT NULL DEFAULT '',
      resume TEXT NOT NULL DEFAULT '',
      genre TEXT NOT NULL DEFAULT 'courrier',
      entete TEXT NOT NULL DEFAULT '',
      entete_droite TEXT NOT NULL DEFAULT '',
      refs TEXT NOT NULL DEFAULT '',
      lieu TEXT NOT NULL DEFAULT '',
      date_blanche INTEGER NOT NULL DEFAULT 0,
      destinataire TEXT NOT NULL DEFAULT '',
      appel TEXT NOT NULL DEFAULT '',
      politesse TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      ampliation TEXT NOT NULL DEFAULT '',
      pied TEXT NOT NULL DEFAULT '',
      style TEXT NOT NULL DEFAULT '',
      texte TEXT NOT NULL DEFAULT '',
      police TEXT NOT NULL DEFAULT 'Arial',
      logo TEXT,
      signature_img TEXT,
      defaut INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS dossiers (
      id TEXT PRIMARY KEY,
      titre TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      step TEXT,
      error TEXT,
      demo INTEGER NOT NULL DEFAULT 0,
      analyse TEXT NOT NULL DEFAULT '',
      consignes TEXT NOT NULL DEFAULT '',
      ton TEXT NOT NULL DEFAULT 'courtois',
      genre TEXT NOT NULL DEFAULT 'courrier',
      signe_id TEXT
    );
    CREATE TABLE IF NOT EXISTS pieces (
      id TEXT PRIMARY KEY,
      dossier_id TEXT NOT NULL,
      role TEXT NOT NULL,
      nom TEXT NOT NULL,
      mime TEXT,
      chemin TEXT NOT NULL,
      taille INTEGER NOT NULL DEFAULT 0,
      texte TEXT NOT NULL DEFAULT '',
      joindre INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS pieces_dossier ON pieces (dossier_id);
    CREATE TABLE IF NOT EXISTS courriers (
      id TEXT PRIMARY KEY,
      dossier_id TEXT,
      signe_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      demo INTEGER NOT NULL DEFAULT 0,
      genre TEXT NOT NULL DEFAULT 'courrier',
      entete TEXT NOT NULL DEFAULT '',
      entete_droite TEXT NOT NULL DEFAULT '',
      refs TEXT NOT NULL DEFAULT '',
      lieu TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL DEFAULT '',
      vref TEXT NOT NULL DEFAULT '',
      destinataire TEXT NOT NULL DEFAULT '',
      objet TEXT NOT NULL DEFAULT '',
      pj TEXT NOT NULL DEFAULT '',
      appel TEXT NOT NULL DEFAULT '',
      corps TEXT NOT NULL DEFAULT '',
      politesse TEXT NOT NULL DEFAULT '',
      signature TEXT NOT NULL DEFAULT '',
      ampliation TEXT NOT NULL DEFAULT '',
      pied TEXT NOT NULL DEFAULT '',
      police TEXT NOT NULL DEFAULT 'Arial',
      forme TEXT NOT NULL DEFAULT '',
      remarques TEXT NOT NULL DEFAULT '[]'
    );
  `);
  // Colonnes ajoutées après la création de la table (versions de développement).
  const cols = (db.prepare("PRAGMA table_info(courriers)").all() as Row[]).map((r) => String(r.name));
  if (!cols.includes("forme")) db.exec("ALTER TABLE courriers ADD COLUMN forme TEXT NOT NULL DEFAULT ''");
  return db;
}

const now = () => new Date().toISOString();
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v));

/** Met à jour les colonnes autorisées d'une table à partir d'un objet partiel. */
function update(table: string, columns: Record<string, string>, id: string, patch: Record<string, unknown>) {
  const sets: string[] = [];
  const values: Value[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const col = columns[key];
    if (!col || value === undefined) continue;
    sets.push(`${col} = ?`);
    if (value === null) values.push(null);
    else if (typeof value === "boolean") values.push(value ? 1 : 0);
    else if (typeof value === "object") values.push(JSON.stringify(value));
    else values.push(value as string | number);
  }
  if (!sets.length) return;
  if (table !== "pieces") {
    sets.push("updated_at = ?");
    values.push(now());
  }
  values.push(id);
  getDb()
    .prepare(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = ?`)
    .run(...values);
}

function removeFile(p: unknown) {
  if (p) fs.rm(String(p), { force: true, recursive: true }, () => {});
}

/* ───────────── Réglages ───────────── */

export function getSetting(key: string): string | null {
  const r = getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as Row | undefined;
  return r ? String(r.value) : null;
}

export function setSetting(key: string, value: string): void {
  if (value) {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  } else {
    getDb().prepare("DELETE FROM settings WHERE key = ?").run(key);
  }
}

/* ───────────── Courriers signés ───────────── */

function toSigne(r: Row): Signe {
  return {
    id: String(r.id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    status: r.status as Signe["status"],
    error: (r.error as string) ?? null,
    demo: Boolean(r.demo),
    nomFichier: str(r.nom_fichier),
    mime: (r.mime as string) ?? null,
    type: str(r.type),
    objet: str(r.objet),
    resume: str(r.resume),
    genre: str(r.genre) === "note" ? "note" : "courrier",
    entete: str(r.entete),
    enteteDroite: str(r.entete_droite),
    refs: str(r.refs),
    lieu: str(r.lieu),
    dateBlanche: Boolean(r.date_blanche),
    destinataire: str(r.destinataire),
    appel: str(r.appel),
    politesse: str(r.politesse),
    signature: str(r.signature),
    ampliation: str(r.ampliation),
    pied: str(r.pied),
    style: str(r.style),
    texte: str(r.texte),
    police: str(r.police) || "Arial",
    hasLogo: Boolean(r.logo),
    hasSignatureImg: Boolean(r.signature_img),
    defaut: Boolean(r.defaut),
  };
}

export function createSigne(input: { nomFichier: string; mime: string | null; ext: string }): {
  id: string;
  chemin: string;
} {
  const id = randomUUID();
  const dir = path.join(FILES_DIR, "signes");
  fs.mkdirSync(dir, { recursive: true });
  const chemin = path.join(dir, `${id}${input.ext}`);
  const t = now();
  getDb()
    .prepare(
      `INSERT INTO signes (id, created_at, updated_at, status, nom_fichier, chemin, mime) VALUES (?, ?, ?, 'processing', ?, ?, ?)`,
    )
    .run(id, t, t, input.nomFichier, chemin, input.mime);
  return { id, chemin };
}

export function getSigne(id: string): Signe | null {
  const r = getDb().prepare("SELECT * FROM signes WHERE id = ?").get(id) as Row | undefined;
  return r ? toSigne(r) : null;
}

export function getSigneFiles(id: string): { chemin: string | null; mime: string | null; logo: string | null; signatureImg: string | null } | null {
  const r = getDb().prepare("SELECT chemin, mime, logo, signature_img FROM signes WHERE id = ?").get(id) as Row | undefined;
  if (!r) return null;
  return {
    chemin: (r.chemin as string) ?? null,
    mime: (r.mime as string) ?? null,
    logo: (r.logo as string) ?? null,
    signatureImg: (r.signature_img as string) ?? null,
  };
}

export function listSignes(): SigneSummary[] {
  return (
    getDb()
      .prepare("SELECT id, created_at, status, nom_fichier, type, objet, resume, defaut, demo, genre FROM signes ORDER BY created_at DESC")
      .all() as Row[]
  ).map((r) => ({
    id: String(r.id),
    createdAt: String(r.created_at),
    status: r.status as Signe["status"],
    nomFichier: str(r.nom_fichier),
    type: str(r.type),
    objet: str(r.objet),
    resume: str(r.resume),
    defaut: Boolean(r.defaut),
    demo: Boolean(r.demo),
    genre: str(r.genre) === "note" ? "note" : "courrier",
  }));
}

export function listReadySignes(): Signe[] {
  return (getDb().prepare("SELECT * FROM signes WHERE status = 'ready' ORDER BY created_at DESC").all() as Row[]).map(
    toSigne,
  );
}

/**
 * Le courrier signé qui sert de mise en page : pour un genre donné (courrier ou note),
 * celui de ce genre marqué par défaut, sinon le plus récent de ce genre, sinon le défaut général.
 */
/** Logo (armoiries) relevé dans un courrier signé, en commençant par le modèle par défaut. */
export function anyLogo(): string | null {
  const r = getDb()
    .prepare("SELECT logo FROM signes WHERE status = 'ready' AND logo IS NOT NULL ORDER BY defaut DESC, created_at DESC LIMIT 1")
    .get() as Row | undefined;
  return r ? String(r.logo) : null;
}

/** Le modèle le plus complet : du bon genre, par défaut, avec logo et en-tête de droite. */
export function defaultSigne(genre?: Signe["genre"]): Signe | null {
  const r = (genre
    ? getDb()
        .prepare(
          "SELECT * FROM signes WHERE status = 'ready' ORDER BY (genre = ?) DESC, defaut DESC, (logo IS NOT NULL) DESC, (entete_droite != '') DESC, created_at DESC LIMIT 1",
        )
        .get(genre)
    : getDb()
        .prepare(
          "SELECT * FROM signes WHERE status = 'ready' ORDER BY defaut DESC, (logo IS NOT NULL) DESC, (entete_droite != '') DESC, created_at DESC LIMIT 1",
        )
        .get()) as
    | Row
    | undefined;
  return r ? toSigne(r) : null;
}

const signeColumns: Record<string, string> = {
  status: "status",
  error: "error",
  demo: "demo",
  type: "type",
  objet: "objet",
  resume: "resume",
  genre: "genre",
  entete: "entete",
  enteteDroite: "entete_droite",
  refs: "refs",
  lieu: "lieu",
  dateBlanche: "date_blanche",
  destinataire: "destinataire",
  appel: "appel",
  politesse: "politesse",
  signature: "signature",
  ampliation: "ampliation",
  pied: "pied",
  style: "style",
  texte: "texte",
  police: "police",
  logo: "logo",
  signatureImg: "signature_img",
};

export function updateSigne(id: string, patch: Partial<Signe> & { logo?: string | null; signatureImg?: string | null }) {
  update("signes", signeColumns, id, patch);
}

/** Marque un courrier signé comme mise en page par défaut de son genre. */
export function setDefaultSigne(id: string): void {
  const s = getSigne(id);
  if (!s) return;
  getDb().prepare("UPDATE signes SET defaut = 0 WHERE genre = ?").run(s.genre);
  getDb().prepare("UPDATE signes SET defaut = 1 WHERE id = ?").run(id);
}

export function deleteSigne(id: string): void {
  const files = getSigneFiles(id);
  getDb().prepare("DELETE FROM signes WHERE id = ?").run(id);
  if (files) [files.chemin, files.logo, files.signatureImg].forEach(removeFile);
}

/* ───────────── Dossiers ───────────── */

function toDossier(r: Row): Dossier {
  const analyse = str(r.analyse);
  return {
    id: String(r.id),
    titre: str(r.titre),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    status: r.status as Dossier["status"],
    step: (r.step as string) ?? null,
    error: (r.error as string) ?? null,
    demo: Boolean(r.demo),
    analyse: analyse ? (JSON.parse(analyse) as Analyse) : null,
    consignes: str(r.consignes),
    ton: (str(r.ton) || "courtois") as Dossier["ton"],
    genre: str(r.genre) === "note" ? "note" : "courrier",
    signeId: (r.signe_id as string) ?? null,
  };
}

export function createDossier(titre: string): string {
  const id = randomUUID();
  const t = now();
  getDb()
    .prepare("INSERT INTO dossiers (id, titre, created_at, updated_at, status) VALUES (?, ?, ?, ?, 'vide')")
    .run(id, titre, t, t);
  return id;
}

export function getDossier(id: string): Dossier | null {
  const r = getDb().prepare("SELECT * FROM dossiers WHERE id = ?").get(id) as Row | undefined;
  return r ? toDossier(r) : null;
}

export function listDossiers(query?: string): DossierSummary[] {
  const q = query?.trim();
  const base = `SELECT d.id, d.titre, d.created_at, d.status, d.demo, d.analyse,
      (SELECT COUNT(*) FROM pieces p WHERE p.dossier_id = d.id) AS n_pieces,
      (SELECT COUNT(*) FROM courriers c WHERE c.dossier_id = d.id) AS n_courriers
    FROM dossiers d`;
  const rows = (
    q
      ? getDb()
          .prepare(
            `${base} WHERE d.titre LIKE ? OR d.analyse LIKE ? OR d.consignes LIKE ?
             OR EXISTS (SELECT 1 FROM pieces p WHERE p.dossier_id = d.id AND (p.nom LIKE ? OR p.texte LIKE ?))
             ORDER BY d.created_at DESC`,
          )
          .all(...Array(5).fill(`%${q}%`))
      : getDb().prepare(`${base} ORDER BY d.created_at DESC`).all()
  ) as Row[];
  return rows.map((r) => {
    const analyse = str(r.analyse);
    return {
      id: String(r.id),
      titre: str(r.titre),
      createdAt: String(r.created_at),
      status: r.status as Dossier["status"],
      demo: Boolean(r.demo),
      pieces: Number(r.n_pieces),
      courriers: Number(r.n_courriers),
      resume: analyse ? ((JSON.parse(analyse) as Analyse).resume ?? "") : "",
    };
  });
}

const dossierColumns: Record<string, string> = {
  titre: "titre",
  status: "status",
  step: "step",
  error: "error",
  demo: "demo",
  analyse: "analyse",
  consignes: "consignes",
  ton: "ton",
  genre: "genre",
  signeId: "signe_id",
};

export function updateDossier(id: string, patch: Partial<Dossier>) {
  update("dossiers", dossierColumns, id, patch);
}

export function deleteDossier(id: string): void {
  for (const p of listPieces(id)) deletePiece(p.id);
  getDb().prepare("DELETE FROM courriers WHERE dossier_id = ?").run(id);
  getDb().prepare("DELETE FROM dossiers WHERE id = ?").run(id);
}

/* ───────────── Pièces ───────────── */

function toPiece(r: Row): Piece {
  return {
    id: String(r.id),
    dossierId: String(r.dossier_id),
    role: r.role as PieceRole,
    nom: str(r.nom),
    mime: (r.mime as string) ?? null,
    taille: Number(r.taille ?? 0),
    texte: str(r.texte),
    joindre: Boolean(r.joindre),
    createdAt: String(r.created_at),
  };
}

export function createPiece(input: {
  dossierId: string;
  role: PieceRole;
  nom: string;
  mime: string | null;
  ext: string;
  taille: number;
}): { id: string; chemin: string } {
  const id = randomUUID();
  const dir = path.join(FILES_DIR, "pieces");
  fs.mkdirSync(dir, { recursive: true });
  const chemin = path.join(dir, `${id}${input.ext}`);
  getDb()
    .prepare(
      `INSERT INTO pieces (id, dossier_id, role, nom, mime, chemin, taille, joindre, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, input.dossierId, input.role, input.nom, input.mime, chemin, input.taille, input.role === "justificatif" ? 1 : 0, now());
  return { id, chemin };
}

export function listPieces(dossierId: string): Piece[] {
  return (
    getDb().prepare("SELECT * FROM pieces WHERE dossier_id = ? ORDER BY role, created_at").all(dossierId) as Row[]
  ).map(toPiece);
}

export function getPiece(id: string): (Piece & { chemin: string }) | null {
  const r = getDb().prepare("SELECT * FROM pieces WHERE id = ?").get(id) as Row | undefined;
  return r ? { ...toPiece(r), chemin: String(r.chemin) } : null;
}

export function listPiecesWithPath(dossierId: string): (Piece & { chemin: string })[] {
  return (
    getDb().prepare("SELECT * FROM pieces WHERE dossier_id = ? ORDER BY role, created_at").all(dossierId) as Row[]
  ).map((r) => ({ ...toPiece(r), chemin: String(r.chemin) }));
}

export function updatePiece(id: string, patch: Partial<Piece>) {
  update("pieces", { texte: "texte", joindre: "joindre", role: "role", nom: "nom" }, id, patch);
}

export function deletePiece(id: string): void {
  const p = getPiece(id);
  getDb().prepare("DELETE FROM pieces WHERE id = ?").run(id);
  if (p) removeFile(p.chemin);
}

/* ───────────── Courriers rédigés ───────────── */

function toCourrier(r: Row): Courrier {
  return {
    id: String(r.id),
    dossierId: (r.dossier_id as string) ?? null,
    signeId: (r.signe_id as string) ?? null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    status: r.status as Courrier["status"],
    error: (r.error as string) ?? null,
    demo: Boolean(r.demo),
    genre: str(r.genre) === "note" ? "note" : "courrier",
    entete: str(r.entete),
    enteteDroite: str(r.entete_droite),
    refs: str(r.refs),
    lieu: str(r.lieu),
    date: str(r.date),
    vref: str(r.vref),
    destinataire: str(r.destinataire),
    objet: str(r.objet),
    pj: str(r.pj),
    appel: str(r.appel),
    corps: str(r.corps),
    politesse: str(r.politesse),
    signature: str(r.signature),
    ampliation: str(r.ampliation),
    pied: str(r.pied),
    police: str(r.police) || "Arial",
    forme: lireForme(str(r.forme)),
    remarques: JSON.parse(str(r.remarques) || "[]") as string[],
  };
}

function lireForme(json: string): MiseEnForme {
  try {
    return { ...MISE_EN_FORME_DEFAUT, ...(json ? (JSON.parse(json) as Partial<MiseEnForme>) : {}) };
  } catch {
    return { ...MISE_EN_FORME_DEFAUT };
  }
}

export function createCourrier(input: Partial<Courrier> & { dossierId: string | null }): string {
  const id = randomUUID();
  const t = now();
  getDb()
    .prepare("INSERT INTO courriers (id, dossier_id, created_at, updated_at, status) VALUES (?, ?, ?, ?, ?)")
    .run(id, input.dossierId, t, t, input.status ?? "processing");
  updateCourrier(id, input);
  return id;
}

export function getCourrier(id: string): Courrier | null {
  const r = getDb().prepare("SELECT * FROM courriers WHERE id = ?").get(id) as Row | undefined;
  return r ? toCourrier(r) : null;
}

/** Tous les projets rédigés, du plus récent au plus ancien, avec le titre de leur dossier. */
export function listAllCourriers(query = ""): (Courrier & { dossierTitre: string })[] {
  const q = `%${query.trim()}%`;
  return (
    getDb()
      .prepare(
        `SELECT c.*, d.titre AS dossier_titre FROM courriers c LEFT JOIN dossiers d ON d.id = c.dossier_id
         WHERE ? = '%%' OR c.objet LIKE ? OR c.destinataire LIKE ? OR c.corps LIKE ? OR d.titre LIKE ?
         ORDER BY c.updated_at DESC LIMIT 300`,
      )
      .all(q, q, q, q, q) as Row[]
  ).map((r) => ({ ...toCourrier(r), dossierTitre: str(r.dossier_titre) }));
}

export function listCourriers(dossierId: string): Courrier[] {
  return (
    getDb().prepare("SELECT * FROM courriers WHERE dossier_id = ? ORDER BY created_at DESC").all(dossierId) as Row[]
  ).map(toCourrier);
}

const courrierColumns: Record<string, string> = {
  signeId: "signe_id",
  status: "status",
  error: "error",
  demo: "demo",
  genre: "genre",
  entete: "entete",
  enteteDroite: "entete_droite",
  refs: "refs",
  lieu: "lieu",
  date: "date",
  vref: "vref",
  destinataire: "destinataire",
  objet: "objet",
  pj: "pj",
  appel: "appel",
  corps: "corps",
  politesse: "politesse",
  signature: "signature",
  ampliation: "ampliation",
  pied: "pied",
  police: "police",
  forme: "forme",
  remarques: "remarques",
};

export function updateCourrier(id: string, patch: Partial<Courrier>) {
  update("courriers", courrierColumns, id, patch);
}

export function deleteCourrier(id: string): void {
  getDb().prepare("DELETE FROM courriers WHERE id = ?").run(id);
}
