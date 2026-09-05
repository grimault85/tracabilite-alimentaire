/* =====================================================================
   Stockage local du téléphone — IndexedDB, sans dépendance.

   Magasins :
   - etiquettes : les données consultables
   - photos     : les images en Blob, séparées pour que les listes
                  restent rapides
   - attente    : les étiquettes dont la lecture automatique n'a pas
                  encore pu se faire (hors réseau)
   - livraisons : les bons de livraison et leurs lignes

   Principe non négociable : la photo est enregistrée AVANT tout appel
   réseau. En chambre froide il n'y a pas de wifi, et une photo perdue
   est une traçabilité perdue.
   ===================================================================== */

const NOM = "tracabilite-dlc";
const VERSION = 2;

let connexion = null;

function ouvrir() {
  if (connexion) return Promise.resolve(connexion);
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM, VERSION);
    requete.onupgradeneeded = (ev) => {
      const db = requete.result;
      if (!db.objectStoreNames.contains("etiquettes")) {
        const s = db.createObjectStore("etiquettes", { keyPath: "id" });
        s.createIndex("dlc", "dlc");
        s.createIndex("dateScan", "dateScan");
      }
      if (!db.objectStoreNames.contains("photos")) {
        db.createObjectStore("photos", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("attente")) {
        db.createObjectStore("attente", { keyPath: "id" });
      }
      // v2 : bons de livraison
      if (!db.objectStoreNames.contains("livraisons")) {
        const s = db.createObjectStore("livraisons", { keyPath: "id" });
        s.createIndex("dateReception", "dateReception");
      }
      void ev;
    };
    requete.onsuccess = () => { connexion = requete.result; resolve(connexion); };
    requete.onerror = () => reject(new Error("Stockage local inaccessible."));
    requete.onblocked = () => reject(new Error("Ferme les autres onglets de l'application, une mise à jour du stockage est en attente."));
  });
}

function transaction(magasins, mode, action) {
  return ouvrir().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(magasins, mode);
    let resultat;
    tx.oncomplete = () => resolve(resultat);
    tx.onerror = () => reject(tx.error || new Error("Écriture impossible."));
    tx.onabort = () => reject(tx.error || new Error("Transaction annulée."));
    resultat = action(tx);
  }));
}

const tousLes = (magasin) => transaction([magasin], "readonly", (tx) => {
  const r = tx.objectStore(magasin).getAll();
  return new Promise((res) => { r.onsuccess = () => res(r.result); });
});

/* ------------------- Étiquettes ------------------- */

export async function listerEtiquettes() {
  const liste = await tousLes("etiquettes");
  return liste.sort((a, b) => (b.creeLe || "").localeCompare(a.creeLe || ""));
}

export async function enregistrerEtiquette(donnees, photoBlob) {
  const id = crypto.randomUUID();
  const etiquette = {
    id,
    ...donnees,
    dateScan: new Date().toISOString().slice(0, 10),
    creeLe: new Date().toISOString(),
    aPhoto: !!photoBlob,
    synchronise: false,
  };
  await transaction(["etiquettes", "photos"], "readwrite", (tx) => {
    tx.objectStore("etiquettes").put(etiquette);
    if (photoBlob) tx.objectStore("photos").put({ id, blob: photoBlob });
  });
  return etiquette;
}

export async function corrigerEtiquette(id, champs) {
  return transaction(["etiquettes"], "readwrite", (tx) => {
    const s = tx.objectStore("etiquettes");
    const r = s.get(id);
    return new Promise((res) => {
      r.onsuccess = () => {
        if (!r.result) return res(null);
        const maj = { ...r.result, ...champs, modifieLe: new Date().toISOString() };
        s.put(maj);
        res(maj);
      };
    });
  });
}

export async function etiquetteDe(id) {
  return transaction(["etiquettes"], "readonly", (tx) => {
    const r = tx.objectStore("etiquettes").get(id);
    return new Promise((res) => { r.onsuccess = () => res(r.result || null); });
  });
}

export async function photoDe(id) {
  const r = await transaction(["photos"], "readonly", (tx) => {
    const req = tx.objectStore("photos").get(id);
    return new Promise((res) => { req.onsuccess = () => res(req.result); });
  });
  return r?.blob || null;
}

/* ------------------- Bons de livraison ------------------- */

export async function listerLivraisons() {
  const liste = await tousLes("livraisons");
  return liste.sort((a, b) => (b.dateReception || "").localeCompare(a.dateReception || ""));
}

export async function enregistrerLivraison(entete, lignes, photoBlob) {
  const id = crypto.randomUUID();
  const livraison = {
    id,
    fournisseur: entete.fournisseur || "",
    numeroBl: entete.numeroBl || "",
    dateBl: entete.dateBl || "",
    montantHt: entete.montantHt ?? null,
    dateReception: new Date().toISOString().slice(0, 10),
    creeLe: new Date().toISOString(),
    confiance: entete.confiance ?? null,
    lignes: lignes.map((l, i) => ({ id: `${id}-${i}`, rang: i, ...l })),
    aPhoto: !!photoBlob,
  };
  await transaction(["livraisons", "photos"], "readwrite", (tx) => {
    tx.objectStore("livraisons").put(livraison);
    if (photoBlob) tx.objectStore("photos").put({ id, blob: photoBlob });
  });
  return livraison;
}

/* Ajoute les lignes d'une page supplémentaire à un BL déjà enregistré. */
export async function ajouterLignes(livraisonId, lignes) {
  return transaction(["livraisons"], "readwrite", (tx) => {
    const s = tx.objectStore("livraisons");
    const r = s.get(livraisonId);
    return new Promise((res) => {
      r.onsuccess = () => {
        if (!r.result) return res(null);
        const depart = r.result.lignes.length;
        const maj = {
          ...r.result,
          lignes: [
            ...r.result.lignes,
            ...lignes.map((l, i) => ({ id: `${livraisonId}-${depart + i}`, rang: depart + i, ...l })),
          ],
        };
        s.put(maj);
        res(maj);
      };
    });
  });
}

export async function supprimerLivraison(id) {
  await transaction(["livraisons", "photos"], "readwrite", (tx) => {
    tx.objectStore("livraisons").delete(id);
    tx.objectStore("photos").delete(id);
  });
}

/* Cherche les lignes de BL correspondant à un GTIN, sur les N derniers
   jours. Renvoie une liste : au-delà d'un candidat, c'est à l'utilisateur
   de trancher, sinon on rattache tôt ou tard au mauvais bon de livraison. */
export async function candidatsParGtin(gtin, jours = 30) {
  if (!gtin || gtin.length < 8) return [];
  const limite = new Date();
  limite.setDate(limite.getDate() - jours);
  const limiteIso = limite.toISOString().slice(0, 10);

  const livraisons = await listerLivraisons();
  const trouves = [];
  for (const bl of livraisons) {
    if (bl.dateReception < limiteIso) continue;
    for (const ligne of bl.lignes) {
      if (ligne.gtin && ligne.gtin === gtin) trouves.push({ ligne, bl });
    }
  }
  return trouves;
}

/* ------------------- File d'attente ------------------- */

export async function mettreEnAttente(etiquetteId) {
  await transaction(["attente"], "readwrite", (tx) => {
    tx.objectStore("attente").put({
      id: etiquetteId,
      ajouteLe: new Date().toISOString(),
      tentatives: 0,
    });
  });
}

export const listerAttente = () => tousLes("attente");

export async function retirerDeLAttente(id) {
  await transaction(["attente"], "readwrite", (tx) => {
    tx.objectStore("attente").delete(id);
  });
}

export async function incrementerTentative(id) {
  await transaction(["attente"], "readwrite", (tx) => {
    const s = tx.objectStore("attente");
    const r = s.get(id);
    r.onsuccess = () => {
      if (r.result) s.put({ ...r.result, tentatives: (r.result.tentatives || 0) + 1 });
    };
  });
}

/* ------------------- Purge après rétention ------------------- */

export async function purger(moisRetention = 6) {
  const limite = new Date();
  limite.setMonth(limite.getMonth() - moisRetention);
  const limiteIso = limite.toISOString().slice(0, 10);

  const etiquettes = (await listerEtiquettes()).filter((e) => e.dateScan < limiteIso);
  const livraisons = (await listerLivraisons()).filter((l) => l.dateReception < limiteIso);

  await transaction(["etiquettes", "livraisons", "photos"], "readwrite", (tx) => {
    const se = tx.objectStore("etiquettes");
    const sl = tx.objectStore("livraisons");
    const sp = tx.objectStore("photos");
    etiquettes.forEach((e) => { se.delete(e.id); sp.delete(e.id); });
    livraisons.forEach((l) => { sl.delete(l.id); sp.delete(l.id); });
  });
  return { etiquettes: etiquettes.length, livraisons: livraisons.length };
}

/* ------------------- Stockage ------------------- */

export async function espace() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { utilise: usage, total: quota };
}

/* Sans persistance, Android peut vider IndexedDB quand la mémoire se
   remplit. Le navigateur l'accorde en général aux PWA installées sur
   l'écran d'accueil — une raison de plus de ne pas rester sur un onglet. */
export async function demanderPersistance() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
