// Téléchargement unique du modèle de rédaction (Ministral 3 8B, 5,2 Go) depuis les Paramètres.
// Il passe par le réseau de Chromium (net.fetch) : proxy du système et certificats de Windows compris.
// Un téléchargement interrompu (coupure, appli fermée) reprend là où il s'était arrêté.
const { net, ipcMain, dialog, BrowserWindow } = require("electron");
const { execFile } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// Les variables MODELE_* ne servent qu'aux essais (fichier de remplacement servi en local).
const MODELE = {
  fichier: "Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
  url:
    process.env.MODELE_URL ||
    "https://huggingface.co/unsloth/Ministral-3-8B-Instruct-2512-GGUF/resolve/main/Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
  taille: Number(process.env.MODELE_TAILLE) || 5198386720,
  sha256: process.env.MODELE_SHA256 || "5dbc3647eb563b9f8d3c70ec3d906cce84b86bb35c5e0b8a36e7df3937ab7174",
};

/** Message lisible pour une erreur réseau de Chromium (net::ERR_…). */
function messageReseau(err) {
  const m = String((err && err.message) || err);
  if (/INTERNET_DISCONNECTED|NAME_NOT_RESOLVED|ADDRESS_UNREACHABLE|NETWORK_ACCESS_DENIED/.test(m)) return "pas de connexion à Internet";
  if (/PROXY|TUNNEL/.test(m)) return "le proxy du réseau a refusé la connexion";
  if (/CERT|SSL/.test(m)) return "le certificat du site n'est pas reconnu sur ce réseau";
  if (/ERR_/.test(m)) return "la connexion a été coupée";
  return m;
}
const transitoire = (err) => /ERR_|coupée|avant la fin|a répondu 5\d\d/.test(String((err && err.message) || err));

function gererModele(dossier, journal) {
  const final = path.join(dossier, MODELE.fichier);
  const part = `${final}.part`;
  const ok = `${final}.ok`;
  let controleur = null;
  let enCours = null;
  let etat = null;
  const abonnes = new Set();

  function taillePartielle() {
    try {
      return fs.statSync(part).size;
    } catch {
      return 0;
    }
  }
  function installe() {
    try {
      return fs.statSync(final).size === MODELE.taille && fs.existsSync(ok);
    } catch {
      return false;
    }
  }
  function etatDisque() {
    if (installe()) return { etat: "installe", recu: MODELE.taille, total: MODELE.taille, debit: 0, erreur: null };
    const recu = taillePartielle();
    return { etat: recu ? "pause" : "absent", recu, total: MODELE.taille, debit: 0, erreur: null };
  }
  function courant() {
    return enCours ? etat : { ...etatDisque(), erreur: etat && etat.etat === "erreur" ? etat.erreur : null };
  }
  let dernierEnvoi = 0;
  function publier(force) {
    const now = Date.now();
    if (!force && now - dernierEnvoi < 400) return;
    dernierEnvoi = now;
    for (const wc of abonnes) if (!wc.isDestroyed()) wc.send("modele-etat", etat);
  }

  /** Lit un fichier en calculant son empreinte SHA-256 ; copie aussi vers `copie` si demandé. */
  async function empreinte(source, copie, surAvance) {
    const h = crypto.createHash("sha256");
    const lecture = fs.createReadStream(source, { highWaterMark: 4 << 20 });
    const sortie = copie ? await fs.promises.open(copie, "w") : null;
    let lu = 0;
    try {
      for await (const morceau of lecture) {
        if (controleur && controleur.signal.aborted) throw new Error("annulé");
        h.update(morceau);
        if (sortie) await sortie.write(morceau);
        lu += morceau.length;
        surAvance(lu);
      }
    } finally {
      if (sortie) await sortie.close();
    }
    return h.digest("hex");
  }

  /** Le modèle a besoin de place sur le disque (avec une marge de 500 Mo). */
  function placeLibre(besoin) {
    try {
      const st = fs.statfsSync(dossier);
      const libre = st.bavail * st.bsize;
      if (libre < besoin + 500e6) {
        throw new Error(
          `il faut ${((besoin + 500e6) / 1e9).toFixed(1).replace(".", ",")} Go libres sur le disque (${(libre / 1e9).toFixed(1).replace(".", ",")} Go disponibles)`,
        );
      }
    } catch (err) {
      if (err && /Go libres/.test(err.message)) throw err;
    }
  }

  async function verifierEtInstaller(fichier) {
    etat = { ...etat, etat: "verification", recu: 0, debit: 0 };
    publier(true);
    const h = await empreinte(fichier, null, (lu) => {
      etat.recu = lu;
      publier();
    });
    if (h !== MODELE.sha256) {
      fs.rmSync(fichier, { force: true });
      throw new Error("Le fichier téléchargé est abîmé : relancez le téléchargement.");
    }
    fs.renameSync(fichier, final);
    fs.writeFileSync(ok, `${h}\n`);
  }

  /** Téléchargement avec nouveaux essais automatiques si la connexion se coupe (jusqu'à 6 essais). */
  async function telecharger() {
    for (let essai = 1; ; essai++) {
      try {
        return await telechargerUneFois();
      } catch (err) {
        if (controleur.signal.aborted || essai >= 6 || !transitoire(err)) throw err;
        const attente = Math.min(60, 5 * essai);
        journal("modèle : nouvel essai dans", String(attente), "s après", String(err && err.message ? err.message : err));
        etat = { ...etat, etat: "telechargement", debit: 0, erreur: `${messageReseau(err)}, nouvel essai dans ${attente} s` };
        publier(true);
        await new Promise((resolve) => {
          const t = setTimeout(resolve, attente * 1000);
          controleur.signal.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
        });
        if (controleur.signal.aborted) throw new Error("annulé");
      }
    }
  }

  async function telechargerUneFois() {
    fs.mkdirSync(dossier, { recursive: true });
    let recu = taillePartielle();
    if (recu > MODELE.taille) {
      fs.rmSync(part, { force: true });
      recu = 0;
    }
    placeLibre(MODELE.taille - recu);
    etat = { etat: "telechargement", recu, total: MODELE.taille, debit: 0, erreur: null };
    publier(true);
    if (recu < MODELE.taille) {
      const res = await net.fetch(MODELE.url, {
        headers: recu ? { Range: `bytes=${recu}-` } : {},
        signal: controleur.signal,
        cache: "no-store",
      });
      if (res.status === 200 && recu) recu = 0; // le serveur ne reprend pas : on recommence
      else if (res.status !== 200 && res.status !== 206) throw new Error(`le serveur a répondu ${res.status}`);
      etat.recu = recu;
      const sortie = await fs.promises.open(part, recu ? "a" : "w");
      let repere = { t: Date.now(), octets: recu };
      try {
        const lecteur = res.body.getReader();
        for (;;) {
          const { done, value } = await lecteur.read();
          if (done) break;
          await sortie.write(value);
          recu += value.length;
          etat.recu = recu;
          etat.erreur = null;
          const t = Date.now();
          if (t - repere.t >= 2000) {
            etat.debit = Math.round(((recu - repere.octets) * 1000) / (t - repere.t));
            repere = { t, octets: recu };
          }
          publier();
        }
      } finally {
        await sortie.close();
      }
    }
    if (recu !== MODELE.taille) throw new Error("le téléchargement s'est arrêté avant la fin");
    await verifierEtInstaller(part);
  }

  async function importer(source) {
    fs.mkdirSync(dossier, { recursive: true });
    placeLibre(MODELE.taille);
    const st = fs.statSync(source);
    if (st.size !== MODELE.taille) {
      throw new Error(`Ce fichier n'est pas le modèle attendu (${MODELE.fichier}, ${(MODELE.taille / 1e9).toFixed(1)} Go).`);
    }
    etat = { etat: "copie", recu: 0, total: MODELE.taille, debit: 0, erreur: null };
    publier(true);
    const h = await empreinte(source, part, (lu) => {
      etat.recu = lu;
      publier();
    });
    if (h !== MODELE.sha256) {
      fs.rmSync(part, { force: true });
      throw new Error("Ce fichier est abîmé ou ce n'est pas le bon modèle.");
    }
    fs.renameSync(part, final);
    fs.writeFileSync(ok, `${h}\n`);
  }

  function lancer(travail, libelle) {
    if (enCours) return enCours;
    controleur = new AbortController();
    journal("modèle :", libelle);
    enCours = travail()
      .then(() => {
        etat = etatDisque();
        journal("modèle : installé");
      })
      .catch((err) => {
        const annule = controleur.signal.aborted;
        journal("modèle :", annule ? "pause" : `échec, ${err && err.message ? err.message : err}`);
        etat = annule ? etatDisque() : { ...etatDisque(), etat: "erreur", erreur: messageReseau(err) };
      })
      .finally(() => {
        enCours = null;
        controleur = null;
        publier(true);
      });
    return enCours;
  }

  ipcMain.handle("modele-etat", (event) => {
    const wc = event.sender;
    if (!abonnes.has(wc)) {
      abonnes.add(wc);
      wc.once("destroyed", () => abonnes.delete(wc));
    }
    return courant();
  });
  ipcMain.handle("modele-telecharger", () => {
    if (installe()) return courant();
    lancer(telecharger, "téléchargement");
    return courant();
  });
  ipcMain.handle("modele-pause", () => {
    if (controleur) controleur.abort();
    return courant();
  });
  ipcMain.handle("modele-importer", async (event) => {
    if (enCours) return courant();
    const { canceled, filePaths } = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      title: "Choisir le fichier du modèle",
      properties: ["openFile"],
      filters: [{ name: "Modèle GGUF", extensions: ["gguf"] }],
    });
    if (canceled || !filePaths[0]) return courant();
    lancer(() => importer(filePaths[0]), `copie depuis ${filePaths[0]}`);
    return courant();
  });

  return {
    /** Arrête un téléchargement en cours (fermeture de l'appli) ; il reprendra au prochain lancement. */
    arreter() {
      if (controleur) controleur.abort();
    },
  };
}

/** Arrête le serveur du modèle laissé en marche par un arrêt brutal de l'appli (fichier llama.pid). */
function arreterServeurModele(dossier, verifierNom) {
  const fichier = path.join(dossier, "llama.pid");
  let pid = 0;
  try {
    pid = Number(fs.readFileSync(fichier, "utf8").trim());
  } catch {
    return;
  }
  const tuer = () => {
    try {
      process.kill(pid);
    } catch {}
    try {
      fs.rmSync(fichier, { force: true });
    } catch {}
  };
  if (!pid) return tuer();
  // Au démarrage, on vérifie que ce numéro désigne bien le serveur du modèle avant de l'arrêter.
  if (!verifierNom || process.platform !== "win32") return tuer();
  execFile("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], { windowsHide: true }, (err, sortie) => {
    if (!err && /llama-server/i.test(String(sortie))) tuer();
    else
      try {
        fs.rmSync(fichier, { force: true });
      } catch {}
  });
}

module.exports = { gererModele, arreterServeurModele, MODELE };
