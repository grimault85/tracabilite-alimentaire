# Traçabilité DLC — application Android (PWA)

Photo de l'étiquette, lecture automatique de la DLC, alertes à J-3 et le
jour même. Fonctionne hors réseau.

## Pourquoi une PWA et pas un APK

Le même code React que le desktop, pas de Play Store, mise à jour
instantanée sans réinstallation. Un APK via Capacitor ne se justifierait
que pour une publication sur le Play Store, des notifications système
fiables, ou du traitement en arrière-plan. Rien de tout ça n'est
nécessaire ici — l'écran d'accueil coloré remplace la notification.

## Mise en place

### 1. La fonction qui porte la clé API

La clé Anthropic ne peut pas vivre dans le téléphone : un bundle JS est
lisible par n'importe qui. Elle reste dans une Edge Function Supabase.

```powershell
supabase functions deploy lire-etiquette
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set JETON_APP=un-jeton-au-hasard
```

Note l'URL renvoyée, de la forme
`https://<projet>.supabase.co/functions/v1/lire-etiquette`.

### 2. Variables d'environnement

En local, copie `.env.example` vers `.env` et remplis les deux valeurs.

Pour la publication, ajoute-les dans **Settings → Secrets and variables
→ Actions** du dépôt : `VITE_URL_EXTRACTION` et `VITE_JETON_APP`.

### 3. Publication

Le workflow `pages.yml` attend le projet dans un sous-dossier `mobile/`
du dépôt. Active ensuite **Settings → Pages → Source : GitHub Actions**.

L'app sera servie sur
`https://<compte>.github.io/tracabilite-alimentaire/`.

HTTPS est obligatoire : sans lui, ni caméra, ni service worker, ni
installation sur l'écran d'accueil. GitHub Pages le fournit.

### 4. Installation sur le téléphone

Ouvrir l'URL dans Chrome Android, puis menu **⋮ → Ajouter à l'écran
d'accueil**. L'app se lance ensuite en plein écran, sans barre
d'adresse, et le stockage devient persistant.

## Développement local

```powershell
npm install
npm run dev
```

`--host` est déjà dans le script : Vite affiche une adresse réseau que
tu peux ouvrir depuis ton téléphone sur le même wifi. La caméra ne
fonctionnera pas en HTTP sur un autre appareil — c'est normal, il faut
HTTPS. Pour tester la caméra depuis le téléphone avant publication,
passe par `npm run build` puis un tunnel HTTPS.

## Le hors-ligne

C'est le point qui décide de l'adoption. En chambre froide et en
réserve, il n'y a pas de wifi.

**La photo est enregistrée avant tout appel réseau.** Sans connexion,
l'étiquette part dans une file d'attente : le commis saisit la date à la
main, valide, et continue. Au retour du réseau, la lecture automatique
se fait toute seule en arrière-plan et complète le produit, la marque et
le GTIN.

**La DLC saisie à la main n'est jamais écrasée** par la lecture
différée. La correction humaine prime toujours.

## Où sont les données

Dans IndexedDB, sur le téléphone. Les photos sont stockées en Blob,
séparées des métadonnées pour que les listes restent rapides.

L'app demande la persistance du stockage au démarrage. Sans elle,
Android peut vider IndexedDB quand la mémoire se remplit — le navigateur
l'accorde en général aux PWA installées sur l'écran d'accueil, ce qui
est une raison de plus de ne pas rester sur un simple onglet.

## Ce que cette version ne fait pas

- **Pas de synchronisation.** Chaque téléphone a ses propres données.
  Le passage au multi-appareils demande de remplacer `stockage.js` par
  des appels Supabase, avec la file d'attente conservée telle quelle.
- **Pas de bons de livraison** ni de rattachement par GTIN.
- **Pas de notifications push.** Sur Android elles seraient possibles,
  mais l'écran d'accueil qui change de couleur est plus fiable et ne
  dépend d'aucune autorisation.
- **Le jeton d'application est visible** dans le bundle. Il limite
  l'usage de ta clé, il ne le sécurise pas. En multi-clients, il faut
  passer à l'authentification Supabase avec un compte par établissement.
