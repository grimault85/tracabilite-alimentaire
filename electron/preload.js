const { contextBridge, ipcRenderer } = require("electron");

/* Seules ces fonctions existent côté renderer.
   Pas d'accès direct à Node, pas de clé API. */

const appel = (canal, ...args) => ipcRenderer.invoke(canal, ...args);

contextBridge.exposeInMainWorld("api", {
  etiquettes: {
    liste:    ()                  => appel("etiquettes:liste"),
    ajouter:  (donnees, base64)   => appel("etiquettes:ajouter", donnees, base64),
    corriger: (id, champs)        => appel("etiquettes:corriger", id, champs),
    purger:   (mois)              => appel("etiquettes:purger", mois),
  },
  journal: {
    verifier: () => appel("journal:verifier"),
  },
  config: {
    lire:   ()       => appel("config:lire"),
    ecrire: (config) => appel("config:ecrire", config),
  },
  extraction: {
    lire: (base64) => appel("extraction:lire", base64),
  },
  photo: {
    choisir: () => appel("photo:choisir"),
    url: (relatif) => (relatif ? `photo://local/${relatif}` : null),
  },
  exporter: {
    csv: () => appel("export:csv"),
  },
});
