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

/** PDF d'une seule page faite d'une image JPEG, comme un courrier passé au scanner. */
function pdfScanne(jpeg) {
  const W = 595;
  const H = 842;
  const contenu = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  const objets = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    [`<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, "\nendstream"],
    `<< /Length ${contenu.length} >>\nstream\n${contenu}\nendstream`,
  ];
  const parts = [Buffer.from("%PDF-1.4\n")];
  let taille = parts[0].length;
  const positions = [];
  objets.forEach((o, i) => {
    positions.push(taille);
    const morceaux = [`${i + 1} 0 obj\n`, ...(Array.isArray(o) ? o : [o]), "\nendobj\n"].map((m) => (Buffer.isBuffer(m) ? m : Buffer.from(m, "latin1")));
    for (const m of morceaux) {
      parts.push(m);
      taille += m.length;
    }
  });
  const xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n${positions.map((p) => String(p).padStart(10, "0") + " 00000 n \n").join("")}`;
  parts.push(Buffer.from(`${xref}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\nstartxref\n${taille}\n%%EOF\n`, "latin1"));
  return Buffer.concat(parts);
}

/** Dépose un courrier signé scanné et vérifie que son texte est lu sur l'ordinateur, sans clé. */
async function verifierScan(page) {
  await page.goto(new URL("/signes", page.url()).href);
  await page.waitForLoadState("load");
  const jpeg = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1240;
    c.height = 1754;
    const x = c.getContext("2d");
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    x.fillStyle = "#111";
    x.font = "34px serif";
    const lignes = [
      "MINISTERE DE L'ECONOMIE ET DES FINANCES",
      "DIRECTION DU CONTROLE BUDGETAIRE",
      "",
      "Abidjan, le 12 novembre 2026",
      "",
      "Objet : Votre demande de modification budgetaire",
      "",
      "Monsieur le Directeur,",
      "Par courrier en date du 3 novembre 2026, vous avez sollicite",
      "la modification de la ventilation de votre budget.",
      "Je vous prie d'agreer, Monsieur le Directeur, l'assurance",
      "de ma consideration distinguee.",
    ];
    lignes.forEach((l, i) => x.fillText(l, 120, 220 + i * 62));
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  const debut = Date.now();
  await page.locator(".lucarne input[type=file]").setInputFiles({
    name: "courrier-scanne.pdf",
    mimeType: "application/pdf",
    buffer: pdfScanne(Buffer.from(jpeg, "base64")),
  });
  await page.waitForFunction(
    () => document.querySelector(".signe-row") && !document.querySelector(".spinner") && !document.querySelector(".upload-strip"),
    null,
    { timeout: 240000 },
  );
  const signe = await page.evaluate(async () => {
    const { signes } = await (await fetch("/api/signes")).json();
    const s = signes.find((x) => x.nomFichier === "courrier-scanne.pdf");
    return s ? (await (await fetch(`/api/signes/${s.id}`)).json()).signe : null;
  });
  console.log(`\nScan lu en ${Math.round((Date.now() - debut) / 1000)} s :`, signe?.status, signe?.error ?? "");
  console.log((signe?.texte ?? "").slice(0, 400));
  await page.screenshot({ path: path.join(sortie, "verification-scan.png") }).catch(() => {});
  if (signe?.status !== "ready" || !/modification/i.test(signe.texte)) return "le courrier scanné n'a pas été lu";
  return null;
}

/** Gros volume : 300 courriers déposés d'un coup, lus en file d'attente, puis une recherche. */
async function verifierVolume(page) {
  const fichiers = Array.from({ length: 300 }, (_, i) => ({
    name: `volume-${String(i).padStart(3, "0")}.txt`,
    mimeType: "text/plain",
    buffer: Buffer.from(
      `DIRECTION DU CONTROLE BUDGETAIRE\nN° ${100 + i}/MEFB/DGBF/DCB\nObjet : Demande de virement de crédits n° ${i}\n` +
        `Monsieur le Directeur,\nPar courrier du ${1 + (i % 28)} octobre 2026, vous avez sollicité un virement de crédits ` +
        `de ${(i + 1) * 1000000} FCFA au profit de l'établissement ${i % 7 === 0 ? "de Korhogo" : "d'Abidjan"}.\n` +
        `Je vous prie d'agréer, Monsieur le Directeur, l'assurance de ma considération distinguée.\n`,
    ),
  }));
  const debut = Date.now();
  await page.locator(".lucarne input[type=file]").setInputFiles(fichiers);
  let c = null;
  for (let i = 0; i < 240; i++) {
    c = await page.evaluate(async () => (await (await fetch("/api/signes?limite=1")).json()).compteurs);
    if (c.total >= 301 && !c.enCours && !c.aLire) break;
    await page.waitForTimeout(1000);
  }
  const duree = Math.round((Date.now() - debut) / 1000);
  const t = Date.now();
  const r = await page.evaluate(async () => (await (await fetch("/api/signes?q=virement%20korhogo")).json()).total);
  console.log(`\nVolume : ${c.total} courriers, ${c.prets} prêts en ${duree} s ; recherche « virement korhogo » : ${r} résultats en ${Date.now() - t} ms`);
  if (c.prets < 301) return "les 300 courriers n'ont pas tous été lus";
  if (r !== 43) return `la recherche donne ${r} résultats au lieu de 43`;
  return null;
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
  if (texte.includes("Lucarne des dossiers imputés")) {
    const echec = await verifierScan(page).catch((e) => `lecture du scan : ${e.message}`);
    if (echec) erreurs.push(echec);
    const volume = await verifierVolume(page).catch((e) => `volume : ${e.message}`);
    if (volume) erreurs.push(volume);
  }
  await app.close().catch(() => {});
  const journal = path.join(dossier, "journal.txt");
  if (fs.existsSync(journal)) console.log("\nJournal :\n" + fs.readFileSync(journal, "utf8").slice(-6000));
  if (!texte.includes("Lucarne des dossiers imputés")) erreurs.push("l'accueil ne s'affiche pas");
  if (erreurs.length) {
    console.error("\nÉCHEC :\n- " + erreurs.join("\n- "));
    process.exit(1);
  }
  console.log("\nL'appli démarre, affiche l'accueil sans erreur, lit un courrier scanné et tient 300 courriers d'un coup.");
})().catch((e) => {
  console.error("ÉCHEC :", e);
  process.exit(1);
});
