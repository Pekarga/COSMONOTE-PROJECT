"use client";
import { useEffect, useState } from "react";
import type { ALire } from "@/lib/types";
import { lireFichier, ouvrirLecteur, type Lecteur } from "./ocr";

/** À envoyer après un dépôt : le lecteur regarde tout de suite s'il y a des scans à lire. */
export const SCANS_A_LIRE = "redacteur:scans-a-lire";
/** Envoyé après chaque scan lu : les pages ouvertes se mettent à jour. */
export const SCAN_LU = "redacteur:scan-lu";

export function signalerScans(): void {
  window.dispatchEvent(new Event(SCANS_A_LIRE));
}

const VERIFICATION = 20_000;
/** Le lecteur (environ 100 Mo de mémoire) est fermé après une minute sans scan à lire. */
const REPOS = 60_000;

const court = (nom: string) => (nom.length > 42 ? `${nom.slice(0, 39)}…` : nom);

/**
 * Lit en arrière-plan, sur l'ordinateur, le texte des scans et des photos déposés (modèles et pièces des
 * dossiers), un par un, sans bloquer l'appli. Reprend tout seul après une fermeture de l'appli, puisque
 * la liste des scans à lire est gardée dans la base. Renvoie le message de progression, ou null.
 */
export function useLecteurScans(actif: boolean): string | null {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!actif) return;
    let arret = false;
    let enCours = false;
    let encore = false;
    let lecteur: Lecteur | null = null;
    let fermeture: ReturnType<typeof setTimeout> | null = null;
    const ignores = new Set<string>();

    const fermer = () => {
      lecteur?.terminate().catch(() => {});
      lecteur = null;
    };

    async function lire(item: ALire, etat: (page: string) => void): Promise<string> {
      const res = await fetch(item.genre === "signe" ? `/api/signes/${item.id}/fichier` : `/api/pieces/${item.id}`);
      if (!res.ok) throw new Error(`fichier introuvable (${res.status})`);
      const blob = await res.blob();
      const fichier = new File([blob], item.nom, { type: blob.type });
      // Deux essais : si le lecteur s'est arrêté en route, on en ouvre un neuf.
      for (let essai = 1; ; essai++) {
        try {
          lecteur ??= await ouvrirLecteur();
          return await lireFichier(fichier, lecteur, etat);
        } catch (err) {
          fermer();
          if (essai >= 2) throw err;
        }
      }
    }

    async function tour(): Promise<void> {
      if (enCours) {
        encore = true;
        return;
      }
      enCours = true;
      let faits = 0;
      try {
        while (!arret) {
          const r = (await fetch("/api/lecture").then((x) => x.json())) as { items: ALire[]; total: number };
          const items = r.items.filter((i) => !ignores.has(`${i.genre}:${i.id}`));
          if (!items.length) break;
          if (fermeture) clearTimeout(fermeture);
          fermeture = null;
          const debut = faits;
          for (const [k, item] of items.entries()) {
            if (arret) return;
            const titre = `Lecture des scans : ${debut + k + 1} sur ${debut + r.total} · « ${court(item.nom)} »`;
            setMessage(titre);
            let texte = "";
            try {
              texte = await lire(item, (page) => setMessage(page ? `${titre}, ${page}` : titre));
            } catch (err) {
              console.warn("[lecture]", item.nom, err);
            }
            const envoi = await fetch(`/api/lecture/${item.genre}/${item.id}`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(texte ? { texte } : { echec: true }),
            }).catch(() => null);
            if (!envoi?.ok) ignores.add(`${item.genre}:${item.id}`);
            faits++;
            window.dispatchEvent(new Event(SCAN_LU));
          }
        }
      } catch (err) {
        console.warn("[lecture]", err);
      } finally {
        enCours = false;
        setMessage(null);
        if (lecteur && !fermeture) fermeture = setTimeout(fermer, REPOS);
        if (encore && !arret) {
          encore = false;
          void tour();
        } else if (faits && !arret) {
          // Après une série, on revérifie vite : un dépôt a pu arriver pendant la dernière lecture.
          setTimeout(declencher, 2000);
        }
      }
    }

    const declencher = () => void tour();
    window.addEventListener(SCANS_A_LIRE, declencher);
    const minuterie = setInterval(declencher, VERIFICATION);
    const premier = setTimeout(declencher, 1500);
    return () => {
      arret = true;
      window.removeEventListener(SCANS_A_LIRE, declencher);
      clearInterval(minuterie);
      clearTimeout(premier);
      if (fermeture) clearTimeout(fermeture);
      fermer();
    };
  }, [actif]);

  return message;
}
