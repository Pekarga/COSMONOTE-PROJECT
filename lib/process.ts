import fs from "node:fs/promises";
import path from "node:path";
import { hasClaude } from "./config";
import {
  defaultSigne,
  getCourrier,
  getDossier,
  getSigne,
  getSigneFiles,
  listPiecesWithPath,
  modelesProches,
  piecesEnAttente,
  updateCourrier,
  updateDossier,
  updateSigne,
} from "./db";
import { analyserDossierDemo, analyserSigneDemo, redigerDemo, retoucherDemo } from "./demo";
import { analyserDossierClaude, analyserSigneClaude, redigerClaude, retoucherClaude, type Block } from "./claude";
import { docxLogo, docxPied, fileKind, imageMime, readText } from "./extract";
import { enFile } from "./file-attente";
import { readOcr, sansTexte } from "./files";
import { analyserDossierLocal, redigerLocal, retoucherLocal, type PieceTexte } from "./local";
import { modeleDisponible, type Travail } from "./modele";
import { FILES_DIR } from "./paths";
import { REGLES_RELECTURE, bilan, consigneSecondePasse, enRemarques, nettoyerCourrier, relireCourrier } from "./relecture";
import { dateLongue, miseEnPage } from "./style";
import type { Analyse, Courrier, Genre, Piece, Redaction, Signe } from "./types";

const MAX_ENVOI = 24 * 1024 * 1024; // marge sous la limite de 32 Mo d'une requête

function message(err: unknown) {
  return err instanceof Error ? err.message : "Erreur inconnue";
}

/* ───────────── Courriers signés ───────────── */

export async function processSigne(id: string): Promise<void> {
  try {
    const signe = getSigne(id);
    const files = getSigneFiles(id);
    if (!signe || !files?.chemin) return;
    const kind = fileKind(signe.nomFichier, signe.mime);
    if (!kind) throw new Error("Format non pris en charge.");
    let texte = kind === "image" ? "" : await readText(files.chemin, kind);
    // Scan ou photo : texte lu sur l'ordinateur par reconnaissance de caractères, s'il existe.
    let parOcr = false;
    if (sansTexte(texte)) {
      const lu = await readOcr(files.chemin);
      if (lu) {
        texte = lu;
        parOcr = true;
      }
    }
    const pied = kind === "docx" ? await docxPied(files.chemin) : "";

    if (kind === "docx") {
      const logo = await docxLogo(files.chemin);
      if (logo) {
        const dir = path.join(FILES_DIR, "images");
        await fs.mkdir(dir, { recursive: true });
        const p = path.join(dir, `${id}-logo${logo.ext}`);
        await fs.writeFile(p, logo.data);
        updateSigne(id, { logo: p });
      }
    }

    if (hasClaude()) {
      const texteConnu = texte.length > 200;
      const source: Block[] = [];
      if (kind === "pdf") {
        const data = (await fs.readFile(files.chemin)).toString("base64");
        source.push({ type: "document", title: signe.nomFichier, source: { type: "base64", media_type: "application/pdf", data } });
      } else if (kind === "image") {
        const data = (await fs.readFile(files.chemin)).toString("base64");
        source.push({ type: "image", source: { type: "base64", media_type: imageMime(signe.nomFichier, signe.mime), data } });
      } else {
        if (!texte) throw new Error("Ce fichier ne contient pas de texte lisible.");
        source.push({ type: "document", title: signe.nomFichier, source: { type: "text", media_type: "text/plain", data: texte } });
      }
      if (pied) source.push({ type: "text", text: `Pied de page du document Word :\n${pied}` });
      const lu = await analyserSigneClaude(source, texteConnu);
      updateSigne(id, {
        ...lu,
        pied: lu.pied || pied,
        texte: texteConnu ? texte : (lu.texte ?? texte),
        status: "ready",
        error: null,
        demo: false,
      });
      return;
    }

    if (sansTexte(texte)) {
      // Scan ou photo : le texte est lu par l'appli sur l'ordinateur, puis le courrier revient ici.
      if (kind === "pdf" || kind === "image") {
        updateSigne(id, { status: "a_lire", error: null });
        return;
      }
      throw new Error("Ce fichier ne contient pas de texte lisible.");
    }
    const lu = analyserSigneDemo(texte);
    if (parOcr) {
      lu.resume = [
        lu.resume,
        "Texte lu sur le scan : vérifiez l'en-tête et les formules dans « Réglages du modèle ».",
      ]
        .filter(Boolean)
        .join(" ");
    }
    updateSigne(id, { ...lu, pied, texte, status: "ready", error: null, demo: true });
  } catch (err) {
    console.error("[processSigne]", err);
    updateSigne(id, { status: "error", error: message(err) });
  }
}

/* ───────────── Pièces envoyées à Claude ───────────── */

const ROLE_LABEL = { dossier: "pièce du dossier imputé", justificatif: "pièce justificative" };

async function piecesBlocks(pieces: (Piece & { chemin: string })[]): Promise<{ blocks: Block[]; notes: string[] }> {
  const blocks: Block[] = [];
  const notes: string[] = [];
  let total = 0;
  for (const [i, p] of pieces.entries()) {
    const kind = fileKind(p.nom, p.mime);
    blocks.push({ type: "text", text: `Pièce n° ${i + 1} (${ROLE_LABEL[p.role]}) : ${p.nom}` });
    const binaire = kind === "pdf" || kind === "image";
    if (binaire && total + p.taille * 1.37 < MAX_ENVOI) {
      const data = (await fs.readFile(p.chemin)).toString("base64");
      total += data.length;
      blocks.push(
        kind === "pdf"
          ? { type: "document", title: p.nom, source: { type: "base64", media_type: "application/pdf", data } }
          : { type: "image", source: { type: "base64", media_type: imageMime(p.nom, p.mime), data } },
      );
    } else if (p.texte.trim()) {
      total += p.texte.length;
      blocks.push({ type: "document", title: p.nom, source: { type: "text", media_type: "text/plain", data: p.texte } });
      if (binaire) notes.push(`« ${p.nom} » est volumineux : seul son texte a été transmis, sans les images.`);
    } else {
      blocks.push({ type: "text", text: "(pièce trop volumineuse ou sans texte lisible : non transmise)" });
      notes.push(`« ${p.nom} » n'a pas pu être transmise (trop volumineuse ou sans texte).`);
    }
  }
  return { blocks, notes };
}

/* ───────────── Dossiers ───────────── */

function titreDepuisAnalyse(a: Analyse): string {
  // « A / Monsieur le Directeur / du … (CROU-B) » : on garde le sigle, sinon l'organisme.
  const lignes = a.demandeur.split("\n").map((l) => l.trim()).filter((l) => l && !/^(NOTE\s+)?A$/i.test(l) && !/^(?:[A-ZÀ-Ý] ){2,}[A-ZÀ-Ý]$/.test(l));
  const organisme = lignes.find((l) => /^(du|de la|de l'|des)\s*/i.test(l)) ?? lignes[0] ?? "";
  const qui = organisme.match(/\(([^)]+)\)\s*$/)?.[1] ?? organisme.replace(/^(du|de la|de l'|des)\s*/i, "");
  const quoi = (a.objetCourrier || a.objetReponse).trim();
  return [quoi, qui].filter(Boolean).join(" – ").slice(0, 120);
}

export async function processDossier(id: string): Promise<void> {
  try {
    const dossier = getDossier(id);
    if (!dossier) return;
    const pieces = listPiecesWithPath(id);
    if (!pieces.length) {
      updateDossier(id, { status: "vide", step: null, error: null });
      return;
    }
    const attente = piecesEnAttente(id);
    if (attente) {
      // L'analyse reprend quand l'appli a lu le texte des scans du dossier.
      updateDossier(id, {
        status: "processing",
        step: `Lecture ${attente > 1 ? `des ${attente} scans` : "du scan"} sur cet ordinateur`,
        error: null,
      });
      return;
    }
    updateDossier(id, { status: "processing", step: "Analyse du dossier", error: null });
    let analyse: Analyse | null = null;
    let demo = false;
    if (hasClaude()) {
      const { blocks, notes } = await piecesBlocks(pieces);
      analyse = await analyserDossierClaude(blocks, choisirModeles("", dossier.signeId));
      analyse.pointsAVerifier.push(...notes);
    } else if (modeleDisponible()) {
      try {
        analyse = await analyserDossierLocal(`dossier:${id}`, piecesTexte(pieces), choisirModeles("", dossier.signeId), (t) =>
          updateDossier(id, { step: etapeModele(t) }),
        );
      } catch (err) {
        console.error("[processDossier] modèle", err);
        analyse = analyserDossierDemo(pieces);
        analyse.pointsAVerifier.unshift(`Le modèle de rédaction n'a pas pu analyser le dossier (${message(err)}) : analyse sommaire, à compléter.`);
        demo = true;
      }
    } else {
      analyse = analyserDossierDemo(pieces);
      demo = true;
    }
    const titreAuto = /^Dossier du /.test(dossier.titre);
    updateDossier(id, {
      analyse,
      demo,
      titre: titreAuto && titreDepuisAnalyse(analyse) ? titreDepuisAnalyse(analyse) : dossier.titre,
      status: "ready",
      step: null,
      error: null,
    });
  } catch (err) {
    console.error("[processDossier]", err);
    updateDossier(id, { status: "error", step: null, error: message(err) });
  }
}

/** Texte d'avancement d'un travail du modèle, affiché dans le dossier. */
function etapeModele(t: Travail): string {
  if (t.phase === "demarrage") return `${t.libelle} : démarrage du modèle sur l'ordinateur`;
  return `${t.libelle} sur l'ordinateur : ${t.progression} %`;
}

function piecesTexte(pieces: Piece[]): PieceTexte[] {
  return pieces.map((p) => ({ nom: p.nom, role: p.role, texte: p.texte }));
}

/* ───────────── Rédaction ───────────── */

/** Les courriers signés les plus proches du courrier à rédiger servent d'exemples. */
function choisirModeles(typeReponse: string, miseEnPageId: string | null): Signe[] {
  const note = typeReponse.toLowerCase() === "note";
  return modelesProches(note ? "note" : "courrier", note ? "" : typeReponse, miseEnPageId);
}

/* ───────────── Lancement des traitements (file d'attente) ───────────── */

/** Lecture d'un courrier signé : en file, deux à la fois, après les dossiers et les rédactions. */
export function lancerSigne(id: string): void {
  enFile(`signe:${id}`, () => processSigne(id));
}

export function lancerDossier(id: string): void {
  enFile(`dossier:${id}`, () => processDossier(id), true);
}

export function lancerCourrier(courrierId: string, dossierId: string): void {
  enFile(`courrier:${courrierId}`, () => processCourrier(courrierId, dossierId), true);
}

function sansExtension(nom: string) {
  return nom.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").trim();
}

export function redactionVersCourrier(r: Redaction): Partial<Courrier> {
  return {
    objet: r.objet,
    vref: r.vref,
    destinataire: r.destinataire,
    appel: r.appel,
    corps: r.corps.map((p) => p.trim()).filter(Boolean).join("\n\n"),
    politesse: r.politesse,
    pj: r.pj.join("\n"),
    ampliation: r.ampliation.join("\n"),
    remarques: r.remarques,
  };
}

export function courrierVersRedaction(c: Courrier): Redaction {
  return {
    objet: c.objet,
    vref: c.vref,
    destinataire: c.destinataire,
    appel: c.appel,
    corps: c.corps.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean),
    politesse: c.politesse,
    pj: c.pj.split("\n").map((p) => p.trim()).filter(Boolean),
    ampliation: c.ampliation.split("\n").map((p) => p.trim()).filter(Boolean),
    remarques: c.remarques,
  };
}

/** Mise en page : le courrier signé choisi s'il est du bon genre (courrier ou note), sinon celui par défaut de ce genre. */
export function layoutPour(signeId: string | null, genre: Genre) {
  const choisi = signeId ? getSigne(signeId) : null;
  const signe = choisi && choisi.status === "ready" && choisi.genre === genre ? choisi : defaultSigne(genre);
  return { signe, layout: miseEnPage(signe) };
}

export async function processCourrier(courrierId: string, dossierId: string): Promise<void> {
  try {
    const dossier = getDossier(dossierId);
    const courrier = getCourrier(courrierId);
    if (!dossier || !courrier) return;
    const pieces = listPiecesWithPath(dossierId);
    const pj = pieces.filter((p) => p.role === "justificatif" && p.joindre).map((p) => sansExtension(p.nom));
    const signe = courrier.signeId ? getSigne(courrier.signeId) : null;
    let redaction: Redaction | null = null;
    let demo = false;
    let echecModele: string | null = null;
    const modeles = () => choisirModeles(courrier.genre === "note" ? "note" : (dossier.analyse?.typeReponse ?? ""), courrier.signeId);
    const demande = {
      genre: courrier.genre,
      analyse: dossier.analyse,
      consignes: dossier.consignes,
      ton: dossier.ton,
      pj,
      miseEnPage: { entete: courrier.entete, signature: courrier.signature, destinataire: courrier.destinataire },
      date: courrier.date ? dateLongue(courrier.date) : "",
    };
    if (hasClaude()) {
      const { blocks, notes } = await piecesBlocks(pieces);
      redaction = await redigerClaude({ ...demande, modeles: modeles(), pieces: blocks });
      redaction.remarques.push(...notes);
    } else if (modeleDisponible()) {
      try {
        redaction = await redigerLocal(`courrier:${courrierId}`, { ...demande, modeles: modeles(), pieces: piecesTexte(pieces) });
      } catch (err) {
        console.error("[processCourrier] modèle", err);
        echecModele = message(err);
      }
    }
    if (!redaction) {
      redaction = redigerDemo({
        genre: courrier.genre,
        analyse: dossier.analyse,
        consignes: dossier.consignes,
        ton: dossier.ton,
        modele: signe
          ? {
              genre: signe.genre,
              appel: signe.appel,
              politesse: signe.politesse,
              destinataire: signe.destinataire,
              ampliation: signe.ampliation,
            }
          : null,
        pj,
      });
      if (echecModele) redaction.remarques.unshift(`Le modèle de rédaction n'a pas pu rédiger ce projet (${echecModele}).`);
      else if (!hasClaude()) {
        redaction.remarques.push("Pour des projets entièrement rédigés, installez le modèle de rédaction dans Paramètres (une seule fois, 5,2 Go).");
      }
      demo = true;
    }
    redaction = await relireProjet(redaction, !demo ? modeles() : null, `courrier:${courrierId}`);
    // Pour une note, la ligne « NOTE A … » posée à la création est conservée.
    if (courrier.genre === "note" && courrier.destinataire) redaction.destinataire = courrier.destinataire;
    updateCourrier(courrierId, { ...redactionVersCourrier(redaction), status: "ready", error: null, demo });
  } catch (err) {
    console.error("[processCourrier]", err);
    updateCourrier(courrierId, { status: "error", error: message(err) });
  }
}

/** Remarques ajoutées par une relecture précédente : on les remplace à chaque nouvelle relecture. */
const TITRES_RELECTURE = REGLES_RELECTURE.map((r) => `${r.titre} : `);

/**
 * Relecture du projet : corrections sûres (guillemets, tirets, formules de remplissage), puis repérage
 * des tournures qui sonnent « texte généré ». Avec une clé Claude, une seconde passe les corrige.
 */
async function relireProjet(r: Redaction, secondePasse: Signe[] | null, cle = ""): Promise<Redaction> {
  const remarques = r.remarques.filter((x) => !TITRES_RELECTURE.some((t) => x.startsWith(t)));
  let propre = nettoyerCourrier(r);
  let constats = relireCourrier(propre);
  if (secondePasse && bilan(constats).aCorriger > 0) {
    try {
      const instruction = `Relis ce projet et corrige ce qui trahit encore une rédaction par IA. Garde les références, les dates, les montants, le destinataire et le sens ; n'ajoute aucun fait ; ne touche pas aux formules tirées des courriers signés.\n\n${consigneSecondePasse(propre, constats)}`;
      const revu = hasClaude()
        ? await retoucherClaude({ courrier: propre, instruction, modeles: secondePasse })
        : await retoucherLocal(cle, { courrier: propre, instruction, modeles: secondePasse, libelle: "Relecture du projet" });
      propre = nettoyerCourrier(revu);
      constats = relireCourrier(propre);
    } catch (err) {
      // La seconde passe est un plus : en cas d'échec, on garde le premier projet.
      console.error("[relireProjet]", err);
    }
  }
  return { ...propre, remarques: [...remarques, ...enRemarques(constats)] };
}

/** Retouche demandée par l'agent. Renvoie un message si la retouche est impossible. */
export async function retoucher(courrier: Courrier, instruction: string): Promise<string | null> {
  const actuel = courrierVersRedaction(courrier);
  if (hasClaude()) {
    const dossier = courrier.dossierId ? getDossier(courrier.dossierId) : null;
    const r = await retoucherClaude({
      courrier: actuel,
      instruction,
      modeles: choisirModeles(dossier?.analyse?.typeReponse ?? "", courrier.signeId),
    });
    updateCourrier(courrier.id, { ...redactionVersCourrier(await relireProjet(r, null)), demo: false });
    return null;
  }
  if (modeleDisponible()) {
    const dossier = courrier.dossierId ? getDossier(courrier.dossierId) : null;
    const r = await retoucherLocal(`retouche:${courrier.id}`, {
      courrier: actuel,
      instruction,
      modeles: choisirModeles(courrier.genre === "note" ? "note" : (dossier?.analyse?.typeReponse ?? ""), courrier.signeId),
    });
    updateCourrier(courrier.id, { ...redactionVersCourrier(await relireProjet(r, null)), demo: false });
    return null;
  }
  const r = retoucherDemo(actuel, instruction);
  if (!r) {
    return "Retouches automatiques possibles : « plus court », « ton plus ferme » et « ton plus courtois ». Pour toute autre modification, corrigez le texte directement dans le courrier.";
  }
  updateCourrier(courrier.id, redactionVersCourrier(await relireProjet(r, null)));
  return null;
}
