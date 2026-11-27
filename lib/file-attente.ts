/**
 * File d'attente des traitements (lecture des courriers signés, analyse des dossiers, rédaction).
 * Deux traitements à la fois au plus : un dépôt de centaines de fichiers ne sature ni la mémoire ni le processeur.
 * Une même tâche (même clé) n'est jamais lancée deux fois en même temps, ni mise deux fois en attente.
 */
type Tache = () => Promise<void>;
type Etat = { attente: { cle: string; tache: Tache }[]; enCours: Set<string> };

const SIMULTANES = 2;
// Partagée entre les routes (chaque route peut charger sa propre copie des modules).
const g = globalThis as typeof globalThis & { __fileRedacteur?: Etat };
const etat: Etat = (g.__fileRedacteur ??= { attente: [], enCours: new Set() });

function suivante(): void {
  while (etat.enCours.size < SIMULTANES) {
    const i = etat.attente.findIndex((t) => !etat.enCours.has(t.cle));
    if (i < 0) return;
    const { cle, tache } = etat.attente.splice(i, 1)[0];
    etat.enCours.add(cle);
    tache()
      .catch((err) => console.error("[file]", cle, err))
      .finally(() => {
        etat.enCours.delete(cle);
        suivante();
      });
  }
}

/**
 * Met une tâche dans la file. Sans effet si la même tâche attend déjà son tour.
 * Une tâche prioritaire (dossier ouvert, rédaction demandée) passe devant les lectures de modèles.
 */
export function enFile(cle: string, tache: Tache, prioritaire = false): void {
  if (etat.attente.some((t) => t.cle === cle)) return;
  if (prioritaire) etat.attente.unshift({ cle, tache });
  else etat.attente.push({ cle, tache });
  suivante();
}

export function tachesEnAttente(): number {
  return etat.attente.length + etat.enCours.size;
}
