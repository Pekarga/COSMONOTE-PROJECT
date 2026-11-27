/**
 * Modèle de langue installé sur l'ordinateur (Ministral 3 8B, 5,2 Go), servi par llama.cpp (llama-server).
 * Le fichier est téléchargé une seule fois depuis les Paramètres (par l'appli de bureau) ; ensuite tout se fait
 * sans Internet. Le serveur du modèle démarre à la première demande et s'arrête après dix minutes sans travail,
 * pour rendre la mémoire.
 */
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { DATA_DIR } from "./paths";

export const MODELE = {
  nom: "Ministral 3 8B",
  fichier: "Ministral-3-8B-Instruct-2512-Q4_K_M.gguf",
  // MODELE_TAILLE ne sert qu'aux essais (fichier de remplacement).
  taille: Number(process.env.MODELE_TAILLE) || 5198386720,
};

/** Fenêtre de contexte (en jetons) : consignes, exemples, pièces et réponse doivent y tenir. */
export const CONTEXTE = 8192;
/** Estimation prudente : un jeton pour trois caractères de français. */
export const CARACTERES_PAR_JETON = 3;
const ARRET_APRES = 10 * 60_000;
const DEMARRAGE_MAX = 5 * 60_000;

export const MODELES_DIR = process.env.MODELES_DIR || path.join(DATA_DIR, "modeles");
const PID = path.join(MODELES_DIR, "llama.pid");

/** Chemin du modèle s'il est installé et vérifié (le fichier .ok est écrit après contrôle de l'empreinte). */
export function cheminModele(): string | null {
  if (process.env.MODELE_GGUF) return fs.existsSync(process.env.MODELE_GGUF) ? process.env.MODELE_GGUF : null;
  const p = path.join(MODELES_DIR, MODELE.fichier);
  try {
    if (fs.statSync(p).size === MODELE.taille && fs.existsSync(`${p}.ok`)) return p;
  } catch {}
  return null;
}

/** Vrai si la rédaction peut passer par le modèle installé sur l'ordinateur. */
export function modeleDisponible(): boolean {
  return Boolean(process.env.LLAMA_URL) || (cheminModele() !== null && Boolean(binaire()));
}

function binaire(): string | null {
  const b = process.env.LLAMA_SERVER;
  if (b) return fs.existsSync(b) ? b : null;
  // Développement : llama-server dans le PATH.
  return "llama-server";
}

export type Travail = {
  /** Ce qui est traité, par exemple « courrier:… » ou « dossier:… ». */
  cle: string;
  libelle: string;
  phase: "demarrage" | "lecture" | "ecriture";
  /** De 0 à 100. */
  progression: number;
  debut: number;
};

type Etat = {
  proc: ChildProcess | null;
  url: string | null;
  demarrage: Promise<string> | null;
  minuterie: NodeJS.Timeout | null;
  file: Promise<unknown>;
  travail: Travail | null;
  journal: string[];
  dernierEchec: string | null;
};
const g = globalThis as typeof globalThis & { __modeleLocal?: Etat };
const etat: Etat = (g.__modeleLocal ??= {
  proc: null,
  url: null,
  demarrage: null,
  minuterie: null,
  file: Promise.resolve(),
  travail: null,
  journal: [],
  dernierEchec: null,
});

export function travailEnCours(): Travail | null {
  return etat.travail;
}

export function infosModele() {
  const chemin = cheminModele();
  return {
    nom: MODELE.nom,
    taille: MODELE.taille,
    installe: modeleDisponible(),
    chemin,
    dossier: MODELES_DIR,
    memoire: os.totalmem(),
    actif: Boolean(etat.url),
    travail: etat.travail,
    dernierEchec: etat.dernierEchec,
  };
}

function portLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as net.AddressInfo;
      s.close(() => resolve(port));
    });
  });
}

function sante(url: string): Promise<number> {
  return new Promise((resolve) => {
    const req = http.get(`${url}/health`, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on("error", () => resolve(0));
    req.setTimeout(3000, () => req.destroy());
  });
}

function noter(ligne: string) {
  etat.journal.push(ligne);
  if (etat.journal.length > 60) etat.journal.splice(0, etat.journal.length - 60);
}

async function lancer(): Promise<string> {
  if (process.env.LLAMA_URL) return process.env.LLAMA_URL;
  const chemin = cheminModele();
  const exe = binaire();
  if (!chemin || !exe) throw new Error("Le modèle de rédaction n'est pas installé.");
  const port = await portLibre();
  // Lecture des consignes (calcul) sur tous les cœurs logiques ; écriture sur les cœurs physiques (réglage par défaut).
  const lecture = String(Math.max(1, os.cpus().length));
  const args = ["-m", chemin, "--host", "127.0.0.1", "--port", String(port), "-c", String(CONTEXTE), "-np", "1", "-tb", lecture, "--jinja", "--no-webui"];
  etat.journal = [];
  const debut = Date.now();
  const proc = spawn(exe, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  etat.proc = proc;
  try {
    fs.mkdirSync(MODELES_DIR, { recursive: true });
    if (proc.pid) fs.writeFileSync(PID, String(proc.pid));
  } catch {}
  let sortie: string | null = null;
  const lire = (d: Buffer) => {
    for (const l of String(d).split(/\r?\n/)) if (l.trim()) noter(l);
  };
  proc.stdout?.on("data", lire);
  proc.stderr?.on("data", lire);
  proc.on("error", (err) => {
    sortie = String(err);
    noter(`lancement impossible : ${err}`);
  });
  proc.on("exit", (code) => {
    sortie ??= `arrêt, code ${code}`;
    if (etat.proc === proc) {
      etat.proc = null;
      etat.url = null;
    }
    try {
      fs.rmSync(PID, { force: true });
    } catch {}
    console.log(`[modèle] serveur arrêté (code ${code})`);
  });
  const url = `http://127.0.0.1:${port}`;
  while (Date.now() - debut < DEMARRAGE_MAX) {
    if (sortie) break;
    if ((await sante(url)) === 200) {
      // Quelques lignes utiles pour comprendre une lenteur : version, processeur, fils de calcul.
      const infos = etat.journal.filter((l) => /build|system_info|n_threads|CPU :|model type|model size/i.test(l)).slice(0, 8);
      console.log(`[modèle] prêt en ${Math.round((Date.now() - debut) / 1000)} s\n${infos.join("\n")}`);
      return url;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  proc.kill();
  const detail = etat.journal.filter((l) => /error|erreur|failed|invalid|unable|out of memory/i.test(l)).slice(-3).join(" | ");
  console.error("[modèle] démarrage impossible\n" + etat.journal.slice(-25).join("\n"));
  throw new Error(`Le modèle de rédaction n'a pas pu démarrer${detail ? ` (${detail})` : ""}.`);
}

async function serveur(): Promise<string> {
  if (etat.url && (etat.proc || process.env.LLAMA_URL)) return etat.url;
  etat.demarrage ??= lancer().finally(() => {
    etat.demarrage = null;
  });
  etat.url = await etat.demarrage;
  return etat.url;
}

/** Arrête le serveur du modèle (fin d'inactivité, suppression du modèle, fermeture de l'appli). */
export function arreterModele(): void {
  if (etat.minuterie) clearTimeout(etat.minuterie);
  etat.minuterie = null;
  if (etat.proc) etat.proc.kill();
  etat.proc = null;
  etat.url = null;
}

function planifierArret() {
  if (etat.minuterie) clearTimeout(etat.minuterie);
  etat.minuterie = setTimeout(() => {
    if (!etat.travail) arreterModele();
  }, ARRET_APRES);
  etat.minuterie.unref();
}

/** Supprime le modèle de l'ordinateur (5 Go libérés). */
export function supprimerModele(): void {
  arreterModele();
  const p = path.join(MODELES_DIR, MODELE.fichier);
  for (const f of [p, `${p}.ok`, `${p}.part`]) fs.rmSync(f, { force: true });
}

type Message = { role: "system" | "user"; content: string };

/** Une demande au serveur du modèle, en flux, pour suivre l'avancement. */
function completer(
  url: string,
  corps: Record<string, unknown>,
  surJeton: (n: number) => void,
  surLecture: (fait: number, total: number) => void,
): Promise<{ texte: string; fin: string | null; jetons: number }> {
  return new Promise((resolve, reject) => {
    const donnees = Buffer.from(JSON.stringify(corps));
    const req = http.request(
      `${url}/v1/chat/completions`,
      { method: "POST", headers: { "Content-Type": "application/json", "Content-Length": donnees.length } },
      (res) => {
        let tampon = "";
        let texte = "";
        let fin: string | null = null;
        let jetons = 0;
        let erreur = "";
        res.setEncoding("utf8");
        res.on("data", (morceau: string) => {
          if (res.statusCode !== 200) {
            erreur += morceau;
            return;
          }
          tampon += morceau;
          let i: number;
          while ((i = tampon.indexOf("\n")) >= 0) {
            const ligne = tampon.slice(0, i).trim();
            tampon = tampon.slice(i + 1);
            if (!ligne.startsWith("data:")) continue;
            const json = ligne.slice(5).trim();
            if (json === "[DONE]") continue;
            try {
              const d = JSON.parse(json) as {
                choices?: { delta?: { content?: string | null }; finish_reason?: string | null }[];
                prompt_progress?: { total?: number; processed?: number; cache?: number };
                error?: { message?: string };
              };
              if (d.error) erreur = d.error.message ?? "erreur du modèle";
              const p = d.prompt_progress;
              if (p?.total) surLecture((p.processed ?? 0) - (p.cache ?? 0), p.total - (p.cache ?? 0));
              const c = d.choices?.[0];
              if (c?.delta?.content) {
                texte += c.delta.content;
                surJeton(++jetons);
              }
              if (c?.finish_reason) fin = c.finish_reason;
            } catch {}
          }
        });
        res.on("end", () => {
          if (res.statusCode !== 200 || (erreur && !texte)) {
            let m = erreur;
            try {
              m = (JSON.parse(erreur) as { error?: { message?: string } }).error?.message ?? erreur;
            } catch {}
            reject(new Error(`Le modèle a refusé la demande : ${m.slice(0, 200) || `code ${res.statusCode}`}`));
          } else resolve({ texte, fin, jetons });
        });
        res.on("error", reject);
      },
    );
    req.on("error", (err) => reject(new Error(`Le modèle ne répond pas (${err.message}).`)));
    // Sans rien recevoir pendant dix minutes, ou au bout de quarante, la demande est abandonnée.
    req.setTimeout(10 * 60_000, () => req.destroy(new Error("aucune réponse depuis dix minutes")));
    const plafond = setTimeout(() => req.destroy(new Error("plus de quarante minutes de travail")), 40 * 60_000);
    req.on("close", () => clearTimeout(plafond));
    req.end(donnees);
  });
}

/** Schéma JSON du format attendu, pour contraindre la réponse du modèle. */
function schemaJson(schema: z.ZodType): Record<string, unknown> {
  const s = z.toJSONSchema(schema) as Record<string, unknown>;
  delete s.$schema;
  return s;
}

/**
 * Demande au modèle une réponse au format du schéma. Une demande à la fois : les suivantes attendent leur tour.
 * attendus : nombre de jetons d'une réponse habituelle, pour estimer l'avancement.
 */
export function demanderAuModele<S extends z.ZodType>(opts: {
  schema: S;
  systeme: string;
  message: string;
  maxJetons: number;
  attendus: number;
  libelle: string;
  cle: string;
  surAvancement?: (t: Travail) => void;
}): Promise<z.infer<S>> {
  const tache = async () => {
    const travail: Travail = { cle: opts.cle, libelle: opts.libelle, phase: "demarrage", progression: 0, debut: Date.now() };
    etat.travail = travail;
    let dernier = -1;
    const signaler = () => {
      // Avancement par paliers de 5 % : assez pour suivre, sans écrire en base à chaque jeton.
      const palier = Math.floor(travail.progression / 5);
      if (palier !== dernier || travail.phase === "demarrage") {
        dernier = palier;
        opts.surAvancement?.({ ...travail });
      }
    };
    signaler();
    try {
      const url = await serveur();
      travail.phase = "lecture";
      travail.progression = 2;
      signaler();
      const messages: Message[] = [
        { role: "system", content: opts.systeme },
        { role: "user", content: opts.message },
      ];
      const r = await completer(
        url,
        {
          messages,
          temperature: 0.15,
          top_p: 0.95,
          max_tokens: opts.maxJetons,
          stream: true,
          cache_prompt: true,
          return_progress: true,
          response_format: { type: "json_schema", json_schema: { name: "reponse", strict: true, schema: schemaJson(opts.schema) } },
        },
        (n) => {
          travail.phase = "ecriture";
          travail.progression = Math.min(97, 30 + Math.round((n / opts.attendus) * 67));
          signaler();
        },
        (fait, total) => {
          if (travail.phase !== "lecture" || total <= 0) return;
          travail.progression = Math.max(travail.progression, Math.min(30, 2 + Math.round((fait / total) * 28)));
          signaler();
        },
      );
      if (r.fin === "length") throw new Error("La réponse du modèle a été coupée : le dossier est peut-être trop long.");
      let brut: unknown;
      try {
        brut = JSON.parse(r.texte);
      } catch {
        throw new Error("La réponse du modèle n'a pas pu être lue.");
      }
      const lu = opts.schema.safeParse(brut);
      if (!lu.success) throw new Error("La réponse du modèle est incomplète.");
      const secondes = Math.round((Date.now() - travail.debut) / 1000);
      console.log(`[modèle] ${opts.libelle} : ${r.jetons} jetons en ${secondes} s`);
      etat.dernierEchec = null;
      return lu.data as z.infer<S>;
    } catch (err) {
      etat.dernierEchec = err instanceof Error ? err.message : String(err);
      throw err;
    } finally {
      etat.travail = null;
      planifierArret();
    }
  };
  const suite = etat.file.then(tache, tache);
  etat.file = suite.catch(() => {});
  return suite;
}
