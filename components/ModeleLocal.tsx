"use client";
import { useCallback, useEffect, useState } from "react";
import { pontModele, texteTravail, type EtatTelechargement, type InfosModele } from "@/components/modele";

const go = (octets: number) => `${(octets / 1e9).toFixed(1).replace(".", ",")} Go`;

function duree(secondes: number): string {
  if (!Number.isFinite(secondes) || secondes <= 0) return "";
  if (secondes < 90) return "moins de 2 min";
  const min = Math.round(secondes / 60);
  if (min < 60) return `environ ${min} min`;
  const h = Math.floor(min / 60);
  return `environ ${h} h ${String(min % 60).padStart(2, "0")}`;
}

/** Paramètres : installation du modèle de rédaction (Ministral 3 8B) et suivi de son travail. */
export function ModeleLocal() {
  const [infos, setInfos] = useState<InfosModele | null>(null);
  const [dl, setDl] = useState<EtatTelechargement | null>(null);
  const [pont, setPont] = useState<ReturnType<typeof pontModele>>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    const r = await fetch("/api/modele").catch(() => null);
    if (r?.ok) setInfos((await r.json()) as InfosModele);
  }, []);

  useEffect(() => {
    charger();
    const p = pontModele();
    setPont(p);
    if (!p) return;
    p.etat().then(setDl);
    return p.surEtat((e) => {
      setDl(e);
      if (e.etat === "installe") charger();
    });
  }, [charger]);

  // Travail en cours : l'avancement est suivi ici aussi.
  useEffect(() => {
    if (!infos?.travail) return;
    const t = setTimeout(charger, 2000);
    return () => clearTimeout(t);
  }, [infos, charger]);

  async function supprimer() {
    setErreur(null);
    const r = await fetch("/api/modele", { method: "DELETE" });
    if (!r.ok) setErreur(((await r.json().catch(() => ({}))) as { error?: string }).error ?? "La suppression a échoué.");
    setConfirmer(false);
    await charger();
    if (pont) setDl(await pont.etat());
  }

  if (!infos) return null;
  const memoire = infos.memoire;
  const avertissement =
    memoire < 7.5e9
      ? `Cet ordinateur a ${go(memoire)} de mémoire : c'est trop peu pour le modèle, qui en demande au moins 8 Go.`
      : memoire < 12e9
        ? `Cet ordinateur a ${go(memoire)} de mémoire : le modèle fonctionnera, mais lentement (16 Go conseillés).`
        : null;

  if (infos.installe) {
    return (
      <section className="card panel" id="modele">
        <h2 className="panel-head vert">Rédaction sur l&apos;ordinateur</h2>
        <p className="small muted">
          Le modèle de rédaction <strong>{infos.nom}</strong> est installé. Les analyses de dossiers, les projets et les
          retouches sont préparés sur cet ordinateur, sans Internet. Comptez quelques minutes par projet.
        </p>
        {avertissement && <div className="info-box">{avertissement}</div>}
        {infos.travail && (
          <div className="upload-strip">
            <span>
              {infos.travail.libelle} : {texteTravail(infos.travail)}
            </span>
            <div className="progress">
              <div style={{ width: `${infos.travail.progression}%` }} />
            </div>
          </div>
        )}
        {infos.dernierEchec && !infos.travail && (
          <div className="error-box">Dernier essai du modèle : {infos.dernierEchec}</div>
        )}
        {erreur && <div className="error-box">{erreur}</div>}
        <div className="toolbar">
          {confirmer ? (
            <>
              <span className="small">Supprimer le modèle ({go(infos.taille)}) ? Il faudra le télécharger de nouveau.</span>
              <button className="btn btn-sm" onClick={supprimer}>
                Supprimer
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmer(false)}>
                Annuler
              </button>
            </>
          ) : (
            <button className="btn btn-ghost btn-sm" onClick={() => setConfirmer(true)}>
              Supprimer le modèle
            </button>
          )}
        </div>
      </section>
    );
  }

  const etat = dl?.etat ?? "absent";
  const pourcent = dl && dl.total ? Math.floor((dl.recu / dl.total) * 100) : 0;
  const reste = dl && dl.debit ? duree((dl.total - dl.recu) / dl.debit) : "";

  return (
    <section className="card panel" id="modele">
      <h2 className="panel-head vert">Rédaction sur l&apos;ordinateur</h2>
      <p className="small muted">
        Pour des projets rédigés comme vos courriers, installez le modèle de rédaction <strong>{infos.nom}</strong> (
        {go(infos.taille)}). Il est téléchargé une seule fois ; ensuite tout se fait sur cet ordinateur, sans Internet. En
        attendant, Le rédacteur assemble les projets à partir de vos consignes et des formules de vos courriers signés.
      </p>
      {avertissement && <div className="info-box">{avertissement}</div>}

      {!pont ? (
        <p className="small muted">Le téléchargement du modèle se fait depuis l&apos;appli de bureau.</p>
      ) : etat === "telechargement" || etat === "verification" || etat === "copie" ? (
        <>
          <div className="upload-strip">
            <span>
              {etat === "telechargement"
                ? `Téléchargement : ${go(dl!.recu)} sur ${go(dl!.total)}${dl!.debit ? ` · ${(dl!.debit / 1e6).toFixed(1).replace(".", ",")} Mo/s` : ""}${reste ? ` · ${reste}` : ""}`
                : etat === "copie"
                  ? `Copie et vérification du fichier : ${pourcent} %`
                  : `Vérification du fichier : ${pourcent} %`}
            </span>
            <div className="progress">
              <div style={{ width: `${pourcent}%` }} />
            </div>
          </div>
          {etat === "telechargement" && dl?.erreur && <div className="info-box">Connexion : {dl.erreur}.</div>}
          {etat === "telechargement" && (
            <p className="small muted">
              Vous pouvez continuer à travailler, ou fermer Le rédacteur : le téléchargement reprendra là où il s&apos;est
              arrêté.
            </p>
          )}
          <div className="toolbar">
            {etat === "telechargement" && (
              <button className="btn btn-sm" onClick={() => pont.pause().then(setDl)}>
                Mettre en pause
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          {etat === "erreur" && (
            <div className="error-box">
              Le téléchargement a échoué : {dl?.erreur}. Vérifiez la connexion à Internet, puis reprenez : il repart là où il
              s&apos;était arrêté.
            </div>
          )}
          {etat === "pause" && (
            <p className="small">
              Téléchargement interrompu à {go(dl!.recu)} sur {go(dl!.total)} ({pourcent} %).
            </p>
          )}
          <div className="toolbar">
            <button className="btn btn-primary btn-sm" onClick={() => pont.telecharger().then(setDl)}>
              {etat === "pause" || (etat === "erreur" && dl!.recu > 0)
                ? "Reprendre le téléchargement"
                : `Télécharger le modèle (${go(infos.taille)})`}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => pont.importer().then(setDl)}>
              J&apos;ai déjà le fichier
            </button>
          </div>
          <p className="small muted">
            « J&apos;ai déjà le fichier » : choisissez le fichier {"Ministral-3-8B-Instruct-2512-Q4_K_M.gguf"} copié par exemple
            depuis une clé USB.
          </p>
        </>
      )}
    </section>
  );
}
