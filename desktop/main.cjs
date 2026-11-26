// Appli de bureau « Le rédacteur » : lance le serveur embarqué puis l'affiche dans une fenêtre.
const { app, BrowserWindow, shell, session, dialog } = require("electron");
const { spawn } = require("node:child_process");
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

async function createWindow() {
  const url = await startServer();
  // Autorise le micro pour l'enregistrement.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === "media"));
  win = new BrowserWindow({
    width: 1200,
    height: 850,
    minWidth: 380,
    minHeight: 500,
    title: "Le rédacteur",
    backgroundColor: "#f6f1e7",
    icon: path.join(__dirname, "icon.png"),
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Les liens externes s'ouvrent dans le navigateur.
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (!target.startsWith(url)) shell.openExternal(target);
    return { action: "deny" };
  });
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
