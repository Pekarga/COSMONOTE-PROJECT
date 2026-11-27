// Pont minimal entre la page et l'appli de bureau : export PDF de la feuille A4, bouton Quitter, journal,
// téléchargement du modèle de rédaction.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("redacteur", {
  savePdf: (name) => ipcRenderer.invoke("save-pdf", String(name || "")),
  quitter: () => ipcRenderer.send("quitter"),
  ouvrirJournal: () => ipcRenderer.send("ouvrir-journal"),
  modele: {
    etat: () => ipcRenderer.invoke("modele-etat"),
    telecharger: () => ipcRenderer.invoke("modele-telecharger"),
    pause: () => ipcRenderer.invoke("modele-pause"),
    importer: () => ipcRenderer.invoke("modele-importer"),
    surEtat: (rappel) => {
      const f = (_e, etat) => rappel(etat);
      ipcRenderer.on("modele-etat", f);
      return () => ipcRenderer.removeListener("modele-etat", f);
    },
  },
});
