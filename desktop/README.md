# Traçabilité DLC — application desktop

Archivage des étiquettes fournisseurs : photo, lecture automatique de la DLC,
alertes à J-3 et le jour même, registre exportable.

## Démarrage

```powershell
npm install
```

Deux terminaux, parce que Vite et Electron tournent en parallèle :

```powershell
npm run dev
```

```powershell
npm run dev:electron
```

Au premier lancement, aller dans **Réglages** et saisir la clé API Anthropic.
Sans elle, la lecture automatique est désactivée mais la saisie manuelle
fonctionne.

## Empaquetage

```powershell
npm run dist:win
```

Les installeurs sortent dans `release/`. La CI construit Windows et macOS
sur push d'un tag `v*`.

## Où sont les données

Dans le dossier de données utilisateur d'Electron
(`%APPDATA%\tracabilite-dlc` sous Windows,
`~/Library/Application Support/tracabilite-dlc` sous macOS) :

```
photos/2026-08/<uuid>.jpg     Les photos, telles que prises
donnees/etiquettes.json       L'index consultable
donnees/journal.jsonl         Journal append-only, chaîné SHA-256
donnees/config.json           Clé API et nom de l'établissement
```

**Pourquoi pas SQLite** : aucun module natif à recompiler à chaque montée
de version d'Electron. Quelques milliers de lignes sur six mois se
chargent en mémoire sans difficulté. Si le volume devient gênant, seul
`electron/stockage.js` est à réécrire — le reste de l'application ne
connaît que l'API IPC.

**Écriture atomique** : l'index est écrit dans un fichier temporaire puis
renommé. Une coupure pendant l'écriture laisse soit l'ancien fichier
intact, soit le nouveau complet, jamais un fichier à moitié écrit.

**Journal chaîné** : chaque entrée porte l'empreinte de la précédente.
Retirer ou modifier une ligne casse la chaîne, et *Réglages → Vérifier
l'intégrité* le détecte. C'est ce qui distingue un registre opposable
d'un simple fichier de notes.

## Ce que cette version ne fait pas

- **La caméra dépend du matériel.** La prise de vue directe fonctionne
  (webcam, ou caméra arrière sur tablette Windows via le sélecteur), mais
  un poste fixe ne suivra pas le commis en chambre froide. Import par
  fichier, glisser-déposer et Ctrl+V restent disponibles.
- **Pas de bons de livraison.** Le rattachement par GTIN existe dans le
  prototype web mais n'est pas repris ici.
- **Pas de synchronisation.** Les données restent sur le poste. La
  bascule vers Supabase demandera de remplacer la couche `stockage.js`
  par des appels réseau, avec file d'attente hors-ligne.
- **La clé API est en clair** dans `config.json`. Acceptable sur un poste
  interne, insuffisant pour un déploiement chez plusieurs clients : il
  faudra un serveur intermédiaire qui porte la clé.
- **Installeurs non signés.** Windows affichera un avertissement
  SmartScreen, macOS un blocage Gatekeeper. Un certificat de signature
  est nécessaire avant toute diffusion à un client.

## Purge

`etiquettes:purger` supprime les étiquettes et leurs photos au-delà de la
rétention (6 mois par défaut) et journalise l'opération. Le journal, lui,
n'est jamais purgé : la trace de ce qui a existé doit survivre à la photo.
Aucun bouton ne déclenche la purge pour l'instant — c'est volontaire,
une suppression de masse ne doit pas être à un clic.
