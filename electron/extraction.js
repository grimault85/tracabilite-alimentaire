/* Lecture d'étiquette par modèle vision.
   Exécuté dans le processus principal : la clé API ne transite
   jamais par la fenêtre. */

const CONSIGNE = (aujourdhui) => `Tu lis l'emballage d'un produit alimentaire livré à un restaurant.
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

async function lireEtiquette(base64, cleApi) {
  const aujourdhui = new Date().toISOString().slice(0, 10);

  const reponse = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": cleApi,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: CONSIGNE(aujourdhui) },
        ],
      }],
    }),
  });

  if (!reponse.ok) {
    const corps = await reponse.text().catch(() => "");
    if (reponse.status === 401) throw new Error("Clé API refusée. Vérifie-la dans les réglages.");
    if (reponse.status === 429) throw new Error("Trop de requêtes. Réessaie dans un instant.");
    throw new Error(`Lecture impossible (HTTP ${reponse.status}). ${corps.slice(0, 200)}`);
  }

  const data = await reponse.json();
  const texte = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .replace(/```json|```/g, "")
    .trim();

  let lu;
  try {
    lu = JSON.parse(texte);
  } catch {
    throw new Error("Réponse illisible du modèle. Saisis les informations à la main.");
  }

  return {
    produit: lu.produit || "",
    marque: lu.marque || "",
    gtin: (lu.gtin || "").replace(/\D/g, ""),
    lot: lu.lot || "",
    dlc: /^\d{4}-\d{2}-\d{2}$/.test(lu.dlc || "") ? lu.dlc : "",
    sourceDlc: lu.source_dlc || null,
    confiance: typeof lu.confiance === "number" ? lu.confiance : null,
    remarque: lu.remarque || null,
  };
}

module.exports = { lireEtiquette };
