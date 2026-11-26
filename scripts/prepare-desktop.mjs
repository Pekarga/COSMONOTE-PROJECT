// Copie le serveur Next.js autonome dans desktop/server-bundle,
// avec les fichiers statiques, pour l'embarquer dans l'appli de bureau.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const out = path.join(root, "desktop", "server-bundle");

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  console.error("Lance d'abord `npm run build` (serveur autonome introuvable).");
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(standalone, out, { recursive: true, verbatimSymlinks: false, dereference: true });
fs.cpSync(path.join(root, ".next", "static"), path.join(out, ".next", "static"), { recursive: true });
fs.cpSync(path.join(root, "public"), path.join(out, "public"), { recursive: true });
// Ne jamais embarquer de données ni de secrets locaux.
for (const p of ["data", ".env", ".env.local"]) fs.rmSync(path.join(out, p), { recursive: true, force: true });
console.log("Serveur prêt dans", path.relative(root, out));
