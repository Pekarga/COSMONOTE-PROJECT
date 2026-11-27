import type { Travail } from "@/lib/modele";

/** Avancement d'un travail du modèle de rédaction, en quelques mots. */
export function texteTravail(t: Travail): string {
  if (t.phase === "demarrage") return "démarrage du modèle sur l'ordinateur…";
  if (t.phase === "lecture") return `lecture du dossier et des modèles (${t.progression} %)`;
  return `écriture (${t.progression} %)`;
}

export type InfosModele = {
  nom: string;
  taille: number;
  installe: boolean;
  chemin: string | null;
  dossier: string;
  memoire: number;
  actif: boolean;
  travail: Travail | null;
  dernierEchec: string | null;
};

/** Pont avec l'appli de bureau (desktop/preload.cjs) pour télécharger le modèle. */
export type EtatTelechargement = {
  etat: "absent" | "pause" | "telechargement" | "verification" | "copie" | "installe" | "erreur";
  recu: number;
  total: number;
  /** Octets par seconde. */
  debit: number;
  erreur: string | null;
};
export type PontModele = {
  etat: () => Promise<EtatTelechargement>;
  telecharger: () => Promise<EtatTelechargement>;
  pause: () => Promise<EtatTelechargement>;
  importer: () => Promise<EtatTelechargement>;
  surEtat: (rappel: (e: EtatTelechargement) => void) => () => void;
};

export function pontModele(): PontModele | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { redacteur?: { modele?: PontModele } }).redacteur?.modele ?? null;
}
