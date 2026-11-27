import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { DATA_DIR, FILES_DIR } from "./paths";
import { MISE_EN_FORME_DEFAUT } from "./style";
import type {
  ALire,
  Analyse,
  Courrier,
  MiseEnForme,
  Dossier,
  DossierSummary,
  Piece,
  PieceRole,
  Signe,
  SigneCompteurs,
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
    PRAGMA busy_timeout = 5000;
    PRAGMA synchronous = NORMAL;
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
  // Colonnes ajoutées après la création de la table.
  const colonnes = (table: string) => (db!.prepare(`PRAGMA table_info(${table})`).all() as Row[]).map((r) => String(r.name));
  if (!colonnes("courriers").includes("forme")) db.exec("ALTER TABLE courriers ADD COLUMN forme TEXT NOT NULL DEFAULT ''");
  if (!colonnes("pieces").includes("lecture")) db.exec("ALTER TABLE pieces ADD COLUMN lecture TEXT NOT NULL DEFAULT ''");
  // Index pour les gros volumes : listes triées, files d'attente, recherche plein texte (sans accents).
  db.exec(`
    CREATE INDEX IF NOT EXISTS signes_date ON signes (created_at);
    CREATE INDEX IF NOT EXISTS signes_statut ON signes (status);
    CREATE INDEX IF NOT EXISTS dossiers_date ON dossiers (created_at);
    CREATE INDEX IF NOT EXISTS courriers_dossier ON courriers (dossier_id);
    CREATE INDEX IF NOT EXISTS courriers_date ON courriers (updated_at);
    CREATE INDEX IF NOT EXISTS pieces_lecture ON pieces (lecture);
    CREATE VIRTUAL TABLE IF NOT EXISTS recherche USING fts5(
      genre UNINDEXED, cle UNINDEXED, ref UNINDEXED, titre, texte,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);
  if (getSetting("index_recherche") !== VERSION_INDEX) reconstruireIndex();
  return db;
}

/* ───────────── Recherche plein texte ───────────── */

const VERSION_INDEX = "1";
type Table = "signes" | "dossiers" | "pieces" | "courriers";
const GENRE: Record<Table, string> = { signes: "signe", dossiers: "dossier", pieces: "piece", courriers: "courrier" };

/** Numéro de ligne stable dans l'index, tiré de l'identifiant (pour effacer une ligne sans tout parcourir). */
function numero(table: Table, id: string): number {
  return createHash("sha1").update(`${table}:${id}`).digest().readUIntBE(0, 6);
}

/** Valeurs texte d'une analyse enregistrée en JSON (sans les noms des champs). */
function valeurs(json: string): string {
  try {
    const out: string[] = [];
    const visiter = (v: unknown) => {
      if (typeof v === "string") out.push(v);
      else if (Array.isArray(v)) v.forEach(visiter);
      else if (v && typeof v === "object") Object.values(v).forEach(visiter);
    };
    visiter(JSON.parse(json));
    return out.join("\n");
  } catch {
    return "";
  }
}

function ligneIndex(table: Table, id: string): { ref: string; titre: string; texte: string } | null {
  const d = getDb();
  const r = (() => {
    switch (table) {
      case "signes":
        return d.prepare("SELECT id AS ref, nom_fichier || ' ' || objet || ' ' || type AS titre, texte FROM signes WHERE id = ?").get(id);
      case "dossiers":
        return d.prepare("SELECT id AS ref, titre, analyse, consignes FROM dossiers WHERE id = ?").get(id);
      case "pieces":
        return d.prepare("SELECT dossier_id AS ref, nom AS titre, texte FROM pieces WHERE id = ?").get(id);
      case "courriers":
        return d
          .prepare("SELECT id AS ref, objet || ' ' || destinataire AS titre, vref || ' ' || corps AS texte FROM courriers WHERE id = ?")
          .get(id);
    }
  })() as Row | undefined;
  if (!r) return null;
  const texte = table === "dossiers" ? `${valeurs(str(r.analyse))}\n${str(r.consignes)}` : str(r.texte);
  return { ref: str(r.ref), titre: str(r.titre), texte };
}

function indexer(table: Table, id: string): void {
  const d = getDb();
  const n = numero(table, id);
  d.prepare("DELETE FROM recherche WHERE rowid = ?").run(n);
  const l = ligneIndex(table, id);
  if (l) d.prepare("INSERT INTO recherche (rowid, genre, cle, ref, titre, texte) VALUES (?, ?, ?, ?, ?, ?)").run(n, GENRE[table], id, l.ref, l.titre, l.texte);
}

function desindexer(table: Table, id: string): void {
  getDb().prepare("DELETE FROM recherche WHERE rowid = ?").run(numero(table, id));
}

/** Refait tout l'index (première ouverture, ou nouvelle version de l'index). */
function reconstruireIndex(): void {
  const d = getDb();
  d.exec("BEGIN");
  try {
    d.exec("DELETE FROM recherche");
    for (const table of Object.keys(GENRE) as Table[]) {
      for (const r of d.prepare(`SELECT id FROM ${table}`).all() as Row[]) indexer(table, String(r.id));
    }
    d.exec("COMMIT");
    setSetting("index_recherche", VERSION_INDEX);
  } catch (err) {
    d.exec("ROLLBACK");
    console.error("[index]", err);
  }
}

/** Requête plein texte : chaque mot (sans accents ni ponctuation) doit apparaître, en début de mot. */
function requete(q: string): string | null {
  const mots = q.normalize("NFC").match(/[\p{L}\p{N}]+/gu) ?? [];
  return mots.length ? mots.slice(0, 12).map((m) => `"${m}"*`).join(" ") : null;
}

/** Identifiants trouvés par la recherche, les plus pertinents d'abord. */
function chercher(genres: string[], q: string, champ: "cle" | "ref"): string[] {
  const fts = requete(q);
  if (!fts) return [];
  try {
    const rows = getDb()
      .prepare(
        `SELECT ${champ} AS id, MIN(rank) AS r FROM recherche WHERE recherche MATCH ? AND genre IN (${genres.map(() => "?").join(", ")})
         GROUP BY ${champ} ORDER BY r LIMIT 2000`,
      )
      .all(fts, ...genres) as Row[];
    return rows.map((r) => String(r.id));
  } catch (err) {
    console.error("[recherche]", err);
    return [];
  }
}

/** Lignes d'une table dans l'ordre des identifiants donnés. */
function parIds(sql: string, ids: string[]): Row[] {
  if (!ids.length) return [];
  const rows = getDb()
    .prepare(sql.replace("(?)", `(${ids.map(() => "?").join(", ")})`))
    .all(...ids) as Row[];
  const rang = new Map(ids.map((id, i) => [id, i]));
  return rows.sort((a, b) => (rang.get(String(a.id)) ?? 0) - (rang.get(String(b.id)) ?? 0));
}

export type Page = { limite?: number; decalage?: number };
const borne = (n: number | undefined, def: number, max: number) => Math.max(0, Math.min(max, Math.floor(n ?? def)));

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
  indexer(table as Table, id);
}

function removeFile(p: unknown) {
  if (!p) return;
  fs.rm(String(p), { force: true, recursive: true }, () => {});
  fs.rm(`${String(p)}.ocr.txt`, { force: true }, () => {});
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
  indexer("signes", id);
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

const COLS_RESUME = "id, created_at, status, nom_fichier, type, objet, resume, defaut, demo, genre";
function toResume(r: Row): SigneSummary {
  return {
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
  };
}

/** Une page de courriers signés (les plus récents d'abord), avec recherche plein texte. */
export function listSignes(opts: Page & { q?: string; prets?: boolean } = {}): { signes: SigneSummary[]; total: number } {
  const limite = borne(opts.limite, 50, 500);
  const decalage = borne(opts.decalage, 0, 1e9);
  const q = opts.q?.trim();
  if (q) {
    const ids = chercher(["signe"], q, "cle");
    const rows = parIds(`SELECT ${COLS_RESUME} FROM signes WHERE id IN (?)`, ids.slice(decalage, decalage + limite));
    return { signes: rows.map(toResume), total: ids.length };
  }
  const filtre = opts.prets ? "WHERE status = 'ready'" : "";
  const rows = getDb()
    .prepare(`SELECT ${COLS_RESUME} FROM signes ${filtre} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(limite, decalage) as Row[];
  const total = Number((getDb().prepare(`SELECT COUNT(*) AS n FROM signes ${filtre}`).get() as Row).n);
  return { signes: rows.map(toResume), total };
}

export function compterSignes(): SigneCompteurs {
  const r = getDb()
    .prepare(
      `SELECT COUNT(*) AS total, SUM(status = 'ready') AS prets, SUM(status = 'ready' AND genre = 'note') AS notes,
        SUM(status = 'error') AS erreurs, SUM(status = 'a_lire') AS a_lire, SUM(status = 'processing') AS en_cours FROM signes`,
    )
    .get() as Row;
  return {
    total: Number(r.total ?? 0),
    prets: Number(r.prets ?? 0),
    notes: Number(r.notes ?? 0),
    erreurs: Number(r.erreurs ?? 0),
    aLire: Number(r.a_lire ?? 0),
    enCours: Number(r.en_cours ?? 0),
  };
}

/** Identifiants des courriers signés d'un statut donné (relecture par lots). */
export function signesParStatut(status: Signe["status"]): string[] {
  return (getDb().prepare("SELECT id FROM signes WHERE status = ? ORDER BY created_at").all(status) as Row[]).map((r) => String(r.id));
}

/** Vrai si l'un des fragments (un numéro de texte, « article 12 »…) figure dans un courrier signé. */
export function signesContiennent(fragments: string[]): boolean {
  const stmt = getDb().prepare("SELECT 1 FROM signes WHERE status = 'ready' AND instr(lower(texte), ?) > 0 LIMIT 1");
  return fragments.some((f) => f.trim() && stmt.get(f.toLowerCase()) !== undefined);
}

/**
 * Les courriers signés les plus proches du courrier à rédiger (même genre, même type, mise en page choisie),
 * choisis par la base sans tout charger.
 */
export function modelesProches(genre: Signe["genre"], type: string, miseEnPageId: string | null, n = 6): Signe[] {
  const t = type.trim().toLowerCase();
  const mot = t.split(/\s+/)[0] ?? "";
  return (
    getDb()
      .prepare(
        `SELECT * FROM signes WHERE status = 'ready' AND texte != ''
         ORDER BY ((genre = ?) * ? + (? != '' AND lower(type) = ?) * 4 + (? != '' AND instr(lower(type), ?) > 0) + (id = ?) * 2) DESC,
           defaut DESC, created_at DESC LIMIT ?`,
      )
      .all(genre, genre === "note" ? 5 : 3, t, t, mot, mot, miseEnPageId ?? "", n) as Row[]
  ).map(toSigne);
}

/**
 * Le courrier signé qui sert de mise en page : pour un genre donné (courrier ou note),
 * celui de ce genre marqué par défaut, sinon le plus récent de ce genre, sinon le défaut général.
 */
/** Logo (armoiries) relevé dans un courrier signé, en commençant par le modèle par défaut. */
export function anyLogo(): string | null {
  // Les armoiries choisies dans les Paramètres passent avant celles relevées dans les courriers.
  const choisies = getSetting("armoiries");
  if (choisies && fs.existsSync(choisies)) return choisies;
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
  desindexer("signes", id);
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
  indexer("dossiers", id);
  return id;
}

export function getDossier(id: string): Dossier | null {
  const r = getDb().prepare("SELECT * FROM dossiers WHERE id = ?").get(id) as Row | undefined;
  return r ? toDossier(r) : null;
}

/** Une page de dossiers (les plus récents d'abord), avec recherche dans les dossiers et le texte de leurs pièces. */
export function listDossiers(opts: Page & { q?: string } = {}): { dossiers: DossierSummary[]; total: number } {
  const limite = borne(opts.limite, 50, 500);
  const decalage = borne(opts.decalage, 0, 1e9);
  const q = opts.q?.trim();
  const base = `SELECT d.id, d.titre, d.created_at, d.status, d.demo, d.analyse,
      (SELECT COUNT(*) FROM pieces p WHERE p.dossier_id = d.id) AS n_pieces,
      (SELECT COUNT(*) FROM courriers c WHERE c.dossier_id = d.id) AS n_courriers
    FROM dossiers d`;
  let rows: Row[];
  let total: number;
  if (q) {
    const ids = chercher(["dossier", "piece"], q, "ref");
    rows = parIds(`${base} WHERE d.id IN (?)`, ids.slice(decalage, decalage + limite));
    total = ids.length;
  } else {
    rows = getDb().prepare(`${base} ORDER BY d.created_at DESC LIMIT ? OFFSET ?`).all(limite, decalage) as Row[];
    total = Number((getDb().prepare("SELECT COUNT(*) AS n FROM dossiers").get() as Row).n);
  }
  const dossiers = rows.map((r) => {
    const analyse = str(r.analyse);
    let resume = "";
    try {
      resume = analyse ? ((JSON.parse(analyse) as Analyse).resume ?? "") : "";
    } catch {}
    return {
      id: String(r.id),
      titre: str(r.titre),
      createdAt: String(r.created_at),
      status: r.status as Dossier["status"],
      demo: Boolean(r.demo),
      pieces: Number(r.n_pieces),
      courriers: Number(r.n_courriers),
      resume,
    };
  });
  return { dossiers, total };
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
  for (const c of listCourriers(id)) deleteCourrier(c.id);
  getDb().prepare("DELETE FROM dossiers WHERE id = ?").run(id);
  desindexer("dossiers", id);
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
    lecture: (["attente", "echec"].includes(str(r.lecture)) ? str(r.lecture) : "") as Piece["lecture"],
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
  indexer("pieces", id);
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
  update("pieces", { texte: "texte", joindre: "joindre", role: "role", nom: "nom", lecture: "lecture" }, id, patch);
}

export function deletePiece(id: string): void {
  const p = getPiece(id);
  getDb().prepare("DELETE FROM pieces WHERE id = ?").run(id);
  desindexer("pieces", id);
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

/** Les projets rédigés, du plus récent au plus ancien, avec le titre de leur dossier et une recherche plein texte. */
export function listAllCourriers(query = "", opts: Page = {}): { courriers: (Courrier & { dossierTitre: string })[]; total: number } {
  const limite = borne(opts.limite, 100, 500);
  const decalage = borne(opts.decalage, 0, 1e9);
  const q = query.trim();
  const base = "SELECT c.*, d.titre AS dossier_titre FROM courriers c LEFT JOIN dossiers d ON d.id = c.dossier_id";
  let rows: Row[];
  let total: number;
  if (q) {
    // Un courrier se trouve par son texte ou par le titre de son dossier.
    const parDossier = chercher(["dossier"], q, "ref");
    const ids = chercher(["courrier"], q, "cle");
    if (parDossier.length) {
      const enPlus = getDb()
        .prepare(`SELECT id FROM courriers WHERE dossier_id IN (${parDossier.slice(0, 500).map(() => "?").join(", ")}) ORDER BY updated_at DESC`)
        .all(...parDossier.slice(0, 500)) as Row[];
      for (const r of enPlus) if (!ids.includes(String(r.id))) ids.push(String(r.id));
    }
    rows = parIds(`${base} WHERE c.id IN (?)`, ids.slice(decalage, decalage + limite));
    total = ids.length;
  } else {
    rows = getDb().prepare(`${base} ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`).all(limite, decalage) as Row[];
    total = Number((getDb().prepare("SELECT COUNT(*) AS n FROM courriers").get() as Row).n);
  }
  return { courriers: rows.map((r) => ({ ...toCourrier(r), dossierTitre: str(r.dossier_titre) })), total };
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
  desindexer("courriers", id);
}

/* ───────────── Scans à lire sur l'ordinateur ───────────── */

/** Les prochains scans à lire : d'abord les pièces des dossiers (on les attend pour l'analyse), puis les modèles. */
export function prochainsALire(n = 10): { items: ALire[]; total: number } {
  const d = getDb();
  const items = d
    .prepare(
      `SELECT * FROM (
         SELECT 'piece' AS genre, id, nom, 0 AS ordre, created_at FROM pieces WHERE lecture = 'attente'
         UNION ALL
         SELECT 'signe' AS genre, id, nom_fichier AS nom, 1 AS ordre, created_at FROM signes WHERE status = 'a_lire'
       ) ORDER BY ordre, created_at LIMIT ?`,
    )
    .all(n) as Row[];
  const total =
    Number((d.prepare("SELECT COUNT(*) AS n FROM pieces WHERE lecture = 'attente'").get() as Row).n) +
    Number((d.prepare("SELECT COUNT(*) AS n FROM signes WHERE status = 'a_lire'").get() as Row).n);
  return { items: items.map((r) => ({ genre: r.genre as ALire["genre"], id: String(r.id), nom: str(r.nom) })), total };
}

/** Dossiers dont des pièces attendent encore la lecture de leur texte. */
export function piecesEnAttente(dossierId: string): number {
  return Number(
    (getDb().prepare("SELECT COUNT(*) AS n FROM pieces WHERE dossier_id = ? AND lecture = 'attente'").get(dossierId) as Row).n,
  );
}

/* ───────────── Reprise au démarrage et statistiques ───────────── */

/** Travaux interrompus (appli fermée pendant un traitement) : à relancer au démarrage. */
export function travauxInterrompus(): { signes: string[]; dossiers: string[]; courriers: { id: string; dossierId: string }[] } {
  const d = getDb();
  return {
    signes: (d.prepare("SELECT id FROM signes WHERE status = 'processing' ORDER BY created_at").all() as Row[]).map((r) => String(r.id)),
    dossiers: (d.prepare("SELECT id FROM dossiers WHERE status = 'processing' ORDER BY created_at").all() as Row[]).map((r) => String(r.id)),
    courriers: (
      d.prepare("SELECT id, dossier_id FROM courriers WHERE status = 'processing' AND dossier_id IS NOT NULL").all() as Row[]
    ).map((r) => ({ id: String(r.id), dossierId: String(r.dossier_id) })),
  };
}

/**
 * Courriers signés restés en erreur parce qu'ils étaient scannés (versions sans lecture sur l'ordinateur) :
 * remis en attente de lecture, une seule fois.
 */
export function remettreScansEnLecture(): number {
  if (getSetting("reprise_scans") === "1") return 0;
  const r = getDb()
    .prepare(
      `UPDATE signes SET status = 'a_lire', error = NULL
       WHERE status = 'error' AND texte = '' AND (lower(nom_fichier) LIKE '%.pdf' OR lower(nom_fichier) LIKE '%.jpg'
         OR lower(nom_fichier) LIKE '%.jpeg' OR lower(nom_fichier) LIKE '%.png' OR lower(nom_fichier) LIKE '%.webp')`,
    )
    .run();
  setSetting("reprise_scans", "1");
  return Number(r.changes);
}

export function statistiques(): { signes: number; dossiers: number; pieces: number; courriers: number } {
  const n = (t: string) => Number((getDb().prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as Row).n);
  return { signes: n("signes"), dossiers: n("dossiers"), pieces: n("pieces"), courriers: n("courriers") };
}

/** Copie cohérente de la base (sauvegarde), même pendant l'utilisation. */
export function copierBase(cible: string): void {
  fs.rmSync(cible, { force: true });
  getDb().prepare("VACUUM INTO ?").run(cible);
}
