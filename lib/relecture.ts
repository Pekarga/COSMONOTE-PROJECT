/**
 * Relecture « anti-IA » des courriers du rédacteur.
 *
 * Adaptation au français administratif des skills « humanizer » et
 * « stop-slop », calée sur les courriers signés de la Direction du Contrôle
 * Budgétaire (courriers de réponse et notes au Directeur).
 *
 * Module autonome, sans dépendance :
 * - REGLES_ANTI_IA : bloc à ajouter au prompt système de rédaction ;
 * - relire / relireCourrier : repère les tournures typiques d'un texte généré
 *   (fonctionne sans clé d'API, donc aussi en mode démo) ;
 * - enRemarques : transforme les constats en remarques « Avant signature » ;
 * - nettoyer / nettoyerCourrier : applique seulement les corrections sûres ;
 * - SYSTEME_SECONDE_PASSE / consigneSecondePasse : relecture par Claude,
 *   en deux temps (repérer ce qui sonne IA, puis réécrire).
 *
 * Tests : node --test scripts/test-relecture.mjs
 */

export type Gravite = "a_corriger" | "a_verifier";

export interface Constat {
  /** Identifiant stable de la règle (pour regrouper ou filtrer). */
  regle: string;
  /** Libellé court, affichable tel quel. */
  titre: string;
  /** Le passage repéré, tel qu'il figure dans le texte. */
  extrait: string;
  debut: number;
  fin: number;
  /** Ce qu'il faut faire, en une ou deux phrases. */
  conseil: string;
  gravite: Gravite;
}

/** Forme du courrier produite par la rédaction (objet, paragraphes, politesse). */
export interface CourrierTexte {
  objet: string;
  corps: string[];
  politesse: string;
}

export interface ConstatCourrier extends Constat {
  champ: "objet" | "corps" | "politesse";
  /** Index du paragraphe dans `corps`, quand champ === "corps". */
  paragraphe?: number;
}

// ---------------------------------------------------------------------------
// Règles de style pour le prompt de rédaction
// ---------------------------------------------------------------------------

export const REGLES_ANTI_IA = `Écriture : le courrier doit se lire comme ceux que la Direction a déjà signés, sans aucune trace de texte généré.

Ce que font les courriers signés :
- Une idée par paragraphe, en une à trois phrases. Le corps tient en trois à six paragraphes.
- Le premier paragraphe cite la pièce reçue avec sa référence et sa date : « Par courrier N°… en date du… », « Par soit transmis N°… en date du… », « Par décision N°… du… ».
- Les faits sont précis : numéro, date, article du texte applicable, montant en lettres puis en chiffres entre parenthèses suivi de FCFA, nature de dépense ou nature économique entre guillemets « ».
- Les enchaînements sont toujours les mêmes : « En réponse, j'ai l'honneur de porter à votre connaissance que », « Or, », « Après analyse, il en ressort que : », « Toutefois, », « Par conséquent, », « A cet effet, », « Au vu de ce qui précède, », « Au regard de ce qui précède, », « Au total, ».
- La conclusion tranche, sans détour : « votre acte ne peut être appliqué », « la modification ne peut être implémentée », « il parait indiqué d'accorder une suite favorable à la décision suscitée ».
- On désigne l'organisme toujours de la même façon : « votre établissement » ou son sigle.

À ne jamais écrire, car ces tournures trahissent un texte généré :
- Mots d'insistance : crucial, primordial, fondamental, incontournable, véritable, significatif, considérable, optimal, enjeu, levier, synergie, dynamique, pérennité, pleinement, particulièrement, « rôle clé », « point clé ».
- Importance gonflée : « revêt une importance capitale », « joue un rôle déterminant », « s'inscrit dans une dynamique », « témoigne de votre engagement », « met en lumière ».
- Queues de phrase en -ant : « …, permettant ainsi de… », « …, garantissant… », « …, contribuant à… ». Faire plutôt une seconde phrase.
- « constitue un véritable… », « représente une avancée… », « se positionne comme… » quand « est » suffit.
- Balanciers : « non seulement… mais aussi… », « il ne s'agit pas seulement de… mais de… », « ne se limite pas à ».
- Énumérations de trois termes abstraits plaquées (« la rigueur, la transparence et l'efficacité »).
- Remplissage : « il est important de noter que », « il convient de souligner que », « force est de constater que », « il va sans dire que », « dans un souci de », « dans l'optique de », « afin de pouvoir ».
- Précautions en cascade : « il semblerait que », « pourrait éventuellement », « potentiellement », « dans une certaine mesure ». Une seule réserve suffit, avec la formule des courriers signés : « il parait indiqué de » ou « il parait inapproprié de ».
- Compliments et remerciements appuyés : « je salue votre initiative », « votre louable démarche », « chaleureusement ».
- Conclusions creuses : « je ne doute pas que », « dans l'intérêt de tous », « pour une gestion saine et efficace des finances publiques », « en conclusion ».
- Annonces de plan : « dans un premier temps », « permettez-moi de », « je vais vous exposer ».
- Phrases d'assistant ou absentes des modèles : « Voici le projet », « N'hésitez pas », « J'espère que », « Je reste à votre entière disposition ».
- Typographie : pas de tiret cadratin (—), pas de gras, pas de liste à puces avec intitulés, pas d'émoji, pas de point d'exclamation, guillemets français « » uniquement ; dans l'objet, majuscule au premier mot, aux sigles et aux noms propres seulement.

N'invente jamais un numéro, une date, un article de texte ou un montant. Si l'information manque dans le dossier, écris [à compléter].`;

// ---------------------------------------------------------------------------
// Outils de motifs
// ---------------------------------------------------------------------------

const LETTRE = "\\p{L}\\p{N}";

/**
 * Construit un motif qui ne coupe pas les mots (accents compris).
 * Dans les expressions, « ' » accepte ' et ’, et une espace accepte toute suite d'espaces.
 */
function mots(...expressions: string[]): RegExp {
  const source = expressions
    .map((e) => e.replace(/'/g, "['’]").replace(/ /g, "\\s+"))
    .join("|");
  // Une expression qui finit par une apostrophe (« dans le but d' ») est suivie d'une lettre.
  return new RegExp(`(?<![${LETTRE}])(?:${source})(?:(?<=['’])|(?![${LETTRE}]))`, "giu");
}

interface Regle {
  id: string;
  titre: string;
  gravite: Gravite;
  conseil: string;
  motif: RegExp;
}

const REGLES: Regle[] = [
  {
    id: "insistance",
    titre: "Mot d'insistance",
    gravite: "a_corriger",
    conseil:
      "Ce mot n'apparaît dans aucun courrier signé. Supprimez-le, ou remplacez-le par le fait précis (référence, montant, article).",
    motif: mots(
      "cruciale?s?",
      "cruciaux",
      "primordiale?s?",
      "primordiaux",
      "fondamentale?s?",
      "fondamentaux",
      "fondamentalement",
      "incontournables?",
      "véritables?",
      "véritablement",
      "significati(?:f|fs|ve|ves)",
      "significativement",
      "considérables?",
      "considérablement",
      "optimale?s?",
      "optimaux",
      "optimiser",
      "optimisation",
      "enjeux?",
      "leviers?",
      "synergies?",
      "écosystèmes?",
      "holistiques?",
      "robustes?",
      "pérennité",
      "pérenniser",
      "(?:une|la|cette) dynamique",
      "résolument",
      "pleinement",
      "indéniablement",
      "incontestablement",
      "extrêmement",
      "particulièrement",
      "grandement",
      "hautement",
      "profondément",
      "vraiment",
      "réellement",
      "(?:rôle|point|élément|étape|acteur|facteur)s? clés?",
    ),
  },
  {
    id: "importance",
    titre: "Importance gonflée",
    gravite: "a_corriger",
    conseil:
      "Les courriers signés énoncent le fait sans commenter sa portée. Dites ce qui est demandé, vérifié ou décidé.",
    motif: mots(
      "revêt(?:ir|ent)? une (?:importance|dimension)(?: \\p{L}+)?",
      "d'une importance (?:capitale|majeure|particulière|cruciale)",
      "jou(?:e|ent|er|era|ait) un rôle (?:crucial|déterminant|essentiel|clé|majeur|central|important|primordial|fondamental)",
      "constitu(?:e|ent) une étape (?:décisive|importante|clé|majeure|essentielle)",
      "marqu(?:e|ent|er) un tournant",
      "témoign(?:e|ent|er|ant) de (?:votre|son|sa|ses|leur|notre|l'|la|le|une|un)",
      "s'inscri(?:t|vent|re|vant) dans (?:une|la|cette) (?:dynamique|démarche|logique|volonté|perspective)",
      "(?:il est|c'est) (?:essentiel|crucial|primordial|fondamental|capital) de",
      "illustre parfaitement",
      "met(?:tre|tent|tant)? en (?:lumière|exergue)",
      "soulign(?:e|ent|er|ant) (?:l'importance|la nécessité)",
    ),
  },
  {
    id: "participe",
    titre: "Queue de phrase en -ant",
    gravite: "a_verifier",
    conseil:
      "Cette fin de phrase en -ant ajoute une portée de façade. Faites une seconde phrase avec un sujet, ou supprimez-la.",
    motif: new RegExp(
      `,\\s*(?:tout en\\s+|ainsi\\s+)?(?:permettant|garantissant|contribuant|favorisant|renforçant|assurant|soulignant|témoignant|illustrant|reflétant|traduisant|offrant|consolidant|optimisant)(?:\\s+ainsi)?(?![${LETTRE}])|(?<![${LETTRE}])tout en (?:veillant|garantissant|assurant|préservant|favorisant)(?![${LETTRE}])`,
      "giu",
    ),
  },
  {
    id: "copule",
    titre: "« est » évité",
    gravite: "a_verifier",
    conseil: "« est » suffit. Écrivez la chose simplement.",
    motif: mots(
      "constitu(?:e|ent) (?:un|une) (?:véritable|réel|réelle|enjeu|levier|atout|outil|étape|avancée|opportunité|défi|gage)",
      "représent(?:e|ent) (?:un|une) (?:véritable|réel|réelle|enjeu|levier|atout|outil|étape|avancée|opportunité|défi)",
      "se (?:positionne|présente|pose|veut|révèle) comme",
      "fait office de",
      "s'impose comme",
    ),
  },
  {
    id: "balancier",
    titre: "Construction en balancier",
    gravite: "a_corriger",
    conseil:
      "Les tournures « non seulement… mais aussi… » sonnent comme un texte généré. Énoncez directement ce qui compte.",
    motif: mots(
      "non seulement",
      "il ne s'agit pas (?:seulement|uniquement|simplement|tant) de",
      "ne se limit(?:e|ent) pas à",
      "loin d'être",
      "plus qu'une? simple",
      "au-delà d(?:u|e la|e l'|es) (?:simple|seule?)",
    ),
  },
  {
    id: "remplissage",
    titre: "Formule de remplissage",
    gravite: "a_corriger",
    conseil: "Supprimez cette formule : la phrase dit la même chose sans elle.",
    motif: mots(
      "il est (?:important|utile|nécessaire|bon|intéressant) de (?:noter|souligner|rappeler|préciser|relever|signaler) que",
      "il convient de (?:noter|souligner|rappeler|relever|signaler|mentionner) que",
      "il est à (?:noter|souligner|rappeler|relever) que",
      "force est de constater que",
      "il va sans dire que",
      "il n'est pas inutile de rappeler que",
      "(?:notons|soulignons|rappelons|précisons) que",
      "(?:à|a) (?:noter|souligner) que",
      "dans un souci d(?:e|')",
      "dans l'optique d(?:e|')",
      "dans le but d(?:e|')",
      "(?:afin|en vue) de pouvoir",
    ),
  },
  {
    id: "connecteur",
    titre: "Connecteur absent des modèles",
    gravite: "a_verifier",
    conseil:
      "Les courriers signés enchaînent avec « Or, », « Toutefois, », « Par conséquent, », « Au vu de ce qui précède, ». Gardez ces enchaînements, ou supprimez le connecteur.",
    motif: mots(
      "en effet",
      "de surcroît",
      "en outre",
      "à cet égard",
      "dans le cadre d(?:e|u|es|')",
      "au niveau d(?:e|u|es|')",
      "en ce qui concerne",
    ),
  },
  {
    id: "prudence",
    titre: "Précaution superflue",
    gravite: "a_verifier",
    conseil:
      "Une seule réserve suffit. Les courriers signés disent « il parait indiqué de » ou « il parait inapproprié de ».",
    motif: mots(
      "il (?:semblerait|semble|apparaîtrait) que",
      "il se pourrait que",
      "pourrai(?:t|ent) (?:éventuellement|potentiellement)",
      "potentiellement",
      "dans une certaine mesure",
      "a priori",
      "il n'est pas exclu que",
      "sous réserve d'informations complémentaires",
      "(?:selon|d'après) les informations disponibles",
      "en l'état des informations disponibles",
    ),
  },
  {
    id: "complaisance",
    titre: "Compliment appuyé",
    gravite: "a_corriger",
    conseil: "Le ton reste neutre : on vise la pièce reçue et on répond. Supprimez le compliment.",
    motif: mots(
      "(?:je|nous) (?:tiens|tenons) à (?:saluer|vous remercier|remercier|féliciter|vous féliciter)",
      "(?:je|nous) (?:salue|saluons|félicite|félicitons)",
      "chaleureusement",
      "louables?",
      "(?:votre|cette) (?:excellente|remarquable|précieuse|exemplaire) (?:initiative|démarche|collaboration|contribution)",
      "avec (?:grand )?plaisir",
      "je me réjouis",
    ),
  },
  {
    id: "conversation",
    titre: "Phrase d'assistant",
    gravite: "a_corriger",
    conseil: "Cette phrase vient d'une conversation avec l'assistant. Supprimez-la.",
    motif: mots(
      "voici (?:le|la|un|une|votre|ci-dessous)",
      "bien sûr",
      "certainement",
      "absolument",
      "n'hésitez pas",
      "j'espère que",
      "si vous souhaitez",
      "souhaitez-vous",
      "dites-moi",
    ),
  },
  {
    id: "formule_absente",
    titre: "Formule absente des modèles",
    gravite: "a_corriger",
    conseil:
      "Les courriers signés passent directement de la conclusion à la formule de politesse. Supprimez cette phrase.",
    motif: mots(
      "je reste à votre (?:entière )?disposition",
      "restant à votre (?:entière )?disposition",
      "pour toute (?:information|précision) complémentaire",
      "je vous remercie (?:par avance|d'avance|de votre compréhension)",
    ),
  },
  {
    id: "conclusion",
    titre: "Conclusion convenue",
    gravite: "a_corriger",
    conseil:
      "Terminez sur la décision ou la proposition, comme dans les courriers signés : « Au vu de ce qui précède, … ».",
    motif: mots(
      "je ne doute pas que",
      "je suis (?:convaincue?|persuadée?|certaine?|sûre?) que",
      "dans l'intérêt (?:de tous|général|de l'ensemble)",
      "(?:une|la) gestion (?:saine|efficace|rigoureuse|transparente)(?:,? (?:et )?(?:saine|efficace|rigoureuse|transparente))* des (?:finances|deniers) publi(?:cs|ques)",
      "gage de",
      "en conclusion",
      "pour conclure",
      "en définitive",
      "en somme",
      "pour (?:une meilleure|une bonne) gouvernance",
    ),
  },
  {
    id: "autorite",
    titre: "Fausse profondeur",
    gravite: "a_corriger",
    conseil: "Formule qui prétend aller au fond des choses. Dites le fait, simplement.",
    motif: mots(
      "en réalité",
      "au fond",
      "(?:la|le) (?:véritable|vraie?|réelle?) (?:question|enjeu|problème)",
      "au cœur d(?:u|e la|e l'|es)",
      "ce qui compte (?:vraiment|réellement)",
      "l'essentiel est",
    ),
  },
  {
    id: "annonce",
    titre: "Annonce de plan",
    gravite: "a_corriger",
    conseil: "Entrez directement dans le fait, sans annoncer ce qui va suivre.",
    motif: mots(
      "dans un premier temps",
      "dans un second temps",
      "permettez-moi",
      "(?:je vais|nous allons) (?:vous )?(?:présenter|exposer|détailler|examiner|aborder|voir)",
      "comme nous (?:allons le voir|le verrons)",
    ),
  },
  {
    id: "tiret",
    titre: "Tiret cadratin",
    gravite: "a_corriger",
    conseil: "Aucun courrier signé n'en contient. Remplacez-le par une virgule ou un point.",
    motif: /—/gu,
  },
  {
    id: "guillemets",
    titre: "Guillemets anglais",
    gravite: "a_corriger",
    conseil: "Les courriers signés utilisent les guillemets français « ».",
    motif: /[“”"]/gu,
  },
  {
    id: "gras",
    titre: "Gras dans le texte",
    gravite: "a_corriger",
    conseil: "Pas de gras dans le corps du courrier : seul l'appel est en gras, et la mise en page s'en charge.",
    motif: /\*\*[^*\n]+\*\*|__[^_\n]+__/gu,
  },
  {
    id: "liste",
    titre: "Liste à intitulés",
    gravite: "a_corriger",
    conseil:
      "Rédigez en paragraphes, comme les notes au Directeur (« Après analyse, il en ressort que : » suivi de paragraphes).",
    motif: /^[ \t]*[-•*▪●][ \t]+[^:\n]{1,40}[ \t]?:/gmu,
  },
  {
    id: "emoji",
    titre: "Émoji",
    gravite: "a_corriger",
    conseil: "Pas d'émoji dans un courrier administratif.",
    motif: /\p{Extended_Pictographic}/gu,
  },
  {
    id: "exclamation",
    titre: "Point d'exclamation",
    gravite: "a_corriger",
    conseil: "Pas de point d'exclamation dans un courrier administratif.",
    motif: /!/gu,
  },
  {
    id: "a_completer",
    titre: "À compléter",
    gravite: "a_verifier",
    conseil: "Information manquante dans le dossier : complétez-la avant la signature.",
    motif: /\[[^\]\n]*(?:compléter|completer|préciser|\.\.\.|…)[^\]\n]*\]|X{3,}/giu,
  },
];

/** Liste des règles, pour un affichage ou un filtre dans l'interface. */
export const REGLES_RELECTURE: ReadonlyArray<Pick<Regle, "id" | "titre" | "gravite" | "conseil">> =
  REGLES.map(({ id, titre, gravite, conseil }) => ({ id, titre, gravite, conseil }));

// ---------------------------------------------------------------------------
// Contrôles qui portent sur une phrase, un paragraphe ou le document entier
// ---------------------------------------------------------------------------

const SUFFIXE_ABSTRAIT = /(?:tion|ité|ence|ance|isme|ment|eur|ise|ure|esse)s?$/iu;
const ARTICLE = "(?:la |le |l['’]|les )";
const TERME = "[\\p{L}-]+";
const TRIPLET = new RegExp(
  `(?<![${LETTRE}])${ARTICLE}(${TERME}), ${ARTICLE}(${TERME}),? et ${ARTICLE}(${TERME})(?![${LETTRE}])`,
  "giu",
);
const FAUSSE_FOURCHETTE = new RegExp(
  `(?<![${LETTRE}])de ${ARTICLE}?${TERME} à ${ARTICLE}?${TERME}, de ${ARTICLE}?${TERME} à ${ARTICLE}?${TERME}`,
  "giu",
);
const DESIGNATION = new RegExp(
  `(?<![${LETTRE}])(?:l['’]|la |le |votre |son |sa |leur |cette |cet |ladite |ledit )(établissement|structure|entité|organisme|institution)(?![${LETTRE}])`,
  "giu",
);
const MOTS_PAR_PARAGRAPHE_MAX = 90;

function constat(regle: Omit<Regle, "motif">, extrait: string, debut: number): Constat {
  return {
    regle: regle.id,
    titre: regle.titre,
    gravite: regle.gravite,
    conseil: regle.conseil,
    extrait,
    debut,
    fin: debut + extrait.length,
  };
}

function triplets(texte: string): Constat[] {
  const regle = {
    id: "trois",
    titre: "Énumération de trois",
    gravite: "a_verifier" as const,
    conseil:
      "Trois termes abstraits alignés sonnent comme un texte généré. Gardez celui qui porte le fait, ou nommez les éléments précis.",
  };
  const trouves: Constat[] = [];
  for (const m of texte.matchAll(TRIPLET)) {
    const abstraits = [m[1], m[2], m[3]].filter((t) => SUFFIXE_ABSTRAIT.test(t)).length;
    if (abstraits >= 2) trouves.push(constat(regle, m[0], m.index ?? 0));
  }
  return trouves;
}

function fourchettes(texte: string): Constat[] {
  const regle = {
    id: "fourchette",
    titre: "Fausse fourchette",
    gravite: "a_corriger" as const,
    conseil: "« de X à Y, de Z à W » ne décrit rien de précis. Nommez les éléments concernés.",
  };
  return [...texte.matchAll(FAUSSE_FOURCHETTE)].map((m) => constat(regle, m[0], m.index ?? 0));
}

function paragraphesLongs(texte: string): Constat[] {
  const regle = {
    id: "paragraphe_long",
    titre: "Paragraphe long",
    gravite: "a_verifier" as const,
    conseil: `Les courriers signés s'en tiennent à une idée par paragraphe (une à trois phrases). Celui-ci dépasse ${MOTS_PAR_PARAGRAPHE_MAX} mots : coupez-le.`,
  };
  const trouves: Constat[] = [];
  let position = 0;
  for (const bloc of texte.split(/(\n\s*\n|\n)/)) {
    const nbMots = bloc.split(/\s+/).filter(Boolean).length;
    if (nbMots > MOTS_PAR_PARAGRAPHE_MAX) {
      const debut = position + (bloc.length - bloc.trimStart().length);
      const extrait = bloc.trim().slice(0, 60) + "…";
      trouves.push({ ...constat(regle, extrait, debut), fin: debut + bloc.trim().length });
    }
    position += bloc.length;
  }
  return trouves;
}

/** Repère un objet écrit avec des majuscules à chaque mot (« Votre Demande De Modification »). */
function majusculesObjet(objet: string, decalage = 0): Constat[] {
  const regle = {
    id: "objet_majuscules",
    titre: "Majuscules dans l'objet",
    gravite: "a_corriger" as const,
    conseil:
      "Dans l'objet, majuscule au premier mot, aux sigles et aux noms propres seulement : « Votre demande de modification budgétaire ».",
  };
  const contenu = objet.replace(/^\s*objet\s*:\s*/iu, "");
  const termes = contenu.split(/\s+/).slice(1).filter((t) => /^\p{L}{4,}/u.test(t));
  const capitalises = termes.filter((t) => /^\p{Lu}\p{Ll}/u.test(t));
  if (termes.length >= 3 && capitalises.length / termes.length > 0.5) {
    const debut = decalage + objet.indexOf(contenu);
    return [constat(regle, contenu.trim(), debut)];
  }
  return [];
}

/** Plusieurs noms différents (établissement, structure, entité…) pour le même organisme. */
function synonymes(textes: string[]): { index: number; constat: Constat }[] {
  const regle = {
    id: "synonymes",
    titre: "Noms qui changent",
    gravite: "a_verifier" as const,
    conseil:
      "Le même organisme est désigné de plusieurs façons. Gardez « votre établissement » ou le sigle, comme dans les courriers signés.",
  };
  const vus = new Map<string, { index: number; constat: Constat }>();
  textes.forEach((texte, index) => {
    for (const m of texte.matchAll(DESIGNATION)) {
      const nom = m[1].toLowerCase();
      if (!vus.has(nom)) vus.set(nom, { index, constat: constat(regle, m[0], m.index ?? 0) });
    }
  });
  // Deux désignations peuvent cohabiter (« l'établissement » et « l'organisme de tutelle ») ;
  // à partir de trois, c'est la rotation de synonymes typique d'un texte généré.
  if (vus.size < 3) return [];
  return [...vus.values()].slice(1);
}

function dedoublonner(constats: Constat[]): Constat[] {
  const tries = [...constats].sort(
    (a, b) => a.debut - b.debut || b.fin - b.debut - (a.fin - a.debut),
  );
  const gardes: Constat[] = [];
  for (const c of tries) {
    const englobe = gardes.some(
      (g) => g.regle !== "paragraphe_long" && c.regle !== "paragraphe_long" && g.debut <= c.debut && c.fin <= g.fin,
    );
    if (!englobe) gardes.push(c);
  }
  return gardes;
}

function relireSansSynonymes(texte: string): Constat[] {
  const trouves: Constat[] = [];
  for (const regle of REGLES) {
    for (const m of texte.matchAll(regle.motif)) {
      trouves.push(constat(regle, m[0], m.index ?? 0));
    }
  }
  trouves.push(...triplets(texte), ...fourchettes(texte), ...paragraphesLongs(texte));
  const ligneObjet = /^[ \t]*objet[ \t]*:[^\n]*/imu.exec(texte);
  if (ligneObjet) trouves.push(...majusculesObjet(ligneObjet[0], ligneObjet.index));
  return trouves;
}

// ---------------------------------------------------------------------------
// API de relecture
// ---------------------------------------------------------------------------

/** Relit un texte libre (courrier entier ou paragraphe) et renvoie les constats, dans l'ordre du texte. */
export function relire(texte: string): Constat[] {
  const trouves = relireSansSynonymes(texte);
  trouves.push(...synonymes([texte]).map((s) => s.constat));
  return dedoublonner(trouves);
}

/** Relit un courrier structuré (objet, paragraphes, politesse) ; chaque constat dit où il se trouve. */
export function relireCourrier(courrier: CourrierTexte): ConstatCourrier[] {
  const resultat: ConstatCourrier[] = [];
  const objet = dedoublonner([
    ...relireSansSynonymes(courrier.objet).filter((c) => c.regle !== "objet_majuscules"),
    ...majusculesObjet(courrier.objet),
  ]);
  resultat.push(...objet.map((c) => ({ ...c, champ: "objet" as const })));
  courrier.corps.forEach((paragraphe, index) => {
    resultat.push(
      ...dedoublonner(relireSansSynonymes(paragraphe)).map((c) => ({
        ...c,
        champ: "corps" as const,
        paragraphe: index,
      })),
    );
  });
  resultat.push(
    ...dedoublonner(relireSansSynonymes(courrier.politesse)).map((c) => ({
      ...c,
      champ: "politesse" as const,
    })),
  );
  for (const { index, constat: c } of synonymes(courrier.corps)) {
    resultat.push({ ...c, champ: "corps", paragraphe: index });
  }
  return resultat;
}

/** Compte les constats par gravité. */
export function bilan(constats: Constat[]): { total: number; aCorriger: number; aVerifier: number } {
  const aCorriger = constats.filter((c) => c.gravite === "a_corriger").length;
  return { total: constats.length, aCorriger, aVerifier: constats.length - aCorriger };
}

/**
 * Regroupe les constats par règle et en fait des remarques courtes, à afficher
 * dans la liste « Avant signature ». Les points à corriger passent en premier.
 */
export function enRemarques(constats: Constat[]): string[] {
  const groupes = new Map<string, { c: Constat; extraits: string[] }>();
  for (const c of constats) {
    const g = groupes.get(c.regle) ?? { c, extraits: [] };
    const extrait = c.extrait.replace(/\s+/g, " ").trim();
    if (!g.extraits.includes(extrait)) g.extraits.push(extrait);
    groupes.set(c.regle, g);
  }
  return [...groupes.values()]
    .sort((a, b) => Number(a.c.gravite === "a_verifier") - Number(b.c.gravite === "a_verifier"))
    .map(({ c, extraits }) => {
      const cites = extraits.slice(0, 3).map((e) => `« ${e} »`).join(", ");
      const suite = extraits.length > 3 ? ` et ${extraits.length - 3} autre(s)` : "";
      return `${c.titre} : ${cites}${suite}. ${c.conseil}`;
    });
}

// ---------------------------------------------------------------------------
// Corrections sûres
// ---------------------------------------------------------------------------

const DEBUT_DE_PHRASE = /(^|[.!?:]\s+|\n\s*)$/u;

const FORMULES_A_RETIRER = mots(
  "il est (?:important|utile|nécessaire|bon|intéressant) de (?:noter|souligner|rappeler|préciser|relever|signaler) que",
  "il convient de (?:noter|souligner|rappeler|relever|signaler|mentionner) que",
  "il est à (?:noter|souligner|rappeler|relever) que",
  "force est de constater que",
  "il va sans dire que",
  "il n'est pas inutile de rappeler que",
  "(?:notons|soulignons|rappelons|précisons) que",
  "(?:à|a) (?:noter|souligner) que",
);

const REMPLACEMENTS: [RegExp, string][] = [
  [mots("afin de pouvoir"), "afin de"],
  [mots("en vue de pouvoir"), "en vue de"],
  [mots("dans le but de"), "afin de"],
  [mots("dans le but d'"), "afin d'"],
  [mots("dans l'optique de"), "afin de"],
  [mots("dans l'optique d'"), "afin d'"],
];

const LIGNE_ASSISTANT_DEBUT =
  /^\s*(?:voici|bien sûr|bien entendu|certainement|absolument|ci-dessous)(?![\p{L}])[^\n]*\n+/iu;
const LIGNE_ASSISTANT_FIN =
  /\n+\s*(?:n['’]hésitez pas|j['’]espère que|si vous souhaitez|souhaitez-vous|dites-moi|je peux également)(?![\p{L}])[^\n]*\s*$/iu;

function memeCasse(modele: string, remplacement: string): string {
  return /^\p{Lu}/u.test(modele)
    ? remplacement.charAt(0).toUpperCase() + remplacement.slice(1)
    : remplacement;
}

function retirerFormules(texte: string): string {
  return texte.replace(FORMULES_A_RETIRER, (formule, ...reste) => {
    const position = reste[reste.length - 2] as number;
    const avant = texte.slice(0, position);
    const apres = texte.slice(position + formule.length);
    if (DEBUT_DE_PHRASE.test(avant)) {
      // « Il est important de noter que le dossier… » → « Le dossier… »
      const suite = /^\s*(\p{L})/u.exec(apres);
      return suite ? `\u0000MAJ` : "";
    }
    return "\u0000SUPPR";
  })
    .replace(/\u0000MAJ[ \t]*(\p{L})/gu, (_, l: string) => l.toUpperCase())
    .replace(/[ \t]*\u0000SUPPR[ \t]*/gu, " ");
}

/**
 * Applique les seules corrections sans risque pour le sens :
 * phrases d'assistant en tête ou en fin, gras Markdown, émojis, guillemets anglais,
 * tirets cadratins, points d'exclamation, formules de remplissage. Le reste est signalé par `relire`.
 * Les tirets demi-cadratins (« Union – Discipline – Travail ») ne sont pas touchés.
 */
export function nettoyer(texte: string): string {
  let t = texte;
  t = t.replace(LIGNE_ASSISTANT_DEBUT, "").replace(LIGNE_ASSISTANT_FIN, "");
  t = t.replace(/\*\*([^*\n]+)\*\*/gu, "$1").replace(/__([^_\n]+)__/gu, "$1");
  t = t.replace(/\p{Extended_Pictographic}️?\s?/gu, "");
  t = t.replace(/[“"]\s*([^”"\n]+?)\s*[”"]/gu, "« $1 »");
  t = t.replace(/^[ \t]*—[ \t]*/gmu, "");
  t = t.replace(/[ \t]*—[ \t]*([.,;:])/gu, "$1");
  t = t.replace(/[ \t]*—[ \t]*/gu, ", ");
  t = t.replace(/[ \t\u00A0]*!+(?=\s|$)/gu, ".");
  t = retirerFormules(t);
  for (const [motif, remplacement] of REMPLACEMENTS) {
    t = t.replace(motif, (m) => memeCasse(m, remplacement));
  }
  return t.replace(/,[ \t]*,/gu, ",");
}

/** `nettoyer` appliqué à chaque champ d'un courrier structuré. */
export function nettoyerCourrier<T extends CourrierTexte>(courrier: T): T {
  return {
    ...courrier,
    objet: nettoyer(courrier.objet),
    corps: courrier.corps.map(nettoyer),
    politesse: nettoyer(courrier.politesse),
  };
}

// ---------------------------------------------------------------------------
// Seconde passe par Claude (mode avec clé)
// ---------------------------------------------------------------------------

export const SYSTEME_SECONDE_PASSE = `Tu relis un projet de courrier administratif de la Direction du Contrôle Budgétaire, avant sa présentation à la signature.

${REGLES_ANTI_IA}

Méthode, en deux temps :
1. Demande-toi : « Qu'est-ce qui trahit encore une rédaction par IA dans ce projet ? » Réponds en trois points au plus, en une ligne chacun.
2. Réécris le projet pour corriger ces points. Garde les références, les dates, les montants, le destinataire et le sens. N'ajoute aucun fait. Ne touche pas aux formules tirées des courriers signés.`;

function enTexte(projet: string | CourrierTexte): string {
  if (typeof projet === "string") return projet;
  return [`Objet : ${projet.objet}`, ...projet.corps, projet.politesse].join("\n\n");
}

/** Message utilisateur de la seconde passe : le projet, plus les repères trouvés par `relire`. */
export function consigneSecondePasse(projet: string | CourrierTexte, constats?: Constat[]): string {
  const texte = enTexte(projet);
  const reperes = enRemarques(constats ?? relire(texte));
  const blocReperes = reperes.length
    ? `\n\nRepères déjà trouvés par la relecture automatique :\n${reperes.map((r) => `- ${r}`).join("\n")}`
    : "";
  return `<projet>\n${texte}\n</projet>${blocReperes}`;
}
