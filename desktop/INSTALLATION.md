# Installation

Cette archive contient le **code source**, pas un installeur prêt à
double-cliquer. Un `.exe` Windows ne peut pas être fabriqué depuis un
environnement Linux, et un `.dmg` macOS exige une machine macOS.

Deux chemins, selon ce que tu veux faire.

---

## A. Lancer l'application sur ton poste (5 minutes)

Prérequis : Node.js 20 ou plus (`node --version` pour vérifier).

```powershell
cd tracabilite-desktop
npm install
```

Le téléchargement d'Electron pèse environ 100 Mo, compte une à deux
minutes la première fois.

Ensuite, **deux terminaux** — Vite et Electron tournent en parallèle :

```powershell
npm run dev
```

```powershell
npm run dev:electron
```

La fenêtre s'ouvre. Va dans **Réglages**, colle ta clé API Anthropic,
enregistre. La lecture automatique est active.

---

## B. Fabriquer un vrai installeur

### Sur ta machine Windows

```powershell
npm install
npm run dist:win
```

L'installeur `.exe` sort dans `release/`.

### Par GitHub Actions (recommandé)

Le workflow est déjà dans `.github/workflows/build.yml`. Il construit
Windows et macOS en parallèle.

```powershell
git init
git add .
git commit -m "Traçabilité DLC v0.4"
git branch -M main
git remote add origin https://github.com/<toi>/tracabilite-dlc.git
git push -u origin main
git tag v0.4.0
git push origin v0.4.0
```

Le tag déclenche la construction. Les installeurs apparaissent dans
l'onglet Actions, en artefacts.

---

## Avertissements à l'installation

Les installeurs ne sont **pas signés**. Au premier lancement :

- **Windows** : écran bleu SmartScreen. *Informations complémentaires*
  puis *Exécuter quand même*.
- **macOS** : blocage Gatekeeper. Clic droit sur l'app puis *Ouvrir*,
  ou *Réglages Système → Confidentialité et sécurité → Ouvrir quand même*.

Acceptable pour un usage interne. Avant de livrer à un client, il faut
un certificat de signature : environ 300 à 500 € par an pour Windows
(OV/EV), 99 € par an pour l'Apple Developer Program.

---

## Où atterrissent les données

Windows : `%APPDATA%\tracabilite-dlc`
macOS : `~/Library/Application Support/tracabilite-dlc`

```
photos/AAAA-MM/<uuid>.jpg   Les photos d'étiquettes
donnees/etiquettes.json     L'index consultable
donnees/journal.jsonl       Journal chaîné SHA-256
donnees/config.json         Clé API et nom de l'établissement
```

Ce dossier survit aux mises à jour de l'application. C'est aussi lui
qu'il faut sauvegarder — rien d'autre.
