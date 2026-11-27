// Tests de lib/sources.ts : node --test scripts/test-sources.mjs
// Les textes ci-dessous sont fictifs (références et montants inventés pour l'essai).
import { test } from "node:test";
import assert from "node:assert/strict";
import { citations, controlerReferences, referencesSansAppui, TITRES_SOURCES } from "../lib/sources.ts";

const RECU = `N°112/2026/MESRS/CROU-B/D/SDAF                Bouaké, le 3 novembre 2026
J'ai l'honneur de vous transmettre, pour visa, la décision N°07/2026/MESRS/CROU-B/D du 28 octobre 2026 portant modification de la ventilation du budget de l'exercice 2026 du CROU-B.
Cette modification porte sur un montant de quinze millions (15 000 000) FCFA.`;

const SIGNE = `Conformément à l'article 30 du décret n° 2014-416 du 12 juillet 2014 fixant les règles budgétaires des EPN, les transferts entre natures relèvent de l'arrêté du Ministre chargé du Budget.`;

/** Les courriers signés, comme la recherche en base les voit. */
const ailleurs = (fragments) => fragments.some((f) => SIGNE.toLowerCase().includes(f));

function projet(corps) {
  return { objet: "Demande de visa", vref: "", destinataire: "", appel: "Monsieur le Directeur,", corps, politesse: "", pj: [], ampliation: [], remarques: [] };
}

test("relève les références et les articles, rattachés à leur texte", () => {
  const c = citations("Or, selon les dispositions de l’article 12 du décret N°2020-1234 du 15 décembre 2020 fixant les règles budgétaires et financières applicables aux EPN, les transferts…");
  assert.equal(c.length, 1);
  assert.equal(c[0].nature, "texte");
  assert.equal(c[0].numero, "2020-1234");
  assert.deepEqual(c[0].articles, ["12"]);
  assert.match(c[0].extrait, /^l’article 12 du décret N°2020-1234 du 15 décembre 2020 fixant .* aux EPN$/);
});

test("une référence inventée est retirée du projet et signalée", () => {
  const r = controlerReferences(
    projet([
      "Par courrier N°112/2026/MESRS/CROU-B/D/SDAF en date du 3 novembre 2026, vous m'avez transmis, pour visa, la décision N°07/2026/MESRS/CROU-B/D du 28 octobre 2026.",
      "Or, selon les dispositions de l’article 12 du décret N°2020-1234 du 15 décembre 2020 fixant les règles budgétaires et financières applicables aux établissements publics nationaux, les transferts de crédits relèvent de la compétence du Ministre chargé du Budget.",
    ]),
    { textes: [RECU], ailleurs },
  );
  assert.equal(r.corps[0].includes("N°112/2026/MESRS/CROU-B/D/SDAF"), true);
  assert.equal(r.corps[0].includes("N°07/2026/MESRS/CROU-B/D"), true);
  assert.equal(
    r.corps[1],
    "Or, selon les dispositions de [à compléter : texte applicable], les transferts de crédits relèvent de la compétence du Ministre chargé du Budget.",
  );
  assert.equal(r.remarques.length, 1);
  assert.ok(r.remarques[0].startsWith(TITRES_SOURCES[0]));
  assert.match(r.remarques[0], /décret N°2020-1234/);
});

test("une référence des courriers signés ou des pièces est gardée", () => {
  const texte = "Conformément aux dispositions de l'article 30 du décret N°2014-416 du 12 juillet 2014, je vous retourne la décision n° 07/2026/MESRS/CROU-B/D revêtue de mon visa.";
  const r = controlerReferences(projet([texte]), { textes: [RECU], ailleurs });
  assert.equal(r.corps[0], texte);
  assert.deepEqual(r.remarques, []);
});

test("un article inconnu d'un texte connu est signalé, sans toucher au texte", () => {
  const texte = "En application de l'article 45 du décret n°2014-416 du 12 juillet 2014, la décision doit être visée.";
  const r = controlerReferences(projet([texte]), { textes: [RECU], ailleurs });
  assert.equal(r.corps[0], texte);
  assert.equal(r.remarques.length, 1);
  assert.ok(r.remarques[0].startsWith(TITRES_SOURCES[1]));
});

test("une décision ou un courrier aux numéros inventés sont aussi retirés", () => {
  const r = controlerReferences(projet(["Votre courrier N°0999/2026/CROU-B/D du 2 novembre 2026 transmet la décision N°08/2026/MESRS/CROU-B/D."]), {
    textes: [RECU],
    ailleurs,
  });
  assert.equal(r.corps[0], "Votre [à compléter : référence du courrier] transmet [à compléter : référence de la décision].");
  assert.equal(r.remarques.length, 2);
});

test("une référence donnée par l'agent dans ses consignes est gardée", () => {
  const texte = "Conformément à la circulaire N°005/MFB/DGBF du 4 mars 2025, la demande ne peut être satisfaite.";
  const r = controlerReferences(projet([texte]), { textes: [RECU, "Citer la circulaire n° 005/MFB/DGBF du 4 mars 2025."] });
  assert.equal(r.corps[0], texte);
});

test("les mentions sans numéro ni date ne sont pas contrôlées", () => {
  const texte = "Les transferts entre natures relèvent de l'arrêté du Ministre chargé du Budget et de la loi de finances.";
  const r = controlerReferences(projet([texte]), { textes: [] });
  assert.equal(r.corps[0], texte);
  assert.deepEqual(r.remarques, []);
});

test("un nouveau contrôle remplace les remarques du précédent", () => {
  const avant = projet(["Selon le décret N°2020-1234, la demande est rejetée."]);
  const une = controlerReferences(avant, { textes: [] });
  const deux = controlerReferences({ ...une, corps: avant.corps }, { textes: [] });
  assert.equal(deux.remarques.length, 1);
});

test("l'analyse signale les références sans appui", () => {
  const points = referencesSansAppui(
    ["Le transfert relève de l'article 12 du décret N°2020-1234 du 15 décembre 2020.", "La décision N°07/2026/MESRS/CROU-B/D du 28 octobre 2026 est jointe."],
    { textes: [RECU], ailleurs },
  );
  assert.equal(points.length, 1);
  assert.match(points[0], /2020-1234/);
});
