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
};
