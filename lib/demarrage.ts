import { remettreScansEnLecture, travauxInterrompus } from "./db";
import { lancerCourrier, lancerDossier, lancerSigne } from "./process";
import { sauvegardeAuto } from "./sauvegarde";

/**
 * Au démarrage du serveur : reprend les traitements interrompus (appli fermée pendant une lecture ou une
 * analyse), remet en lecture les scans restés en erreur dans les versions précédentes, et planifie la
 * sauvegarde automatique.
 */
export function demarrer(): void {
  const g = globalThis as typeof globalThis & { __redacteurDemarre?: boolean };
  if (g.__redacteurDemarre) return;
  g.__redacteurDemarre = true;
  setTimeout(() => {
    try {
      const repris = remettreScansEnLecture();
      if (repris) console.log(`[démarrage] ${repris} courrier(s) scanné(s) remis en lecture`);
      const t = travauxInterrompus();
      for (const id of t.dossiers) lancerDossier(id);
      for (const c of t.courriers) lancerCourrier(c.id, c.dossierId);
      for (const id of t.signes) lancerSigne(id);
      sauvegardeAuto();
    } catch (err) {
      console.error("[démarrage]", err);
    }
    setInterval(sauvegardeAuto, 3 * 3600_000).unref();
  }, 1500).unref();
}
