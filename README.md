# Le rédacteur

Le rédacteur enregistre ou importe tes contenus audio et vidéo (cours, réunions, entretiens, idées), les transcrit en reconnaissant les intervenants, puis rédige une note claire :

- **L'essentiel** en 2 ou 3 phrases
- un **résumé** structuré
- les **questions ouvertes**
- les **actions** à faire, à cocher

Un **assistant** répond à tes questions sur l'ensemble de tes notes, et peut produire un QCM, des fiches de révision ou un plan.

L'appli tourne sur ton ordinateur, et s'installe comme une appli de bureau depuis Chrome ou Edge (icône « Installer » dans la barre d'adresse).

## Démarrer

Il faut [Node.js](https://nodejs.org) 22.13 ou plus récent.

```bash
npm install
cp .env.example .env.local   # facultatif, voir plus bas
npm run build
npm start
```

Puis ouvre http://localhost:3000.

Pour développer avec rechargement automatique : `npm run dev`.

## Mode démo et vraie IA

Sans clé d'API, l'appli fonctionne en **mode démo** : chaque fichier envoyé reçoit une transcription d'exemple et une note construite par des règles simples. Cela permet d'essayer tout le parcours.

Pour activer la vraie IA, remplis `.env.local` :

| Variable | Rôle | Où l'obtenir |
|---|---|---|
| `DEEPGRAM_API_KEY` | Transcription avec identification des intervenants (modèle nova-3) | https://console.deepgram.com |
| `ANTHROPIC_API_KEY` | Rédaction des notes et assistant, avec Claude | https://console.anthropic.com |
| `TRANSCRIPTION_LANGUAGE` | Langue parlée (`fr` par défaut, `multi` pour plusieurs langues) | |
| `APP_PASSWORD` | Mot de passe facultatif, utile si l'appli est en ligne | |
| `DATA_DIR` | Dossier des données (`./data` par défaut) | |

Les deux clés sont indépendantes : tu peux n'en activer qu'une.

## Où sont mes données ?

Tout reste sur ta machine, dans le dossier `data/` : la base SQLite `redacteur.db` et les fichiers d'origine dans `data/media/`. Seuls les envois à Deepgram (le fichier) et à Claude (le texte) sortent, et uniquement si les clés sont configurées.

## Technique

- Next.js 16 (App Router) et React 19, TypeScript
- SQLite intégré à Node (`node:sqlite`), sans dépendance native
- Deepgram pour la transcription, Claude (`claude-opus-5-5`) via le SDK officiel `@anthropic-ai/sdk` pour les notes (sortie structurée) et l'assistant (réponse en streaming)
- Application web progressive (manifeste et service worker) pour l'installation sur le bureau

## Pistes pour la suite

- Import de PDF, de photos et de documents scannés
- Import d'une vidéo YouTube par son lien
- QCM et fiches de révision interactifs
- Export vers Notion ou un gestionnaire de tâches
- Appli de bureau native (Tauri ou Electron) pour enregistrer le son du système pendant les appels
