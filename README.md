# Le rédacteur : rédacteur de courriers administratifs

Le rédacteur prépare vos **courriers de réponse** et vos **notes au Directeur** à partir des dossiers imputés, dans la mise en page et le style de vos courriers déjà signés.

- **Modèles** : déposez tous vos courriers signés (Word de préférence, PDF, photos). L'application relève l'en-tête, les armoiries, les références, la ville et la date en blanc, le destinataire, l'objet, les formules d'appel et de politesse, l'ampliation et le pied de page.
- **Lucarne des dossiers imputés** : glissez le dossier imputé par le Directeur (courrier reçu, fiche d'imputation, pièces). L'application en tire le demandeur, les références, l'instruction du Directeur, l'échéance et les points à vérifier.
- **Pièces justificatives** : ajoutez-les au dossier ; cochez « P.J. » pour les mentionner dans le courrier.
- **Rédaction** : choisissez « Courrier de réponse » ou « Note au Directeur », écrivez vos consignes (une idée par ligne), puis relisez le projet sur une page A4 modifiable.
- **Éditeur** : modèles à appliquer, options d'édition (en-tête, date, références, pied de page), police, taille, alignement, interligne, aperçu, annuler et rétablir, retouches (« plus court », « ton plus ferme »…).
- **Relecture** : les tournures qui sonnent « texte généré » sont repérées et signalées dans « Avant signature » (module `lib/relecture.ts`).
- **Export** en Word (`.docx`) et en PDF, impression directe.

L'espace de signature reste vide : le Directeur signe à la main.

## Installer sur Windows

Téléchargez le dernier `Le-redacteur-Setup-*.exe` dans les [releases](../../releases), puis double-cliquez dessus. Vos données sont stockées dans `%APPDATA%\Le redacteur`.

Windows peut afficher « Windows a protégé votre ordinateur », car l'installateur n'est pas signé : cliquez sur « Informations complémentaires », puis « Exécuter quand même ».

## Mode démo et rédaction par Claude

Sans clé d'API, l'application fonctionne en **mode démo** : elle lit les courriers Word, les PDF texte et les fichiers texte, reprend la mise en page et les formules de vos modèles et assemble le projet à partir de vos consignes. Les photos et les PDF scannés sont lus sur l'ordinateur, sans Internet ni clé, par reconnaissance de caractères (Tesseract, en français) ; un scan pâle ou de travers se lit moins bien.

Avec une clé Claude (page **Paramètres**, ou variable `ANTHROPIC_API_KEY`), elle lit tout le dossier, scans compris, analyse la demande et rédige dans votre style, puis fait une seconde relecture.

| Variable | Rôle |
|---|---|
| `ANTHROPIC_API_KEY` | Analyse et rédaction avec Claude (https://console.anthropic.com) |
| `APP_PASSWORD` | Mot de passe facultatif, utile si l'application est en ligne |
| `DATA_DIR` | Dossier des données (`./data` par défaut) |

## Lancer depuis le code

Il faut [Node.js](https://nodejs.org) 22.13 ou plus récent.

```bash
npm install
npm run build
npm start
```

Puis ouvrez http://localhost:3000. Pour développer : `npm run dev`. Tests de la relecture : `node --test scripts/test-relecture.mjs`.

## Où sont mes données ?

Tout reste sur l'ordinateur, dans le dossier des données : la base SQLite `redacteur.db` et les fichiers déposés dans `fichiers/`. Avec une clé Claude, le contenu d'un dossier est envoyé à Claude au moment de l'analyse et de la rédaction.

## Construire l'installateur Windows

Le workflow GitHub `Installateur Windows` construit le `.exe` sur une machine Windows et le publie dans une release à chaque tag `v*`, ou quand on le lance à la main depuis l'onglet Actions en indiquant une version.

En local : `npm run build`, `npm run desktop:prepare`, puis dans `desktop/` : `npm install` et `npm run dist:win`.

## Technique

- Next.js 16 (App Router) et React 19, TypeScript
- SQLite intégré à Node (`node:sqlite`), sans dépendance native
- Lecture des fichiers : `mammoth` (Word), `unpdf` (PDF), `jszip` (en-têtes, pieds de page et images des `.docx`, OpenDocument)
- Export Word avec `docx` ; export PDF par Electron (`printToPDF`)
- Claude (`claude-opus-5-5`) via le SDK officiel `@anthropic-ai/sdk`, sorties structurées, cache du bloc des courriers signés
- Application de bureau Electron (dossier `desktop/`) qui embarque le serveur Next.js autonome, installateur NSIS pour Windows
