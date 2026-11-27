// Appli de bureau « Le rédacteur » : lance le serveur embarqué puis l'affiche dans une fenêtre.
const { app, BrowserWindow, shell, session, dialog, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

// Dossier des données : %APPDATA%\Le redacteur sous Windows.
app.setName("Le rédacteur");
app.setPath("userData", path.join(app.getPath("appData"), "Le redacteur"));

let server = null;
let win = null;

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
    stdio: "inherit",
    windowsHide: true,
  });
  server.on("exit", (code) => {
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
  win = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 420,
    minHeight: 500,
    title: "Rédacteur de Courriers Administratifs",
    backgroundColor: "#f2f4f7",
    show: false,
    icon: path.join(__dirname, "icon.png"),
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
          icon: path.join(__dirname, "icon.png"),
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
  app.whenReady().then(() =>
    createWindow().catch((err) => {
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
