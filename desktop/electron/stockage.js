/* =====================================================================
   Stockage local
   - Photos : fichiers JPEG dans userData/photos/AAAA-MM/
   - Index  : userData/donnees/etiquettes.json, écrit de façon atomique
   - Journal: userData/donnees/journal.jsonl, append-only, chaîné SHA-256

   Pourquoi pas SQLite : aucun module natif à recompiler pour chaque
   version d'Electron. À quelques milliers de lignes sur 6 mois, un
   index JSON chargé en mémoire reste largement suffisant. Le jour où
   le volume gêne, seul ce fichier est à réécrire.
   ===================================================================== */

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const { app } = require("electron");

let RACINE, DOSSIER_PHOTOS, DOSSIER_DONNEES, FICHIER_INDEX, FICHIER_JOURNAL, FICHIER_CONFIG;

function initialiser() {
  RACINE = app.getPath("userData");
  DOSSIER_PHOTOS = path.join(RACINE, "photos");
  DOSSIER_DONNEES = path.join(RACINE, "donnees");
  FICHIER_INDEX = path.join(DOSSIER_DONNEES, "etiquettes.json");
  FICHIER_JOURNAL = path.join(DOSSIER_DONNEES, "journal.jsonl");
  FICHIER_CONFIG = path.join(DOSSIER_DONNEES, "config.json");
  fs.mkdirSync(DOSSIER_PHOTOS, { recursive: true });
  fs.mkdirSync(DOSSIER_DONNEES, { recursive: true });
}

const dossierPhotos = () => DOSSIER_PHOTOS;

/* ------------------- Écriture atomique -------------------
   Écrire dans un fichier temporaire puis renommer. Une coupure
   de courant pendant l'écriture ne peut pas corrompre l'index :
   soit l'ancien fichier est intact, soit le nouveau est complet.
   -------------------------------------------------------- */
async function ecrireAtomique(chemin, contenu) {
  const temporaire = `${chemin}.${process.pid}.tmp`;
  await fsp.writeFile(temporaire, contenu, "utf8");
  await fsp.rename(temporaire, chemin);
}

/* ------------------- Index des étiquettes ------------------- */

async function lireIndex() {
  try {
    return JSON.parse(await fsp.readFile(FICHIER_INDEX, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    // Index illisible : on le met de côté plutôt que de l'écraser.
    const secours = `${FICHIER_INDEX}.corrompu-${Date.now()}`;
    await fsp.rename(FICHIER_INDEX, secours).catch(() => {});
    throw new Error(
      `Index illisible, sauvegardé sous ${path.basename(secours)}. ` +
      `Les photos et le journal sont intacts : l'index peut être reconstruit.`
    );
  }
}

async function ecrireIndex(liste) {
  await ecrireAtomique(FICHIER_INDEX, JSON.stringify(liste, null, 2));
}

/* ------------------- Journal chaîné -------------------
   Chaque entrée porte le hash de la précédente. Modifier ou
   supprimer une ligne a posteriori casse la chaîne, ce qui se
   détecte. C'est ce qui rend le registre opposable.
   ------------------------------------------------------ */

async function dernierHash() {
  try {
    const contenu = await fsp.readFile(FICHIER_JOURNAL, "utf8");
    const lignes = contenu.trim().split("\n").filter(Boolean);
    if (!lignes.length) return "0".repeat(64);
    return JSON.parse(lignes[lignes.length - 1]).hash;
  } catch (e) {
    if (e.code === "ENOENT") return "0".repeat(64);
    throw e;
  }
}

async function journaliser(action, charge) {
  const entree = {
    horodatage: new Date().toISOString(),
    action,                       // creation | correction | purge
    charge,
    hash_precedent: await dernierHash(),
  };
  entree.hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({ ...entree, hash: undefined }))
    .digest("hex");
  await fsp.appendFile(FICHIER_JOURNAL, JSON.stringify(entree) + "\n", "utf8");
  return entree.hash;
}

async function verifierJournal() {
  let contenu;
  try {
    contenu = await fsp.readFile(FICHIER_JOURNAL, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") return { valide: true, entrees: 0 };
    throw e;
  }
  const lignes = contenu.trim().split("\n").filter(Boolean);
  let precedent = "0".repeat(64);
  for (let i = 0; i < lignes.length; i++) {
    const e = JSON.parse(lignes[i]);
    if (e.hash_precedent !== precedent) {
      return { valide: false, entrees: lignes.length, rupture: i + 1,
               motif: "Chaînage rompu : une entrée a été retirée ou insérée." };
    }
    const recalcule = crypto.createHash("sha256")
      .update(JSON.stringify({ ...e, hash: undefined })).digest("hex");
    if (recalcule !== e.hash) {
      return { valide: false, entrees: lignes.length, rupture: i + 1,
               motif: "Contenu modifié après enregistrement." };
    }
    precedent = e.hash;
  }
  return { valide: true, entrees: lignes.length };
}

/* ------------------- Photos ------------------- */

async function enregistrerPhoto(buffer) {
  const mois = new Date().toISOString().slice(0, 7);   // AAAA-MM
  const dossier = path.join(DOSSIER_PHOTOS, mois);
  await fsp.mkdir(dossier, { recursive: true });
  const nom = `${crypto.randomUUID()}.jpg`;
  await fsp.writeFile(path.join(dossier, nom), buffer);
  return `${mois}/${nom}`;   // chemin relatif, servi par le protocole photo://
}

/* ------------------- Opérations ------------------- */

async function ajouterEtiquette(donnees, photoBuffer) {
  const photoPath = photoBuffer ? await enregistrerPhoto(photoBuffer) : null;
  const etiquette = {
    id: crypto.randomUUID(),
    ...donnees,
    photoPath,
    dateScan: new Date().toISOString().slice(0, 10),
    creeLe: new Date().toISOString(),
  };
  const liste = await lireIndex();
  liste.unshift(etiquette);
  await ecrireIndex(liste);
  etiquette.hashJournal = await journaliser("creation", {
    id: etiquette.id, produit: etiquette.produit, lot: etiquette.lot,
    dlc: etiquette.dlc, gtin: etiquette.gtin, photoPath,
  });
  return etiquette;
}

async function corrigerEtiquette(id, champs) {
  const liste = await lireIndex();
  const i = liste.findIndex((e) => e.id === id);
  if (i === -1) throw new Error("Étiquette introuvable.");
  const avant = { ...liste[i] };
  liste[i] = { ...liste[i], ...champs, modifieLe: new Date().toISOString() };
  await ecrireIndex(liste);
  // On journalise l'avant ET l'après : une correction ne doit jamais
  // effacer ce qui a été saisi initialement.
  await journaliser("correction", { id, avant, apres: liste[i] });
  return liste[i];
}

/* Purge après rétention. Ne supprime jamais le journal :
   la trace de ce qui a existé doit survivre à la photo. */
async function purger(moisRetention = 6) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - moisRetention);
  const limiteIso = limite.toISOString().slice(0, 10);

  const liste = await lireIndex();
  const aPurger = liste.filter((e) => e.dateScan < limiteIso);
  const restant = liste.filter((e) => e.dateScan >= limiteIso);

  for (const e of aPurger) {
    if (e.photoPath) {
      await fsp.unlink(path.join(DOSSIER_PHOTOS, e.photoPath)).catch(() => {});
    }
  }
  await ecrireIndex(restant);
  if (aPurger.length) {
    await journaliser("purge", {
      moisRetention, avant: limiteIso,
      ids: aPurger.map((e) => e.id), nombre: aPurger.length,
    });
  }
  return { supprimees: aPurger.length, restantes: restant.length };
}

/* ------------------- Export CSV pour contrôle ------------------- */

function echapper(v) {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function exporterCsv() {
  const liste = await lireIndex();
  const colonnes = ["dateScan","produit","marque","fournisseur","gtin","lot","dlc","source","confiance","photoPath"];
  const entete = ["Date de scan","Produit","Marque","Fournisseur","GTIN","Lot","DLC","Saisie","Confiance","Photo"];
  const lignes = [entete.join(";")];
  for (const e of [...liste].sort((a, b) => (a.dlc || "").localeCompare(b.dlc || ""))) {
    lignes.push(colonnes.map((c) => echapper(e[c])).join(";"));
  }
  return "\uFEFF" + lignes.join("\r\n");   // BOM : Excel FR ouvre en UTF-8
}

/* ------------------- Configuration ------------------- */

async function lireConfig() {
  try {
    return JSON.parse(await fsp.readFile(FICHIER_CONFIG, "utf8"));
  } catch { return { cleApi: "", etablissement: "" }; }
}

async function ecrireConfig(config) {
  const actuel = await lireConfig();
  const fusion = { ...actuel, ...config };
  await ecrireAtomique(FICHIER_CONFIG, JSON.stringify(fusion, null, 2));
  return fusion;
}

module.exports = {
  initialiser, dossierPhotos, lireIndex, ajouterEtiquette, corrigerEtiquette,
  purger, exporterCsv, verifierJournal, lireConfig, ecrireConfig,
};
