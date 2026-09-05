/* Appels à l'Edge Function et gestion du hors-ligne. */

import {
  listerAttente, retirerDeLAttente, incrementerTentative,
  corrigerEtiquette, photoDe, etiquetteDe,
} from "./stockage.js";

const URL_FONCTION = import.meta.env.VITE_URL_EXTRACTION || "";
const JETON = import.meta.env.VITE_JETON_APP || "";

export const configuree = () => !!URL_FONCTION;

/* Compression : une étiquette reste lisible à 150 Ko. Envoyer les 4 Mo
   du capteur coûte du temps et du forfait pour rien.
   Un BL a besoin de plus de définition : ses colonnes de chiffres sont
   fines, et un GTIN mal lu casse tout le rattachement. */
export function compresser(source, maxPx = 1400, qualite = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      c.toBlob(
        (blob) => {
          if (!blob) return reject(new Error("Compression impossible."));
          const lecteur = new FileReader();
          lecteur.onload = () => resolve({ blob, base64: lecteur.result.split(",")[1] });
          lecteur.onerror = () => reject(new Error("Lecture impossible."));
          lecteur.readAsDataURL(blob);
        },
        "image/jpeg",
        qualite,
      );
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = source;
  });
}

export const compresserBl = (source) => compresser(source, 2200, 0.88);

export const depuisFichier = (fichier) => new Promise((resolve, reject) => {
  const l = new FileReader();
  l.onload = () => resolve(l.result);
  l.onerror = () => reject(new Error("Lecture du fichier impossible."));
  l.readAsDataURL(fichier);
});

/* ------------------- Appel générique ------------------- */

async function appeler(base64, type, delai) {
  if (!URL_FONCTION) {
    throw new Error("Service de lecture non configuré. Saisis les informations à la main.");
  }
  if (!navigator.onLine) {
    const e = new Error("Pas de réseau. La photo est conservée, la lecture se fera au retour de la connexion.");
    e.horsLigne = true;
    throw e;
  }

  const controleur = new AbortController();
  const minuterie = setTimeout(() => controleur.abort(), delai);

  try {
    const reponse = await fetch(URL_FONCTION, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(JETON ? { authorization: `Bearer ${JETON}` } : {}),
      },
      body: JSON.stringify({ image: base64, type }),
      signal: controleur.signal,
    });
    const data = await reponse.json();
    if (!reponse.ok) throw new Error(data.erreur || `Lecture impossible (${reponse.status}).`);
    return data;
  } catch (e) {
    if (e.name === "AbortError") {
      const t = new Error("La lecture a mis trop de temps. Réseau trop faible ?");
      t.horsLigne = true;
      throw t;
    }
    if (e instanceof TypeError) {
      const r = new Error("Réseau indisponible. La photo est conservée.");
      r.horsLigne = true;
      throw r;
    }
    throw e;
  } finally {
    clearTimeout(minuterie);
  }
}

export const lireEtiquette = (base64) => appeler(base64, "etiquette", 30000);

/* Un BL demande plus de temps : 25 lignes à extraire, pas 5 champs. */
export const lireBonLivraison = (base64) => appeler(base64, "bl", 90000);

/* ------------------- Reprise de la file d'attente -------------------
   Complète les étiquettes photographiées hors réseau. Ne touche jamais
   à ce qui a été saisi à la main : la correction humaine prime toujours
   sur la lecture automatique.
   -------------------------------------------------------------------- */

export async function traiterAttente() {
  if (!navigator.onLine || !URL_FONCTION) return { traitees: 0, restantes: 0 };

  const attente = await listerAttente();
  let traitees = 0;

  for (const item of attente) {
    if (item.tentatives >= 5) continue;
    try {
      const blob = await photoDe(item.id);
      if (!blob) { await retirerDeLAttente(item.id); continue; }

      const base64 = await new Promise((res, rej) => {
        const l = new FileReader();
        l.onload = () => res(l.result.split(",")[1]);
        l.onerror = () => rej(new Error("Lecture impossible."));
        l.readAsDataURL(blob);
      });

      const lu = await lireEtiquette(base64);
      const actuelle = await etiquetteDe(item.id);
      if (!actuelle) { await retirerDeLAttente(item.id); continue; }

      // On ne remplit que ce qui est vide. Ce qui a été saisi en cuisine
      // — la DLC en particulier — n'est jamais écrasé.
      const champs = { enAttenteLecture: false, confiance: lu.confiance };
      for (const cle of ["produit", "marque", "gtin", "lot", "dlc"]) {
        if (!actuelle[cle] && lu[cle]) champs[cle] = lu[cle];
      }
      if (!actuelle.dlc && lu.dlc) champs.source = "ia";

      await corrigerEtiquette(item.id, champs);
      await retirerDeLAttente(item.id);
      traitees++;
    } catch {
      await incrementerTentative(item.id);
    }
  }

  const restantes = (await listerAttente()).length;
  return { traitees, restantes };
}
