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
  listReadySignes,
  updateCourrier,
  updateDossier,
  updateSigne,
} from "./db";
import { analyserDossierDemo, analyserSigneDemo, redigerDemo, retoucherDemo } from "./demo";
import { analyserDossierClaude, analyserSigneClaude, redigerClaude, retoucherClaude, type Block } from "./claude";
import { docxLogo, docxPied, fileKind, imageMime, readText } from "./extract";
import { FILES_DIR } from "./paths";
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
    const texte = kind === "image" ? "" : await readText(files.chemin, kind);
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

    if (!texte) {
      throw new Error(
        "En mode démo, Le rédacteur ne lit pas les photos ni les PDF scannés. Ajoutez votre clé Claude dans les Réglages, ou déposez ce courrier en Word ou en PDF contenant du texte.",
      );
    }
    updateSigne(id, { ...analyserSigneDemo(texte), pied, texte, status: "ready", error: null, demo: true });
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
    updateDossier(id, { status: "processing", step: "Analyse du dossier", error: null });
    let analyse: Analyse;
    let demo = false;
    if (hasClaude()) {
      const { blocks, notes } = await piecesBlocks(pieces);
      analyse = await analyserDossierClaude(blocks, choisirModeles("", dossier.signeId));
      analyse.pointsAVerifier.push(...notes);
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

/* ───────────── Rédaction ───────────── */

/** Les courriers signés les plus proches du courrier à rédiger servent d'exemples. */
function choisirModeles(typeReponse: string, miseEnPageId: string | null): Signe[] {
  const t = typeReponse.toLowerCase();
  return listReadySignes()
    .filter((s) => s.texte.trim())
    .map((s) => ({
      s,
      score:
        (t === "note" ? (s.genre === "note" ? 5 : 0) : s.genre === "courrier" ? 3 : 0) +
        (t && s.type.toLowerCase() === t ? 4 : 0) +
        (t && (s.type.toLowerCase().includes(t.split(" ")[0]) || t.includes(s.type.toLowerCase())) ? 1 : 0) +
        (s.id === miseEnPageId ? 2 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((x) => x.s);
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
    let redaction: Redaction;
    let demo = false;
    if (hasClaude()) {
      const { blocks, notes } = await piecesBlocks(pieces);
      redaction = await redigerClaude({
        genre: courrier.genre,
        pieces: blocks,
        analyse: dossier.analyse,
        consignes: dossier.consignes,
        ton: dossier.ton,
        pj,
        modeles: choisirModeles(courrier.genre === "note" ? "note" : (dossier.analyse?.typeReponse ?? ""), courrier.signeId),
        miseEnPage: { entete: courrier.entete, signature: courrier.signature, destinataire: courrier.destinataire },
        date: courrier.date ? dateLongue(courrier.date) : "",
      });
      redaction.remarques.push(...notes);
    } else {
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
      demo = true;
    }
    // Pour une note, la ligne « NOTE A … » posée à la création est conservée.
    if (courrier.genre === "note" && courrier.destinataire) redaction.destinataire = courrier.destinataire;
    updateCourrier(courrierId, { ...redactionVersCourrier(redaction), status: "ready", error: null, demo });
  } catch (err) {
    console.error("[processCourrier]", err);
    updateCourrier(courrierId, { status: "error", error: message(err) });
  }
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
    updateCourrier(courrier.id, { ...redactionVersCourrier(r), demo: false });
    return null;
  }
  const r = retoucherDemo(actuel, instruction);
  if (!r) {
    return "En mode démo, trois retouches sont possibles : « plus court », « ton plus ferme » et « ton plus courtois ». Ajoutez votre clé Claude dans les Réglages pour toutes les autres.";
  }
  updateCourrier(courrier.id, redactionVersCourrier(r));
  return null;
}
