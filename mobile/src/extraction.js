/* Appels à l'Edge Function et gestion du hors-ligne. */

import {
  listerAttente, retirerDeLAttente, incrementerTentative,
  corrigerEtiquette, photoDe, etiquetteDe,
} from "./stockage.js";

const URL_FONCTION = import.meta.env.VITE_URL_EXTRACTION || "";
const JETON = import.meta.env.VITE_JETON_APP || "";

export const configuree = () => !!URL_FONCTION;

/* Compression.

   Point critique sur Android : une photo de 12 Mpx convertie en data URL
   puis décodée entièrement occupe ~50 Mo de bitmap plus ~5 Mo de chaîne
   base64. Le navigateur tue l'onglet sans prévenir — l'application
   semble « planter et se fermer ».

   On passe donc par createImageBitmap avec resizeWidth : le décodeur
   réduit l'image pendant le décodage, sans jamais matérialiser la
   pleine résolution côté JS. Repli sur l'ancienne méthode si
   indisponible. */

function versBlobEtBase64(canvas, qualite) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Compression impossible."));
        const l = new FileReader();
        l.onload = () => resolve({ blob, base64: l.result.split(",")[1] });
        l.onerror = () => reject(new Error("Lecture impossible."));
        l.readAsDataURL(blob);
      },
      "image/jpeg",
      qualite,
    );
  });
}

function dessiner(source, largeur, hauteur) {
  const c = document.createElement("canvas");
  c.width = largeur;
  c.height = hauteur;
  c.getContext("2d").drawImage(source, 0, 0, largeur, hauteur);
  return c;
}

/* Repli : décodage classique. Réservé aux petits fichiers. */
function compresserParImage(fichier, maxPx, qualite) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = dessiner(img, Math.round(img.width * r), Math.round(img.height * r));
      URL.revokeObjectURL(url);
      versBlobEtBase64(c, qualite)
        .then((res) => resolve({ ...res, largeur: c.width, hauteur: c.height }))
        .catch(reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
    img.src = url;
  });
}

export async function compresser(fichier, maxPx = 1400, qualite = 0.82) {
  if (!fichier) throw new Error("Aucune image reçue.");

  // En dessous de 800 Ko, le décodage direct ne pose pas de problème
  // et évite d'agrandir inutilement une petite image.
  const gros = fichier.size > 800 * 1024;

  if (gros && typeof createImageBitmap === "function") {
    let bitmap;
    try {
      bitmap = await createImageBitmap(fichier, {
        resizeWidth: maxPx,
        resizeQuality: "high",
        // Sans cela, une photo prise en portrait peut arriver couchée :
        // le modèle lit alors un tableau tourné à 90° et ne trouve rien.
        imageOrientation: "from-image",
      });
      const c = dessiner(bitmap, bitmap.width, bitmap.height);
      const dimensions = { largeur: bitmap.width, hauteur: bitmap.height };
      bitmap.close();
      const r = await versBlobEtBase64(c, qualite);
      return { ...r, ...dimensions };
    } catch (e) {
      if (bitmap) bitmap.close();
      // On tente le repli plutôt que d'échouer : certains formats
      // (HEIC notamment) ne passent pas par createImageBitmap.
      void e;
    }
  }

  return compresserParImage(fichier, maxPx, qualite);
}

/* L'API vision ramène toute image à ~1568 px sur le grand côté. Envoyer
   davantage ne sert à rien : ce qui compte est la part de l'image
   occupée par le tableau. D'où la consigne de cadrer serré plutôt que
   de photographier la feuille entière. */
export const compresserBl = (fichier) => compresser(fichier, 1600, 0.9);

/* Conservé pour le collage d'image depuis le presse-papier. */
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
