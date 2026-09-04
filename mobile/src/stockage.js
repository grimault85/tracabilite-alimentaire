/* =====================================================================
   Stockage local du téléphone — IndexedDB, sans dépendance.

   Trois magasins :
   - etiquettes : les données consultables
   - photos     : les images en Blob, séparées pour ne pas alourdir
                  les lectures de liste
   - attente    : les étiquettes dont la lecture automatique n'a pas
                  encore pu se faire (hors réseau)

   Principe non négociable : la photo est enregistrée AVANT tout appel
   réseau. En chambre froide il n'y a pas de wifi, et une photo perdue
   est une traçabilité perdue.
   ===================================================================== */

const NOM = "tracabilite-dlc";
const VERSION = 1;

let connexion = null;

function ouvrir() {
  if (connexion) return Promise.resolve(connexion);
  return new Promise((resolve, reject) => {
    const requete = indexedDB.open(NOM, VERSION);
    requete.onupgradeneeded = () => {
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
    };
    requete.onsuccess = () => { connexion = requete.result; resolve(connexion); };
    requete.onerror = () => reject(new Error("Stockage local inaccessible."));
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
  return (await liste).sort((a, b) => (b.creeLe || "").localeCompare(a.creeLe || ""));
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
        const maj = { ...r.result, ...champs, modifieLe: new Date().toISOString() };
        s.put(maj);
        res(maj);
      };
    });
  });
}

export async function photoDe(id) {
  const r = await transaction(["photos"], "readonly", (tx) => {
    const req = tx.objectStore("photos").get(id);
    return new Promise((res) => { req.onsuccess = () => res(req.result); });
  });
  return (await r)?.blob || null;
}

/* ------------------- File d'attente -------------------
   Une étiquette photographiée sans réseau part ici. La lecture
   automatique se fera au retour de la connexion.
   ------------------------------------------------------ */

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

  const liste = await listerEtiquettes();
  const aPurger = liste.filter((e) => e.dateScan < limiteIso);

  await transaction(["etiquettes", "photos"], "readwrite", (tx) => {
    const se = tx.objectStore("etiquettes");
    const sp = tx.objectStore("photos");
    aPurger.forEach((e) => { se.delete(e.id); sp.delete(e.id); });
  });
  return aPurger.length;
}

/* ------------------- Espace disponible ------------------- */

export async function espace() {
  if (!navigator.storage?.estimate) return null;
  const { usage, quota } = await navigator.storage.estimate();
  return { utilise: usage, total: quota };
}

/* Demande la persistance : sans elle, Android peut vider IndexedDB
   quand le stockage se remplit. Le navigateur accorde généralement
   la persistance à une PWA installée sur l'écran d'accueil. */
export async function demanderPersistance() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}
