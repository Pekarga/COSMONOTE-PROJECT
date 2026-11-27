// Vérifie que l'appli de bureau démarre et affiche l'accueil sans erreur.
// Usage : node scripts/verifier-bureau.cjs "<chemin de l'exécutable>"
// Lancé par le workflow Windows avant de publier l'installateur.
const { _electron } = require("playwright");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const exe = process.argv[2];
const sortie = path.join(path.dirname(exe), "..");

/** Données d'une ancienne version (0.2, prise de notes), comme sur le poste de l'utilisateur. */
function anciennesDonnees() {
  const appData = process.env.APPDATA || path.join(os.homedir(), ".config");
  const dir = path.join(appData, "Le redacteur", "data");
  fs.mkdirSync(dir, { recursive: true });
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(path.join(dir, "redacteur.db"));
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL, status TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'audio');
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR REPLACE INTO notes (id, title, created_at, updated_at, status) VALUES ('n1', 'Réunion', '2026-11-26', '2026-11-26', 'ready');
  `);
  db.close();
  return path.join(appData, "Le redacteur");
}

(async () => {
  const dossier = anciennesDonnees();
  const args = process.platform === "linux" ? ["--no-sandbox"] : [];
  const app = await _electron.launch({ executablePath: exe, args, timeout: 120000 });
  const erreurs = [];
  const suivre = (page) => {
    page.on("pageerror", (e) => erreurs.push(`erreur de page : ${e.message}`));
    page.on("console", (m) => m.type() === "error" && !/status of 404/.test(m.text()) && erreurs.push(`console : ${m.text()}`));
    page.on("crash", () => erreurs.push("la page a planté"));
  };
  app.on("window", suivre);
  // La fenêtre de l'appli est celle qui affiche le serveur local.
  let page = null;
  for (let i = 0; i < 120 && !page; i++) {
    page = app.windows().find((w) => w.url().startsWith("http://127.0.0.1")) ?? null;
    if (!page) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!page) throw new Error("Aucune fenêtre de l'appli après 2 minutes.");
  suivre(page);
  await page.waitForLoadState("load");
  await page.waitForTimeout(8000);
  const texte = await page.evaluate(() => document.body.innerText).catch((e) => `(illisible : ${e.message})`);
  await page.screenshot({ path: path.join(sortie, "verification.png") }).catch(() => {});
  console.log("Adresse :", page.url());
  console.log("Texte affiché :\n" + texte.slice(0, 1500));
  await app.close().catch(() => {});
  const journal = path.join(dossier, "journal.txt");
  if (fs.existsSync(journal)) console.log("\nJournal :\n" + fs.readFileSync(journal, "utf8").slice(-6000));
  if (!texte.includes("Lucarne des dossiers imputés")) erreurs.push("l'accueil ne s'affiche pas");
  if (erreurs.length) {
    console.error("\nÉCHEC :\n- " + erreurs.join("\n- "));
    process.exit(1);
  }
  console.log("\nL'appli démarre et affiche l'accueil sans erreur.");
})().catch((e) => {
  console.error("ÉCHEC :", e);
  process.exit(1);
});
