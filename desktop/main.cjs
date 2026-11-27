// Appli de bureau « Le rédacteur » : lance le serveur embarqué puis l'affiche dans une fenêtre.
const { app, BrowserWindow, shell, session, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

// Dossier des données : %APPDATA%\Le redacteur sous Windows.
app.setName("Le rédacteur");
app.setPath("userData", path.join(app.getPath("appData"), "Le redacteur"));

let server = null;
let win = null;

// Journal de démarrage : %APPDATA%\Le redacteur\journal.txt, pour comprendre un plantage.
const JOURNAL = path.join(app.getPath("userData"), "journal.txt");
try {
  fs.mkdirSync(path.dirname(JOURNAL), { recursive: true });
  if (fs.existsSync(JOURNAL) && fs.statSync(JOURNAL).size > 1_000_000) fs.rmSync(JOURNAL);
} catch {}
function journal(...parts) {
  const ligne = `[${new Date().toISOString()}] ${parts.join(" ")}`.trimEnd();
  try {
    fs.appendFileSync(JOURNAL, ligne + "\n");
  } catch {}
  if (!app.isPackaged) console.log(ligne);
}
// Affichage : si le processus graphique ou la page a planté, on relance sans accélération graphique.
const SANS_GPU = path.join(app.getPath("userData"), "sans-acceleration.txt");
if (fs.existsSync(SANS_GPU)) app.disableHardwareAcceleration();
function relancerSansGpu(motif) {
  if (fs.existsSync(SANS_GPU)) return false;
  journal("relance sans accélération graphique :", motif);
  try {
    fs.writeFileSync(SANS_GPU, `Accélération graphique coupée le ${new Date().toISOString()} : ${motif}\n`);
  } catch {}
  app.isQuitting = true;
  if (server) server.kill();
  app.relaunch();
  app.exit(0);
  return true;
}
app.on("child-process-gone", (_e, d) => {
  journal("processus", d.type, "arrêté :", d.reason, String(d.exitCode));
  if (d.type === "GPU" && d.reason !== "clean-exit") relancerSansGpu(`processus graphique ${d.reason}`);
});

process.on("uncaughtException", (err) => journal("main : exception", err && err.stack ? err.stack : String(err)));
process.on("unhandledRejection", (err) => journal("main : promesse rejetée", err && err.stack ? err.stack : String(err)));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http
        .get(url, (res) => {
          res.resume();
          resolve();
        })
        .on("error", () => {
          if (Date.now() - start > timeoutMs) reject(new Error("Le serveur n'a pas démarré."));
          else setTimeout(attempt, 250);
        });
    };
    attempt();
  });
}

async function startServer() {
  const port = await freePort();
  const serverDir = app.isPackaged
    ? path.join(process.resourcesPath, "app-server")
    : path.join(__dirname, "server-bundle");
  server = spawn(process.execPath, [path.join(serverDir, "server.js")], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      NODE_NO_WARNINGS: "1",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      DATA_DIR: path.join(app.getPath("userData"), "data"),
    },
    // Sorties du serveur dans le journal (une appli Windows sans console n'a pas de sortie standard).
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdout.on("data", (d) => journal("serveur :", String(d)));
  server.stderr.on("data", (d) => journal("serveur ! ", String(d)));
  server.on("error", (err) => journal("serveur : lancement impossible", String(err)));
  server.on("exit", (code) => {
    journal("serveur : arrêt, code", String(code));
    if (code && !app.isQuitting) {
      dialog.showErrorBox("Le rédacteur", `Le serveur s'est arrêté (code ${code}).`);
      app.quit();
    }
  });
  const url = `http://127.0.0.1:${port}`;
  await waitForServer(url);
  return url;
}

const WEB_PREFS = { contextIsolation: true, sandbox: true, preload: path.join(__dirname, "preload.cjs") };
// Sous Windows, l'icône .ico contient toutes les tailles (barre des tâches, Alt+Tab).
const ICONE = path.join(__dirname, process.platform === "win32" ? "icon.ico" : "icon.png");

/** Fichiers ouverts depuis l'appli (pièces, courriers d'origine) et documents Word exportés. */
function gererTelechargements(url) {
  session.defaultSession.on("will-download", (_event, item, wc) => {
    const export_ = /\/api\/courriers\/[^/]+\/docx/.test(item.getURL());
    if (export_) {
      // Le projet exporté : on demande où l'enregistrer.
      item.setSaveDialogOptions({
        title: "Enregistrer le document Word",
        defaultPath: path.join(app.getPath("documents"), item.getFilename()),
        filters: [{ name: "Document Word", extensions: ["docx"] }],
      });
    } else if (item.getURL().startsWith(url)) {
      // Une pièce Word ou OpenDocument : on l'ouvre directement dans le traitement de texte.
      const dir = path.join(app.getPath("temp"), "Le redacteur");
      fs.mkdirSync(dir, { recursive: true });
      const dest = path.join(dir, `${Date.now()}-${item.getFilename()}`);
      item.setSavePath(dest);
      item.once("done", (_e, state) => {
        if (state === "completed") shell.openPath(dest);
      });
    }
    // Une fenêtre ouverte seulement pour ce fichier reste vide : on la ferme.
    const child = wc ? BrowserWindow.fromWebContents(wc) : null;
    if (child && child !== win) {
      item.once("done", () => {
        const u = wc.isDestroyed() ? "" : wc.getURL();
        if (!child.isDestroyed() && (!u || u === "about:blank" || u === item.getURL())) child.close();
      });
    }
  });
}

/** Export PDF de la feuille A4, avec les mêmes marges que l'impression. */
function gererPdf(url) {
  ipcMain.handle("save-pdf", async (event, name) => {
    const wc = event.sender;
    if (!wc.getURL().startsWith(url)) return null;
    const nom = String(name || "Courrier").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 100) || "Courrier";
    const { canceled, filePath } = await dialog.showSaveDialog(BrowserWindow.fromWebContents(wc), {
      title: "Enregistrer en PDF",
      defaultPath: path.join(app.getPath("documents"), `${nom}.pdf`),
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (canceled || !filePath) return null;
    const data = await wc.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      // En pouces : 12,5 mm en haut, 12 mm en bas, 25 mm à gauche, 20 mm à droite.
      margins: { top: 0.49, bottom: 0.47, left: 0.98, right: 0.79 },
    });
    await fs.promises.writeFile(filePath, data);
    return filePath;
  });
}

async function createWindow() {
  const url = await startServer();
  // Aucune autorisation particulière (micro, caméra, position) n'est nécessaire.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) =>
    cb(permission === "clipboard-sanitized-write" || permission === "fullscreen"),
  );
  gererTelechargements(url);
  gererPdf(url);
  ipcMain.on("quitter", () => app.quit());
  ipcMain.on("ouvrir-journal", () => shell.openPath(JOURNAL));
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 420,
    minHeight: 500,
    title: "Rédacteur de Courriers Administratifs",
    backgroundColor: "#f2f4f7",
    show: false,
    icon: ICONE,
    autoHideMenuBar: true,
    webPreferences: WEB_PREFS,
  });
  // Les pièces s'ouvrent dans une fenêtre à part ; les liens externes dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 900,
          height: 1000,
          autoHideMenuBar: true,
          backgroundColor: "#ffffff",
          icon: ICONE,
          webPreferences: { contextIsolation: true, sandbox: true, plugins: true },
        },
      };
    }
    if (/^https?:/i.test(target)) shell.openExternal(target);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) {
      event.preventDefault();
      if (/^https?:/i.test(target)) shell.openExternal(target);
    }
  });
  // Grande fenêtre dès l'ouverture : la page A4 et les panneaux tiennent côte à côte.
  const montrer = () => {
    if (win && !win.isDestroyed() && !win.isVisible()) {
      win.maximize();
      win.show();
    }
  };
  // Tout ce que la page signale (erreurs, plantage) va dans le journal.
  win.webContents.on("console-message", (e) => {
    if (e.level === "error" || e.level === "warning") journal(`page ${e.level} :`, e.message, e.sourceId ? `(${e.sourceId}:${e.lineNumber})` : "");
  });
  let rechargements = 0;
  win.webContents.on("render-process-gone", (_e, details) => {
    journal("page : processus arrêté", JSON.stringify(details));
    if (app.isQuitting || details.reason === "clean-exit") return;
    if (relancerSansGpu(`page ${details.reason}`)) return;
    if (rechargements++ < 2) {
      setTimeout(() => win && !win.isDestroyed() && win.webContents.reload(), 500);
      return;
    }
    dialog.showErrorBox(
      "Le rédacteur",
      `La page s'est arrêtée (${details.reason}). Fermez puis rouvrez Le rédacteur.\n\nDétails pour l'assistance : ${JOURNAL}`,
    );
  });
  win.webContents.on("did-fail-load", (_e, code, desc, u) => journal("page : chargement impossible", String(code), desc, u));
  win.webContents.on("unresponsive", () => journal("page : ne répond plus"));
  win.once("ready-to-show", montrer);
  setTimeout(montrer, 8000);
  await win.loadURL(url);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  journal(
    "démarrage",
    app.getVersion(),
    `${process.platform} ${os.release()} ${process.arch}`,
    "Electron",
    process.versions.electron,
    fs.existsSync(SANS_GPU) ? "sans accélération graphique" : "",
  );
  app.whenReady().then(() =>
    createWindow().catch((err) => {
      journal("main : échec du démarrage", err && err.stack ? err.stack : String(err));
      dialog.showErrorBox("Le rédacteur", String(err && err.message ? err.message : err));
      app.quit();
    }),
  );
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    app.isQuitting = true;
    if (server) server.kill();
  });
}
