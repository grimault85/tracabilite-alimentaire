// =====================================================================
// Edge Function : lecture d'étiquette et de bon de livraison
//
// Elle existe pour une seule raison : la clé API Anthropic ne doit
// jamais se trouver dans le téléphone. Un bundle JS servi au client
// est lisible par n'importe qui.
//
// Deux consignes très différentes selon le document :
//   type: "etiquette" → une date, un lot, un GTIN
//   type: "bl"        → un tableau de 15 à 25 lignes
//
// Déploiement :
//   supabase functions deploy lire-etiquette
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
//   supabase secrets set JETON_APP=un-jeton-au-hasard
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*", // à restreindre au domaine de la PWA en production
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const CONSIGNE_ETIQUETTE = (aujourdhui: string) =>
  `Tu lis l'emballage d'un produit alimentaire livré à un restaurant.
Nous sommes le ${aujourdhui}.

RÈGLES
1. La DLC est la date qui SUIT un libellé : "A consommer jusqu'au", "DLC", "Use by", "Exp.".
   Ne prends jamais une date qui suit "Conditionné le", "Emballé le", "Fabriqué le".
   S'il y a plusieurs dates, choisis par le libellé, jamais par la position.
2. Si un code GS1 est lisible sous un code-barres, il fait foi :
   (17)AAMMJJ est la date de péremption, (10) le numéro de lot.
   Quand le GS1 et le texte se contredisent, retiens le GS1 et baisse la confiance.
3. "marque" = le nom commercial sur l'emballage. Ce n'est pas le fournisseur,
   qui ne figure presque jamais sur l'emballage. Ne le devine pas.
4. "gtin" = les 13 chiffres en clair sous le code-barres principal, sans espaces.
5. Si une information est absente ou illisible, mets null. N'invente jamais une date.

Réponds UNIQUEMENT par un objet JSON, sans texte autour ni balises markdown :
{"produit":string|null,"marque":string|null,"gtin":string|null,"lot":string|null,
 "dlc":"AAAA-MM-JJ"|null,"source_dlc":"libelle"|"gs1"|null,"confiance":0..1,"remarque":string|null}`;

const CONSIGNE_BL = (aujourdhui: string) =>
  `Tu lis un document de livraison fournisseur pour la restauration.
Nous sommes le ${aujourdhui}.

Ce peut être un bon de livraison, une facture de livraison ou un devis.
Les mises en page varient énormément d'un fournisseur à l'autre :
ne suppose l'existence d'aucune colonne.

EN-TÊTE
- "fournisseur" = l'émetteur du document : logo, en-tête, adresse
  d'expédition. Le restaurant est le DESTINATAIRE ("Adresse de
  livraison", "Livré à", "Client"). Ne les confonds jamais.
- "numero" = le numéro du document, quel que soit son libellé :
  "BL - N°", "BON DE LIVRAISON N°", "FACTURE LIVRAISON N°", "Numéro".
- "date" = date du document ou de livraison, pas la date de validité
  ni l'échéance de paiement.

LIGNES
- Une ligne par marchandise, dans l'ordre du document.
- Les intitulés de section ne sont PAS des lignes : Frais, Surgelé,
  Ambiant, CHARCUTERIES, FROMAGES, PÂTES, ANTIPASTI, MAREE…
  Reporte-les dans "categorie" sur chaque ligne concernée.
- Exclus tout ce qui n'est pas une marchandise : sous-total, total,
  TVA, net à payer, nombre total, surcoût ou surcharge énergie,
  frais de port, transport, palettes, consignes, éco-participation.
- Une désignation peut courir sur deux lignes : recompose-la.
- Des informations complémentaires apparaissent souvent SOUS la
  désignation, en plus petit : numéro de lot ("N° de Lot : 02335156"),
  date limite ("DLC/DDM : 11/09/2026"), poids, origine, nom
  scientifique. Rattache-les à la ligne au-dessus, ne les traite
  jamais comme une ligne à part.

COLONNES
- "gtin" : code-barres produit, 8 à 14 chiffres, dans une colonne qui
  lui est propre et porte souvent l'intitulé GTIN ou EAN.
  BEAUCOUP de fournisseurs n'en ont pas. Dans ce cas mets null : c'est
  normal et attendu. Ne recopie JAMAIS le code article à la place, et
  n'invente pas un code à partir d'un autre nombre de la ligne.
- "code_article" : référence interne du fournisseur. Numérique
  (340160, 52583) ou alphanumérique (SOR.JCN.6500, LE.MOP.3000).
- "marque" : uniquement si une colonne marque existe dans le tableau.
  Ne la déduis jamais de la désignation.
- "quantite" : quantité livrée ou facturée, en nombre décimal
  (la virgule française devient un point : 57,274 → 57.274).
- "unite" : KG, COL, PCE, UNITE, SAC, BQ, SHT, PLQ, LOT…
- "lot" : le numéro de lot s'il figure sur la ligne ou juste en dessous.
- "dlc" : la date limite si le document la porte ("DLC", "DLC/DDM"),
  au format AAAA-MM-JJ. Rare mais précieux, ne l'invente pas.

RÈGLE GÉNÉRALE
Dans le doute, mets null. Un GTIN, un lot ou une date inventés cassent
la traçabilité au moment précis où elle doit servir.

SI TU NE PEUX PAS LIRE LE TABLEAU
Renvoie "lignes": [] et explique précisément pourquoi dans "remarque" :
texte trop petit, image floue, tableau coupé, document tourné, reflet.
Cette remarque est affichée à l'utilisateur pour qu'il reprenne la photo :
sois concret et bref. N'invente jamais de lignes plausibles pour
« remplir » la réponse.

Réponds UNIQUEMENT par un objet JSON, sans texte autour ni balises markdown :
{"type_document":"bon_livraison"|"facture"|"devis"|null,
 "fournisseur":string|null,"numero_bl":string|null,"date_bl":"AAAA-MM-JJ"|null,
 "montant_ht":number|null,"page":number|null,"pages_total":number|null,
 "lignes":[{"categorie":string|null,"code_article":string|null,"designation":string,
            "marque":string|null,"gtin":string|null,"quantite":number|null,
            "unite":string|null,"lot":string|null,"dlc":"AAAA-MM-JJ"|null}],
 "confiance":0..1,"remarque":string|null}`;

Deno.serve(async (requete) => {
  if (requete.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...CORS, "content-type": "application/json" },
    });

  try {
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cle) return json({ erreur: "Clé API non configurée côté serveur." }, 500);

    const attendu = Deno.env.get("JETON_APP");
    if (attendu) {
      const fourni = requete.headers.get("authorization")?.replace("Bearer ", "");
      if (fourni !== attendu) return json({ erreur: "Accès refusé." }, 401);
    }

    const { image, type = "etiquette" } = await requete.json();
    if (!image) return json({ erreur: "Aucune image reçue." }, 400);
    if (type !== "etiquette" && type !== "bl") {
      return json({ erreur: "Type de document inconnu." }, 400);
    }

    const aujourdhui = new Date().toISOString().slice(0, 10);
    const estBl = type === "bl";

    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        // Un BL de 25 lignes produit un JSON bien plus long qu'une étiquette
        max_tokens: estBl ? 8000 : 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: estBl ? CONSIGNE_BL(aujourdhui) : CONSIGNE_ETIQUETTE(aujourdhui) },
          ],
        }],
      }),
    });

    if (!reponse.ok) {
      const detail = await reponse.text();
      return json({ erreur: `Lecture impossible (${reponse.status}).`, detail: detail.slice(0, 300) }, 502);
    }

    const data = await reponse.json();
    const texte = (data.content || [])
      .filter((b: { type: string }) => b.type === "text")
      .map((b: { text: string }) => b.text)
      .join("\n")
      .replace(/```json|```/g, "")
      .trim();

    let lu;
    try {
      lu = JSON.parse(texte);
    } catch {
      return json({ erreur: "Réponse illisible du modèle." }, 502);
    }

    const chiffres = (v: unknown) => String(v ?? "").replace(/\D/g, "");
    const dateValide = (v: unknown) =>
      /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : "";

    if (!estBl) {
      return json({
        produit: lu.produit || "",
        marque: lu.marque || "",
        gtin: chiffres(lu.gtin),
        lot: lu.lot || "",
        dlc: dateValide(lu.dlc),
        sourceDlc: lu.source_dlc || null,
        confiance: typeof lu.confiance === "number" ? lu.confiance : null,
        remarque: lu.remarque || null,
      });
    }

    // Nettoyage : on écarte tout ce qui n'est pas une marchandise.
    const rebut = new RegExp(
      "^(sous[- ]?total|total|tva|montant|net a payer|net à payer|nombre total" +
      "|surcout|surcoût|surcharge|frais de port|frais de livraison|transport" +
      "|palette|consigne|eco[- ]?participation|éco[- ]?participation)",
      "i",
    );
    const lignes = (Array.isArray(lu.lignes) ? lu.lignes : [])
      .filter((l: { designation?: string }) => l?.designation && !rebut.test(l.designation.trim()))
      .map((l: Record<string, unknown>) => {
        const gtin = chiffres(l.gtin);
        return {
          categorie: (l.categorie as string) || null,
          codeArticle: (l.code_article as string) || null,
          designation: String(l.designation).trim(),
          marque: (l.marque as string) || null,
          // Un GTIN valide fait 8, 12, 13 ou 14 chiffres. Le reste est
          // presque toujours une colonne mal lue : mieux vaut rien.
          gtin: [8, 12, 13, 14].includes(gtin.length) ? gtin : null,
          quantite: typeof l.quantite === "number" ? l.quantite : null,
          unite: (l.unite as string) || null,
          lot: (l.lot as string) || null,
          dlc: dateValide(l.dlc) || null,
        };
      });

    return json({
      typeDocument: lu.type_document || null,
      fournisseur: lu.fournisseur || "",
      numeroBl: lu.numero_bl || "",
      dateBl: dateValide(lu.date_bl),
      montantHt: typeof lu.montant_ht === "number" ? lu.montant_ht : null,
      page: typeof lu.page === "number" ? lu.page : null,
      pagesTotal: typeof lu.pages_total === "number" ? lu.pages_total : null,
      lignes,
      confiance: typeof lu.confiance === "number" ? lu.confiance : null,
      remarque: lu.remarque || null,
    });
  } catch (e) {
    return json({ erreur: (e as Error).message || "Erreur inattendue." }, 500);
  }
});
