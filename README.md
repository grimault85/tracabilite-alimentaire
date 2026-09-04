# Traçabilité alimentaire

Archivage des étiquettes fournisseurs et alertes DLC pour la
restauration. Deux applications, un socle commun.

| | Rôle | Technique |
|---|---|---|
| **`mobile/`** | Poste de terrain — le commis photographie l'étiquette en chambre froide | PWA React, IndexedDB, hors-ligne |
| **`desktop/`** | Poste d'archivage — le chef consulte, exporte, vérifie le registre | Electron, stockage fichier, journal chaîné |
| **`supabase/`** | Socle commun — schéma SQL multi-clients et Edge Function | PostgreSQL + RLS, Deno |

## Le principe

Le commis photographie l'étiquette. Un modèle vision en extrait la DLC,
le lot, la marque et le GTIN. Une seule information est présentée à
valider : **la date**. Le reste est enregistré sans être montré, parce
qu'en cas de contrôle ou de rappel, la preuve est la photo, pas les
champs extraits.

L'écran d'accueil change de couleur selon l'état de la cuisine : rouge
si un produit est périmé, orange au dernier jour, vert sinon. C'est ce
qui remplace la notification push, inutilisable en réserve.

## Démarrage rapide

### Mobile

```powershell
cd mobile
npm install
npm run dev
```

Nécessite l'Edge Function déployée pour la lecture automatique
(voir `mobile/README.md`). Sans elle, la saisie manuelle fonctionne.

### Desktop

```powershell
cd desktop
npm install
npm run dev          # terminal 1
npm run dev:electron # terminal 2
```

Puis **Réglages → clé API Anthropic**.

## Publication

| Déclencheur | Effet |
|---|---|
| `git push origin v0.4.2` | Construit les installeurs Windows et macOS, crée la Release |
| Push sur `main` touchant `mobile/` | Reconstruit et publie la PWA sur GitHub Pages |

Secrets à définir dans **Settings → Secrets and variables → Actions** :
`VITE_URL_EXTRACTION` et `VITE_JETON_APP`.

Pages doit être réglé sur **Settings → Pages → Source : GitHub Actions**.

## Où vit la clé API

Nulle part dans le code, et jamais dans le téléphone.

- **Mobile** : dans l'Edge Function Supabase, secret `ANTHROPIC_API_KEY`.
  Le bundle servi au navigateur ne contient qu'une URL et un jeton
  d'usage.
- **Desktop** : dans `config.json` du dossier de données utilisateur,
  lue par le processus principal uniquement. La fenêtre ne la voit
  jamais.

Le jeton `VITE_JETON_APP` est visible dans le bundle mobile. Il limite
l'usage de la clé, il ne le sécurise pas. En multi-clients, il faudra
passer à l'authentification Supabase avec un compte par établissement.

## Base de données

Les migrations dans `supabase/migrations/` s'appliquent dans l'ordre —
la 002 fait des `alter table` sur des tables créées par la 001.

- **001** : établissements, profils, étiquettes, RLS par établissement,
  vue d'alertes
- **002** : bons de livraison, lignes de BL, rattachement par GTIN

Le cloisonnement entre clients est fait par les policies RLS, pas dans
le code applicatif. C'est le seul niveau de garantie sérieux en
multi-clients.

Aucune des deux applications n'utilise encore ce schéma : elles
stockent en local. La bascule consiste à remplacer
`desktop/electron/stockage.js` et `mobile/src/stockage.js` par des
appels réseau, en gardant la file d'attente hors-ligne du mobile.

## Ce qui reste à faire

- **Validation terrain chez un client pilote** avant tout déploiement.
  C'est l'étape qui décide si le projet vaut la peine, et elle ne coûte
  rien : le commis photographie ses étiquettes dans un album pendant une
  semaine, et on regarde s'il tient la distance.
- Signature des installeurs (SmartScreen, Gatekeeper)
- Rattachement GTIN sur le desktop, avec import des BL
- Synchronisation multi-appareils vers Supabase
- Politique de conservation des BL — ils contiennent des données
  personnelles (téléphones, codes d'accès du site)
