/** Lancé une fois au démarrage du serveur (Next.js) : reprise des traitements et sauvegardes. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { demarrer } = await import("./lib/demarrage");
  demarrer();
}
