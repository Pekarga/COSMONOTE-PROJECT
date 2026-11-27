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
  await page.goto(new URL("/signes", page.url()).href);
  await page.waitForLoadState("load");
  // Courriers déjà là (scan, essai du modèle), plus les 300 déposés.
  const attendus = 300 + (await page.evaluate(async () => (await (await fetch("/api/signes?limite=1")).json()).compteurs.total));
  const debut = Date.now();
  await page.locator(".lucarne input[type=file]").setInputFiles(fichiers);
  let c = null;
  for (let i = 0; i < 240; i++) {
    c = await page.evaluate(async () => (await (await fetch("/api/signes?limite=1")).json()).compteurs);
    if (c.total >= attendus && !c.enCours && !c.aLire) break;
    await page.waitForTimeout(1000);
  }
  const duree = Math.round((Date.now() - debut) / 1000);
  const t = Date.now();
  const r = await page.evaluate(async () => (await (await fetch("/api/signes?q=virement%20korhogo")).json()).total);
  console.log(`\nVolume : ${c.total} courriers, ${c.prets} prêts en ${duree} s ; recherche « virement korhogo » : ${r} résultats en ${Date.now() - t} ms`);
  if (c.prets < attendus) return "les 300 courriers n'ont pas tous été lus";
  if (r !== 43) return `la recherche donne ${r} résultats au lieu de 43`;
  return null;
}

/** Courrier signé type, collé comme modèle de style pour l'essai du modèle de rédaction. */
const MODELE_SIGNE = `MINISTERE DES FINANCES ET DU BUDGET
______
DIRECTION GENERALE DU BUDGET ET DES FINANCES
______
DIRECTION DU CONTROLE BUDGETAIRE
______
LE DIRECTEUR

REPUBLIQUE DE COTE D'IVOIRE
Union – Discipline – Travail

N°______/MFB/DGBF/DCB/SDCBEPN

Abidjan, le

A
Monsieur le Directeur
du Centre Régional des Œuvres Universitaires de DALOA (CROU-D)

D A L O A

Objet : Demande de visa de la décision portant modification budgétaire

Monsieur le Directeur,

Par courrier N°0456/2026/CROU-D/D du 2 octobre 2026, vous avez soumis à mon visa la décision portant modification du budget de l'exercice 2026 de votre établissement.

Après analyse, il ressort que cette modification consiste en un transfert de crédits de quatre millions (4 000 000) FCFA à l'intérieur de la nature de dépense « Biens et Services ».

Au vu de ce qui précède, j'ai l'honneur de vous retourner, revêtue de mon visa, la décision susvisée.

Je vous prie d'agréer, Monsieur le Directeur, l'assurance de ma considération distinguée.

Ampliation :
- Contrôleur Budgétaire CROU-D`;

const COURRIER_RECU = `MINISTERE DE L'ENSEIGNEMENT SUPERIEUR ET DE LA RECHERCHE SCIENTIFIQUE
CENTRE REGIONAL DES ŒUVRES UNIVERSITAIRES DE BOUAKE
LE DIRECTEUR

N°112/2026/MESRS/CROU-B/D/SDAF                Bouaké, le 3 novembre 2026

A
Monsieur le Directeur du Contrôle Budgétaire
ABIDJAN

Objet : Demande de visa de la décision portant modification du budget 2026

Monsieur le Directeur,

J'ai l'honneur de vous transmettre, pour visa, la décision N°07/2026/MESRS/CROU-B/D du 28 octobre 2026 portant modification de la ventilation du budget de l'exercice 2026 du CROU-B.

Cette modification porte sur un montant de quinze millions (15 000 000) FCFA, transféré de la nature de dépense « Biens et Services » vers la nature de dépense « Investissement », afin de financer la réhabilitation du restaurant universitaire.

Je vous saurais gré de bien vouloir procéder au visa de ladite décision dans les meilleurs délais.

Veuillez agréer, Monsieur le Directeur, l'assurance de ma considération distinguée.

Le Directeur`;

const FICHE = `FICHE D'IMPUTATION
Direction du Contrôle Budgétaire
Courrier arrivée N°2026/1543 du 5 novembre 2026
Expéditeur : CROU-B
Imputé à : Sous-Direction du Contrôle des EPN
Instruction du Directeur : Pour analyse et projet de réponse sous ma signature. Vérifier la conformité au regard des textes.
Délai : 72 heures`;

const secondes = (debut) => Math.round((Date.now() - debut) / 1000);

/** Attend qu'une condition, évaluée dans la page, renvoie une valeur ; affiche l'avancement de temps en temps. */
async function attendre(page, quoi, fn, arg, minutes) {
  const fin = Date.now() + minutes * 60_000;
  let dernier = 0;
  for (;;) {
    const r = await page.evaluate(fn, arg).catch((e) => ({ attente: `(page : ${e.message})` }));
    if (r && r.fini) return r;
    if (Date.now() > fin) throw new Error(`${quoi} : rien après ${minutes} min (${r && r.attente})`);
    if (Date.now() - dernier > 30_000) {
      dernier = Date.now();
      console.log(`  … ${quoi} : ${r && r.attente}`);
    }
    await page.waitForTimeout(2000);
  }
}

/**
 * Modèle de rédaction : téléchargement depuis les Paramètres (comme chez l'utilisateur), analyse d'un dossier,
 * rédaction du projet, puis une retouche. Le projet doit venir du modèle, pas des formules de repli.
 */
async function verifierModele(page) {
  const origine = new URL(page.url()).origin;
  await page.goto(`${origine}/reglages`);
  await page.waitForSelector("#modele", { timeout: 30000 });
  const debut = Date.now();
  await page.locator("#modele").getByRole("button", { name: /Télécharger le modèle/ }).click();
  await attendre(
    page,
    "téléchargement du modèle",
    () => {
      const t = document.querySelector("#modele")?.innerText ?? "";
      return t.includes("est installé") ? { fini: true } : { attente: t.replace(/\s+/g, " ").slice(0, 220) };
    },
    null,
    30,
  );
  console.log(`\nModèle téléchargé et vérifié en ${secondes(debut)} s`);

  // Un courrier signé de référence, pris comme mise en page par défaut.
  const signe = await page.evaluate(async (texte) => {
    const f = new FormData();
    f.append("texte", texte);
    const r = await (await fetch("/api/signes", { method: "POST", body: f })).json();
    return r.ids?.[0] ?? null;
  }, MODELE_SIGNE);
  await attendre(
    page,
    "lecture du courrier de référence",
    async (id) => {
      const s = (await (await fetch(`/api/signes/${id}`)).json()).signe;
      return s?.status === "ready" ? { fini: true } : { attente: s?.status };
    },
    signe,
    5,
  );
  await page.evaluate(async (id) => {
    await fetch(`/api/signes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaut: true }) });
  }, signe);

  // Dossier imputé : analyse par le modèle.
  let t = Date.now();
  const dossierId = await page.evaluate(
    async ({ recu, fiche }) => {
      const f = new FormData();
      f.append("file", new File([recu], "courrier-recu.txt", { type: "text/plain" }));
      f.append("file", new File([fiche], "fiche-imputation.txt", { type: "text/plain" }));
      return (await (await fetch("/api/dossiers", { method: "POST", body: f })).json()).id;
    },
    { recu: COURRIER_RECU, fiche: FICHE },
  );
  const analyse = await attendre(
    page,
    "analyse du dossier",
    async (id) => {
      const d = (await (await fetch(`/api/dossiers/${id}`)).json()).dossier;
      if (d.status === "ready" || d.status === "error") return { fini: true, d };
      return { attente: d.step };
    },
    dossierId,
    25,
  );
  console.log(`\nAnalyse du dossier en ${secondes(t)} s :`, analyse.d.status, analyse.d.error ?? "");
  console.log(JSON.stringify(analyse.d.analyse, null, 1).slice(0, 2500));
  if (analyse.d.status !== "ready") return `analyse : ${analyse.d.error}`;
  if (analyse.d.demo) return "l'analyse ne vient pas du modèle";

  // Rédaction du projet de réponse.
  t = Date.now();
  const courrierId = await page.evaluate(async (id) => {
    const r = await fetch(`/api/dossiers/${id}/rediger`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        consignes: "Refuser le visa : un transfert de crédits vers la nature « Investissement » relève d'un arrêté du Ministre chargé du Budget.\nInviter le CROU-B à saisir le Ministre par la voie hiérarchique.",
        ton: "courtois",
        genre: "courrier",
      }),
    });
    return (await r.json()).id;
  }, dossierId);
  const redige = await attendre(
    page,
    "rédaction du projet",
    async (id) => {
      const d = await (await fetch(`/api/courriers/${id}`)).json();
      if (d.courrier.status !== "processing") return { fini: true, c: d.courrier };
      return { attente: d.travail ? `${d.travail.libelle} ${d.travail.phase} ${d.travail.progression} %` : "en attente" };
    },
    courrierId,
    30,
  );
  const c = redige.c;
  console.log(`\nProjet rédigé en ${secondes(t)} s :`, c.status, c.error ?? "");
  console.log(`Objet : ${c.objet}\n${c.destinataire}\n\n${c.appel}\n\n${c.corps}\n\n${c.politesse}\n\nAmpliation : ${c.ampliation}\nRemarques :\n- ${c.remarques.join("\n- ")}`);
  if (c.status !== "ready") return `rédaction : ${c.error}`;
  if (c.demo || c.remarques.some((r) => /n'a pas pu rédiger/.test(r))) return "le projet ne vient pas du modèle";
  if (c.corps.length < 200) return "le projet est trop court";
  if (/contr[ôo]le budg[ée]taire|minist[èe]re/i.test(c.destinataire)) return `destinataire erroné : ${c.destinataire.replace(/\n/g, " / ")}`;
  if (!/CROU-B|BOUAK/i.test(c.destinataire)) return `destinataire incomplet : ${c.destinataire.replace(/\n/g, " / ")}`;
  if (/2020-1234|N°\s*\d{4}-\d{3,}/.test(c.corps.replace(/\[à compléter[^\]]*\]/g, ""))) return "le projet cite un texte absent du dossier";
  if (/\*\*/.test(`${c.corps}${JSON.stringify(analyse.d.analyse)}`)) return "du gras Markdown reste dans le texte";

  // Retouche demandée en quelques mots.
  t = Date.now();
  const retouche = await page.evaluate(async (id) => {
    const r = await fetch(`/api/courriers/${id}/retouche`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: "Ajoute une phrase rappelant le délai de traitement de 72 heures fixé par le Directeur." }),
    });
    return { ok: r.ok, ...(await r.json()) };
  }, courrierId);
  console.log(`\nRetouche en ${secondes(t)} s :`, retouche.ok ? "faite" : retouche.error);
  if (retouche.courrier) console.log(retouche.courrier.corps);
  if (!retouche.ok) return `retouche : ${retouche.error}`;
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
    if (process.env.VERIFIER_MODELE === "1") {
      const modele = await verifierModele(page).catch((e) => `modèle : ${e.message}`);
      if (modele) erreurs.push(modele);
    }
    const volume = await verifierVolume(page).catch((e) => `volume : ${e.message}`);
    if (volume) erreurs.push(volume);
  }
  await app.close().catch(() => {});
  const journal = path.join(dossier, "journal.txt");
  if (fs.existsSync(journal)) console.log("\nJournal :\n" + fs.readFileSync(journal, "utf8").slice(-12000));
  if (!texte.includes("Lucarne des dossiers imputés")) erreurs.push("l'accueil ne s'affiche pas");
  if (erreurs.length) {
    console.error("\nÉCHEC :\n- " + erreurs.join("\n- "));
    process.exit(1);
  }
  console.log(
    "\nL'appli démarre, affiche l'accueil sans erreur, lit un courrier scanné et tient 300 courriers d'un coup." +
      (process.env.VERIFIER_MODELE === "1" ? " Le modèle de rédaction se télécharge, analyse, rédige et retouche." : ""),
  );
})().catch((e) => {
  console.error("ÉCHEC :", e);
  process.exit(1);
});
