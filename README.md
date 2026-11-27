# Le rédacteur : rédacteur de courriers administratifs

Le rédacteur prépare vos **courriers de réponse** et vos **notes au Directeur** à partir des dossiers imputés, dans la mise en page et le style de vos courriers déjà signés.

- **Modèles** : déposez tous vos courriers signés (Word, PDF, scans, photos), autant que vous voulez. L'application relève l'en-tête, les armoiries, les références, la ville et la date en blanc, le destinataire, l'objet, les formules d'appel et de politesse, l'ampliation et le pied de page.
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

## Tout sur l'ordinateur, sans Internet

L'application n'a besoin ni de clé ni d'Internet. Elle lit les courriers Word, les PDF et les fichiers texte, reprend la mise en page et les formules de vos modèles et assemble le projet à partir de vos consignes.

Les photos et les PDF scannés sont lus sur l'ordinateur par reconnaissance de caractères (Tesseract, en français). La lecture tourne **en arrière-plan**, un fichier après l'autre, pendant que vous travaillez ; la barre d'état indique la progression. Si l'application est fermée en cours de route, la lecture reprend au démarrage suivant. Un scan pâle ou de travers se lit moins bien : vérifiez l'en-tête dans « Réglages du modèle ».

## Rédaction par le modèle installé sur l'ordinateur

Pour des projets vraiment rédigés (et des retouches libres : « citer l'article 64 », « ajouter un rappel du délai »…), installez le modèle de rédaction depuis les **Paramètres** : **Ministral 3 8B** (Mistral AI, licence Apache 2.0, fichier GGUF `Q4_K_M` de 5,2 Go). Il est téléchargé une seule fois depuis Hugging Face, vérifié (empreinte SHA-256), puis tout se fait sans Internet.

- Le téléchargement passe par le réseau du système (proxy et certificats de Windows), reprend tout seul après une coupure et peut être mis en pause ; il repart là où il s'était arrêté, même après la fermeture de l'appli. « J'ai déjà le fichier » permet de l'installer depuis une clé USB.
- Le modèle tourne avec [llama.cpp](https://github.com/ggml-org/llama.cpp) (`llama-server`, licence MIT), livré avec l'appli. Il démarre à la première demande et s'arrête après dix minutes sans travail pour rendre la mémoire.
- Il analyse les dossiers, rédige les courriers et les notes, fait la seconde passe de relecture anti-IA et les retouches, avec les mêmes consignes que Claude (`lib/consignes.ts`), resserrées pour tenir dans 8 192 jetons (`lib/local.ts`). Réponses contraintes par schéma JSON.
- Les références citées par le modèle (lois, décrets, arrêtés, décisions, courriers, articles) sont contrôlées (`lib/sources.ts`) : celles qui ne figurent ni dans les pièces du dossier, ni dans les courriers signés, ni dans les consignes sont remplacées par [à compléter] et signalées dans les remarques.
- Mémoire : 8 Go au moins, 16 Go conseillés. Comptez quelques minutes par projet sur un ordinateur de bureau ; l'avancement s'affiche dans le dossier et dans le projet.
- Sans le modèle, ou s'il échoue, le projet est assemblé à partir des consignes et des formules des courriers signés, comme avant.

## Gros volumes

- Dépôt de centaines de fichiers, ou d'un dossier entier glissé dans la zone de dépôt : l'envoi se fait par lots de 20 fichiers, puis les courriers sont lus deux à la fois en file d'attente.
- Recherche plein texte (SQLite FTS5, sans tenir compte des accents) dans les modèles, les dossiers, le texte de leurs pièces et les projets rédigés.
- Listes affichées par pages de 50 (« Afficher plus »).
- Sauvegarde automatique de la base une fois par jour dans `sauvegardes/` (les dix dernières sont gardées), et bouton « Sauvegarder maintenant » dans les Paramètres.
- Essai : 1 040 fichiers (1 000 courriers texte et 40 scans) déposés d'un coup ; les courriers texte sont lus en quelques secondes, les 40 scans en 75 secondes en arrière-plan, et une recherche répond en moins de 10 ms.

| Variable | Rôle |
|---|---|
| `APP_PASSWORD` | Mot de passe facultatif, utile si l'application est en ligne |
| `DATA_DIR` | Dossier des données (`./data` par défaut) |
| `ANTHROPIC_API_KEY` | Facultatif, pour une installation web seulement : analyse et rédaction par Claude. L'appli de bureau ne l'utilise pas. |
| `MODELES_DIR` | Dossier du modèle de rédaction (`<DATA_DIR>/modeles` par défaut ; `%APPDATA%\Le redacteur\modeles` dans l'appli de bureau) |
| `LLAMA_SERVER` | Chemin de `llama-server` (`llama-server` du PATH par défaut) |
| `MODELE_GGUF`, `LLAMA_URL` | Développement : un autre fichier GGUF, ou un serveur llama.cpp déjà lancé |

## Lancer depuis le code

Il faut [Node.js](https://nodejs.org) 22.13 ou plus récent.

```bash
npm install
npm run build
npm start
```

Puis ouvrez http://localhost:3000. Pour développer : `npm run dev`. Tests de la relecture et du contrôle des références : `node --test scripts/test-relecture.mjs scripts/test-sources.mjs`.

## Où sont mes données ?

Tout reste sur l'ordinateur, dans le dossier des données : la base SQLite `redacteur.db`, les fichiers déposés dans `fichiers/` et les sauvegardes dans `sauvegardes/`. Rien n'est envoyé sur Internet.

## Construire l'installateur Windows

Le workflow GitHub `Installateur Windows` construit le `.exe` sur une machine Windows et le publie dans une release à chaque tag `v*`, ou quand on le lance à la main depuis l'onglet Actions en indiquant une version.

En local : `npm run build`, `npm run desktop:prepare`, puis dans `desktop/` : `npm install` et `npm run dist:win`.

## Technique

- Next.js 16 (App Router) et React 19, TypeScript
- SQLite intégré à Node (`node:sqlite`), sans dépendance native
- Lecture des fichiers : `mammoth` (Word), `unpdf` (PDF), `jszip` (en-têtes, pieds de page et images des `.docx`, OpenDocument)
- Lecture des scans : `pdfjs-dist` et `tesseract.js` dans la page, fichiers copiés dans `public/ocr` par `scripts/copier-ocr.mjs`
- Recherche : index FTS5 de SQLite ; traitements en file d'attente (`lib/file-attente.ts`), reprise au démarrage (`instrumentation.ts`)
- Export Word avec `docx` ; export PDF par Electron (`printToPDF`)
- Modèle local : Ministral 3 8B Instruct (GGUF Q4_K_M) servi par `llama-server` (llama.cpp, version processeur pour Windows, ajoutée par le workflow dans `desktop/llama`), API compatible OpenAI en flux, `response_format` JSON Schema (`lib/modele.ts`, `lib/local.ts`) ; téléchargement par Electron (`desktop/modele.cjs`)
- Installation web avec clé : Claude (`claude-opus-5-5`) via le SDK officiel `@anthropic-ai/sdk`, sorties structurées
- Application de bureau Electron (dossier `desktop/`) qui embarque le serveur Next.js autonome, installateur NSIS pour Windows
