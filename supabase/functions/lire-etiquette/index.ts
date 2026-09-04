// =====================================================================
// Edge Function : lecture d'étiquette
//
// Elle existe pour une seule raison : la clé API Anthropic ne doit
// jamais se trouver dans le téléphone. Un fichier JS servi au client
// est lisible par n'importe qui, y compris une clé "cachée" dans une
// variable d'environnement de build.
//
// Déploiement :
//   supabase functions deploy lire-etiquette
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
// =====================================================================

const CORS = {
  "Access-Control-Allow-Origin": "*", // à restreindre au domaine de la PWA en production
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const consigne = (aujourdhui: string) => `Tu lis l'emballage d'un produit alimentaire livré à un restaurant.
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

Deno.serve(async (requete) => {
  if (requete.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const json = (corps: unknown, statut = 200) =>
    new Response(JSON.stringify(corps), {
      status: statut,
      headers: { ...CORS, "content-type": "application/json" },
    });

  try {
    const cle = Deno.env.get("ANTHROPIC_API_KEY");
    if (!cle) return json({ erreur: "Clé API non configurée côté serveur." }, 500);

    // Jeton partagé : empêche n'importe qui d'utiliser ta clé s'il
    // trouve l'URL. À remplacer par l'auth Supabase en multi-clients.
    const attendu = Deno.env.get("JETON_APP");
    if (attendu) {
      const fourni = requete.headers.get("authorization")?.replace("Bearer ", "");
      if (fourni !== attendu) return json({ erreur: "Accès refusé." }, 401);
    }

    const { image } = await requete.json();
    if (!image) return json({ erreur: "Aucune image reçue." }, 400);

    const aujourdhui = new Date().toISOString().slice(0, 10);

    const reponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": cle,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data: image } },
            { type: "text", text: consigne(aujourdhui) },
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

    return json({
      produit: lu.produit || "",
      marque: lu.marque || "",
      gtin: (lu.gtin || "").replace(/\D/g, ""),
      lot: lu.lot || "",
      dlc: /^\d{4}-\d{2}-\d{2}$/.test(lu.dlc || "") ? lu.dlc : "",
      sourceDlc: lu.source_dlc || null,
      confiance: typeof lu.confiance === "number" ? lu.confiance : null,
      remarque: lu.remarque || null,
    });
  } catch (e) {
    return json({ erreur: (e as Error).message || "Erreur inattendue." }, 500);
  }
});
