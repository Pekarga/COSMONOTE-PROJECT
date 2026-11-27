// Pont minimal entre la page et l'appli de bureau : export PDF de la feuille A4, bouton Quitter, journal.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("redacteur", {
  savePdf: (name) => ipcRenderer.invoke("save-pdf", String(name || "")),
  quitter: () => ipcRenderer.send("quitter"),
  ouvrirJournal: () => ipcRenderer.send("ouvrir-journal"),
});
