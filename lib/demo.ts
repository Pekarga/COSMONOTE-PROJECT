import type { ActionItem, Segment } from "./types";

/**
 * Mode démo : sans clé d'API, l'appli produit une transcription d'exemple
 * et une note construite par des règles simples, pour essayer le parcours.
 */
const DEMO_SCRIPT: [number, string][] = [
  [0, "Bonjour à tous, merci d'être là. L'objectif aujourd'hui, c'est de caler le lancement de la nouvelle offre pour le mois prochain."],
  [1, "Très bien. De mon côté, la page de présentation est presque prête, il manque seulement les visuels définitifs."],
  [0, "Parfait. Est-ce qu'on a une date ferme pour la mise en ligne ?"],
  [2, "Je propose le mardi 15. Ça nous laisse une semaine pour les tests avec quelques clients."],
  [1, "Ça me va. Il faut juste qu'on valide le prix avant vendredi, sinon on ne pourra pas imprimer les supports."],
  [0, "D'accord. Je vais envoyer une proposition de prix à toute l'équipe demain matin."],
  [2, "Et pour les clients test, qui s'occupe de les contacter ?"],
  [1, "Je peux m'en charger. Je vais appeler les cinq clients qui nous ont fait des retours le mois dernier."],
  [0, "Super. Dernier point : est-ce qu'on prévoit un webinaire de lancement, ou on attend de voir les premiers retours ?"],
  [2, "Honnêtement je ne sais pas encore, on pourra en reparler après les tests."],
  [0, "Entendu. On fait un point la semaine prochaine pour décider. Merci à tous !"],
];

export const DEMO_DOC = `La mémoire et le sommeil

Pendant le sommeil profond, le cerveau rejoue les informations apprises dans la journée. Ce mécanisme aide à transférer les souvenirs vers la mémoire à long terme.

Une courte sieste de vingt minutes améliore déjà la concentration. Il faut éviter de dépasser trente minutes pour ne pas se réveiller fatigué.

À retenir : la régularité des horaires compte plus que la durée totale de sommeil.

Combien de cycles faut-il pour une nuit vraiment réparatrice ?

En pratique : relire ses notes le soir, puis les revoir le lendemain matin.`;

export function demoTranscript(): { segments: Segment[]; duration: number } {
  let t = 0;
  const segments = DEMO_SCRIPT.map(([speaker, text]) => {
    const length = Math.max(3, Math.round(text.split(" ").length / 2.6));
    const seg = { speaker, start: t, end: t + length, text };
    t += length + 1;
    return seg;
  });
  return { segments, duration: t };
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ACTION_MARKERS = /\b(je vais|on va|il faut|je peux m'en charger|on doit|je m'en occupe|à faire|on fait)\b/i;

export function demoNoteFromText(text: string) {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const note = demoNote(paragraphs.map((p, i) => ({ speaker: 0, start: i, end: i + 1, text: p })));
  return { ...note, title: "Exemple : document scanné" };
}

export function demoNote(segments: Segment[]): {
  title: string;
  essentiel: string;
  resume: string;
  questions: string[];
  actions: ActionItem[];
} {
  const all = segments.flatMap((s) => sentences(s.text));
  const statements = all.filter((s) => !s.endsWith("?") && !/^(bonjour|merci|salut)\b/i.test(s));
  const questions = all.filter((s) => s.endsWith("?"));
  const actions = all.filter((s) => ACTION_MARKERS.test(s)).map((text) => ({ text, done: false }));
  const essentiel = statements.slice(0, 2).join(" ");
  const resume = statements
    .filter((s) => s.split(" ").length > 5)
    .slice(0, 6)
    .map((s) => `- ${s}`)
    .join("\n");
  return {
    title: "Exemple : point d'équipe sur un lancement",
    essentiel,
    resume,
    questions,
    actions,
  };
}

export function demoAnswer(
  question: string,
  notes: { title: string; essentiel: string; actions: ActionItem[] }[],
): string {
  const words = question
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 3);
  const hits = notes.filter((n) =>
    words.some((w) => `${n.title} ${n.essentiel}`.toLowerCase().includes(w)),
  );
  const intro =
    "Mode démo : je ne suis pas encore relié à Claude, alors je cherche simplement les mots de ta question dans tes notes.";
  if (!notes.length) return `${intro}\n\nTu n'as encore aucune note. Crée-en une pour commencer.`;
  if (/\b(actions?|tâches?|à faire)\b/i.test(question)) {
    const pending = notes.flatMap((n) => n.actions.filter((a) => !a.done).map((a) => `- ${a.text} (*${n.title}*)`));
    return pending.length
      ? `${intro}\n\nVoici tes actions en attente :\n${pending.join("\n")}`
      : `${intro}\n\nAucune action en attente. Bravo !`;
  }
  if (!hits.length)
    return `${intro}\n\nJe n'ai rien trouvé de précis. Voici tes notes les plus récentes :\n${notes
      .slice(0, 3)
      .map((n) => `- **${n.title}** : ${n.essentiel}`)
      .join("\n")}`;
  return `${intro}\n\nCes notes semblent liées à ta question :\n${hits
    .slice(0, 5)
    .map((n) => `- **${n.title}** : ${n.essentiel}`)
    .join("\n")}\n\nAjoute une clé ANTHROPIC_API_KEY pour obtenir de vraies réponses.`;
}
