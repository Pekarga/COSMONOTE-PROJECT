// electron-builder exclut les dossiers node_modules des « extraResources ».
// On copie donc nous-mêmes le serveur embarqué dans le dossier resources.
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, "Contents", "Resources")
      : path.join(context.appOutDir, "resources");
  const target = path.join(resources, "app-server");
  fs.rmSync(target, { recursive: true, force: true });
  fs.cpSync(path.join(__dirname, "server-bundle"), target, { recursive: true });
  console.log("  • serveur embarqué copié dans", target);
  // Serveur du modèle de rédaction (llama.cpp), téléchargé par le workflow dans desktop/llama.
  const llama = path.join(__dirname, "llama");
  const cible = path.join(resources, "llama");
  fs.rmSync(cible, { recursive: true, force: true });
  if (fs.existsSync(llama)) {
    fs.cpSync(llama, cible, { recursive: true });
    console.log("  • serveur du modèle copié dans", cible);
  } else console.log("  • serveur du modèle absent (desktop/llama) : la rédaction passera par les formules");
};
