const { app, BrowserWindow, ipcMain, protocol, net, dialog } = require("electron");
const path = require("node:path");
const fsp = require("node:fs/promises");
const { pathToFileURL } = require("node:url");
const { autoUpdater } = require("electron-updater");
const stockage = require("./stockage");
const { lireEtiquette } = require("./extraction");

const DEV = !!process.env.MODE_DEV;

/* Protocole dédié pour servir les photos.
   file:// est bloqué depuis un renderer sécurisé, et un serveur HTTP
   sur port aléatoire changerait d'origine à chaque lancement. */
protocol.registerSchemesAsPrivileged([
  { scheme: "photo", privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

function creerFenetre() {
  const fenetre = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 900,
    minHeight: 640,
    backgroundColor: "#EEF1F0",
    title: "Traçabilité DLC",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (DEV) {
    fenetre.loadURL("http://localhost:5173");
  } else {
    fenetre.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  /* Caméra : Electron refuse les permissions média par défaut.
     On n'autorise que "media", rien d'autre (ni micro seul, ni
     géolocalisation, ni notifications). */
  const session = fenetre.webContents.session;
  session.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(permission === "media");
  });
  session.setPermissionCheckHandler((_wc, permission) => permission === "media");

  return fenetre;
}

app.whenReady().then(() => {
  stockage.initialiser();

  protocol.handle("photo", async (requete) => {
    try {
      const relatif = decodeURIComponent(new URL(requete.url).pathname).replace(/^\/+/, "");
      const racine = stockage.dossierPhotos();
      const complet = path.normalize(path.join(racine, relatif));
      // Empêche toute sortie du dossier photos via ../
      if (!complet.startsWith(racine)) return new Response("", { status: 403 });
      return net.fetch(pathToFileURL(complet).toString());
    } catch {
      return new Response("", { status: 404 });
    }
  });

  creerFenetre();

  if (!DEV) {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) creerFenetre();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

/* ------------------- IPC -------------------
   Toute écriture disque et tout appel réseau passent ici.
   Le renderer ne voit jamais la clé API.
   ------------------------------------------ */

function gerer(canal, fn) {
  ipcMain.handle(canal, async (_ev, ...args) => {
    try {
      return { ok: true, donnees: await fn(...args) };
    } catch (e) {
      console.error(`[${canal}]`, e);
      return { ok: false, erreur: e.message || "Erreur inattendue." };
    }
  });
}

gerer("etiquettes:liste", () => stockage.lireIndex());

gerer("etiquettes:ajouter", async (donnees, photoBase64) => {
  const buffer = photoBase64 ? Buffer.from(photoBase64, "base64") : null;
  return stockage.ajouterEtiquette(donnees, buffer);
});

gerer("etiquettes:corriger", (id, champs) => stockage.corrigerEtiquette(id, champs));

gerer("etiquettes:purger", (mois) => stockage.purger(mois));

gerer("journal:verifier", () => stockage.verifierJournal());

gerer("config:lire", async () => {
  const c = await stockage.lireConfig();
  // On ne renvoie jamais la clé au renderer, seulement sa présence.
  return { etablissement: c.etablissement || "", cleDefinie: !!c.cleApi };
});

gerer("config:ecrire", (config) => stockage.ecrireConfig(config));

gerer("extraction:lire", async (base64) => {
  const { cleApi } = await stockage.lireConfig();
  const cle = cleApi || process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    throw new Error("Aucune clé API enregistrée. Renseigne-la dans les réglages.");
  }
  return lireEtiquette(base64, cle);
});

gerer("photo:choisir", async () => {
  const res = await dialog.showOpenDialog({
    title: "Choisir une photo d'étiquette",
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "heic"] }],
    properties: ["openFile"],
  });
  if (res.canceled || !res.filePaths.length) return null;
  const buffer = await fsp.readFile(res.filePaths[0]);
  return { base64: buffer.toString("base64"), nom: path.basename(res.filePaths[0]) };
});

gerer("export:csv", async () => {
  const contenu = await stockage.exporterCsv();
  const res = await dialog.showSaveDialog({
    title: "Exporter le registre",
    defaultPath: `registre-dlc-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: "CSV", extensions: ["csv"] }],
  });
  if (res.canceled || !res.filePath) return null;
  await fsp.writeFile(res.filePath, contenu, "utf8");
  return res.filePath;
});
