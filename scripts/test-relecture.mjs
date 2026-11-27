// Tests de lib/relecture.ts : node --test scripts/test-relecture.mjs
// (Node 22.18 ou plus récent lit directement le TypeScript.)
// Les courriers ci-dessous sont fictifs : ils reprennent les formules des
// courriers signés de la DCB, avec des références et des montants inventés.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  relire,
  relireCourrier,
  nettoyer,
  nettoyerCourrier,
  enRemarques,
  bilan,
  consigneSecondePasse,
  REGLES_ANTI_IA,
} from "../lib/relecture.ts";

const COURRIER_MODELE = `Objet : Votre demande de modification budgétaire

Madame la Directrice,

Par soit transmis N°112/2026/EPN-X/DG en date du 4 mars 2026, vous m'avez transmis votre décision portant modification de la ventilation du budget 2026 de votre établissement, pour un montant de quinze millions (15 000 000) FCFA.

En réponse, j'ai l'honneur de porter à votre connaissance que l'opération consiste à prélever des crédits de la nature de dépense « Biens et Services » au profit de la nature de dépense « Transfert ».

Or, un tel virement ne peut être autorisé que par arrêté ministériel.

Au vu de ce qui précède, votre acte ne peut être appliqué. Toutefois, je vous suggère de reformuler votre requête en prenant en compte cette observation.

Je vous prie d'agréer, Madame la Directrice, l'expression de ma considération distinguée.`;

const NOTE_MODELE = `NOTE A
MONSIEUR LE DIRECTEUR DU CONTROLE BUDGETAIRE
Objet : Décision portant modification du budget de l'exercice 2026 de l'EPN-X

Par décision N°04/2026/EPN-X/DG du 2 février 2026, le Directeur de l'EPN-X procède à la modification de la ventilation du budget 2026 de son établissement portant sur le montant de huit millions (8 000 000) FCFA.

Après analyse, il en ressort que :

La modification envisagée réduirait les crédits de la ligne entretien à 40 000 000 FCFA, sans incidence sur les marchés en cours.

Au total, ce réaménagement budgétaire sollicité par l'EPN-X ne fait l'objet d'aucune irrégularité.

Au regard de ce qui précède, il parait indiqué d'accorder une suite favorable à la décision suscitée.

Vos instructions m'obligeraient.

REPUBLIQUE DE COTE D'IVOIRE
Union – Discipline – Travail`;

const COURRIER_IA = `Voici le projet de courrier demandé :

Objet : Votre Demande De Modification Budgétaire

Madame la Directrice,

Par courrier N°[à compléter] en date du 12 mars 2026, vous avez sollicité la modification du budget de votre établissement — une démarche qui témoigne de votre engagement en faveur d'une gestion rigoureuse.

Il est important de noter que cette opération revêt une importance capitale, permettant ainsi de garantir la continuité des activités de la structure.

Il ne s'agit pas seulement de respecter les textes, mais aussi de préserver la rigueur, la transparence et l'efficacité de l'action publique. L'entité devra donc produire la décision **visée par le Contrôleur Budgétaire**.

Je ne doute pas que vous prendrez les dispositions nécessaires, dans l'intérêt de tous et pour une gestion saine et efficace des finances publiques !

Je reste à votre entière disposition pour toute information complémentaire.

N'hésitez pas à me dire si vous souhaitez ajuster le ton.`;

const regles = (constats) => new Set(constats.map((c) => c.regle));

test("les courriers rédigés comme les modèles signés ne déclenchent rien", () => {
  assert.deepEqual(relire(COURRIER_MODELE), []);
  assert.deepEqual(relire(NOTE_MODELE), []);
});

test("nettoyer ne touche pas aux courriers rédigés comme les modèles", () => {
  assert.equal(nettoyer(COURRIER_MODELE), COURRIER_MODELE);
  assert.equal(nettoyer(NOTE_MODELE), NOTE_MODELE);
});

test("un courrier au style d'IA est repéré sur chaque tournure", () => {
  const trouves = regles(relire(COURRIER_IA));
  for (const id of [
    "conversation",
    "objet_majuscules",
    "a_completer",
    "tiret",
    "importance",
    "remplissage",
    "participe",
    "balancier",
    "trois",
    "synonymes",
    "gras",
    "conclusion",
    "exclamation",
    "formule_absente",
  ]) {
    assert.ok(trouves.has(id), `règle attendue : ${id}`);
  }
});

test("les constats donnent la position exacte du passage", () => {
  for (const c of relire(COURRIER_IA)) {
    if (c.regle === "paragraphe_long") continue;
    assert.equal(COURRIER_IA.slice(c.debut, c.fin), c.extrait, c.regle);
  }
});

test("les mots sont reconnus entiers, accents et apostrophes compris", () => {
  assert.ok(regles(relire("Dans un souci d'efficacité, la pièce est jointe.")).has("remplissage"));
  assert.ok(regles(relire("Dans un souci d’efficacité, la pièce est jointe.")).has("remplissage"));
  assert.ok(regles(relire("C'est un point clé du dossier.")).has("insistance"));
  // « Fonds » ne doit pas déclencher « au fond », ni « enjeux » le mot « jeu ».
  assert.deepEqual(relire("Le dossier a été transmis au Fonds National de Lutte contre le Sida."), []);
});

test("un paragraphe trop long est signalé", () => {
  const long = Array.from({ length: 100 }, (_, i) => `mot${i}`).join(" ");
  assert.ok(regles(relire(`Court.\n\n${long}`)).has("paragraphe_long"));
});

test("nettoyer applique les corrections sûres", () => {
  const propre = nettoyer(COURRIER_IA);
  assert.ok(!propre.startsWith("Voici"));
  assert.ok(!propre.includes("N'hésitez pas"));
  assert.ok(!propre.includes("—"));
  assert.ok(!propre.includes("**"));
  assert.ok(propre.includes("Cette opération revêt"));
  assert.ok(propre.includes("votre établissement, une démarche"));
  assert.ok(propre.includes("finances publiques."));
  // Une formule de politesse n'est jamais supprimée d'office : elle est seulement signalée.
  assert.ok(propre.includes("Je reste à votre entière disposition"));
});

test("nettoyer : guillemets, remplissage en milieu de phrase et tournures lourdes", () => {
  assert.equal(
    nettoyer('La nature de dépense "Transfert" est créditée.'),
    "La nature de dépense « Transfert » est créditée.",
  );
  assert.equal(
    nettoyer("Le dossier est complet, il convient de souligner que la décision est visée."),
    "Le dossier est complet, la décision est visée.",
  );
  assert.equal(
    nettoyer("Afin de pouvoir statuer, et dans le but d'obtenir la pièce, le service écrit."),
    "Afin de statuer, et afin d'obtenir la pièce, le service écrit.",
  );
  assert.equal(nettoyer("Union – Discipline – Travail"), "Union – Discipline – Travail");
});

test("relireCourrier situe chaque constat dans son champ", () => {
  const courrier = {
    objet: "Votre Demande De Modification Budgétaire",
    corps: [
      "Par courrier N°12 du 3 mars 2026, votre établissement sollicite une modification.",
      "La structure joue un rôle déterminant dans la région.",
      "L'entité devra produire la décision visée.",
    ],
    politesse: "Je vous prie d'agréer, Madame la Directrice, l'expression de ma considération distinguée.",
  };
  const constats = relireCourrier(courrier);
  assert.ok(constats.some((c) => c.champ === "objet" && c.regle === "objet_majuscules"));
  assert.ok(constats.some((c) => c.champ === "corps" && c.paragraphe === 1 && c.regle === "importance"));
  assert.ok(constats.some((c) => c.regle === "synonymes" && c.paragraphe === 2));
  assert.ok(!constats.some((c) => c.champ === "politesse"));
  const net = nettoyerCourrier({ ...courrier, remarques: ["à garder"] });
  assert.deepEqual(net.remarques, ["à garder"]);
});

test("enRemarques regroupe par règle, les points à corriger d'abord", () => {
  const remarques = enRemarques(relire(COURRIER_IA));
  assert.ok(remarques.length > 5);
  assert.ok(remarques[0].length > 0);
  assert.equal(remarques.filter((r) => r.startsWith("Conclusion convenue")).length, 1);
  const iVerifier = remarques.findIndex((r) => r.startsWith("À compléter"));
  const iCorriger = remarques.findIndex((r) => r.startsWith("Tiret cadratin"));
  assert.ok(iCorriger < iVerifier);
  const b = bilan(relire(COURRIER_IA));
  assert.equal(b.total, b.aCorriger + b.aVerifier);
});

test("la consigne de seconde passe contient le projet et les repères", () => {
  const consigne = consigneSecondePasse(COURRIER_IA);
  assert.ok(consigne.startsWith("<projet>\n"));
  assert.ok(consigne.includes("Repères déjà trouvés"));
  assert.ok(consigneSecondePasse(COURRIER_MODELE).endsWith("</projet>"));
  assert.ok(REGLES_ANTI_IA.includes("[à compléter]"));
});
