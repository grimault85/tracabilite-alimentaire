import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CSS } from "./styles.js";
import {
  listerEtiquettes, enregistrerEtiquette, mettreEnAttente, listerAttente,
  photoDe, demanderPersistance, listerLivraisons, enregistrerLivraison,
  ajouterLignes, supprimerLivraison, candidatsParGtin,
} from "./stockage.js";
import {
  lireEtiquette, lireBonLivraison, compresser, compresserBl,
  depuisFichier, traiterAttente, configuree,
} from "./extraction.js";

/* ------------------- Dates ------------------- */

const aujourdhui = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const iso = (d) => d.toISOString().slice(0, 10);

function joursRestants(dlc) {
  if (!dlc) return null;
  return Math.round((new Date(dlc + "T00:00:00") - aujourdhui()) / 86400000);
}
function statutDe(dlc) {
  const j = joursRestants(dlc);
  if (j === null) return "inconnu";
  if (j < 0) return "perime";
  if (j === 0) return "aujourdhui";
  if (j <= 3) return "bientot";
  return "ok";
}
const COULEURS = { perime:"#A32017", aujourdhui:"#D4610A", bientot:"#9A7B0A", ok:"#24705A", inconnu:"#5C6B69" };
const dateFR = (s) => { if (!s) return "—"; const [a,m,j] = s.split("-"); return `${j}.${m}.${a.slice(2)}`; };
const dateLongue = (s) => s ? new Date(s+"T00:00:00").toLocaleDateString("fr-FR",{weekday:"long",day:"numeric",month:"long"}) : "—";
const dateCourte = (s) => s ? new Date(s+"T00:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—";

function badgeJours(dlc) {
  const j = joursRestants(dlc);
  if (j === null) return { haut:"?", bas:"sans dlc" };
  if (j < 0) return { haut:`+${Math.abs(j)}`, bas:"dépassé" };
  if (j === 0) return { haut:"0", bas:"aujourd'hui" };
  return { haut:`${j}`, bas: j > 1 ? "jours" : "jour" };
}

/* ------------------- Champ photo ------------------- */

function ChampPhoto({ titre, aide, onFichier, icone = "◉" }) {
  return (
    <label className="cible">
      <input className="cible-input" type="file" accept="image/*" capture="environment"
        onChange={(ev) => { const f = ev.target.files?.[0]; if (f) onFichier(f); ev.target.value = ""; }} />
      <span className="cible-icone">{icone}</span>
      <span className="cible-titre">{titre}</span>
      {aide && <span className="cible-aide">{aide}</span>}
    </label>
  );
}

/* ------------------- Carte étiquette ------------------- */

function CarteEtiquette({ e, onClic }) {
  const st = statutDe(e.dlc);
  const b = badgeJours(e.dlc);
  const aVerifier = e.source === "ia" && e.confiance != null && e.confiance < 0.7;
  return (
    <button className="etiq" onClick={() => onClic(e)}>
      <div className="etiq-tab" style={{ background: COULEURS[st] }}>
        <span className="etiq-j mono">{b.haut}</span>
        <span className="etiq-j-sub">{b.bas}</span>
      </div>
      <div className="etiq-corps">
        <p className="etiq-produit">
          {e.produit || "Produit non identifié"}
          {aVerifier && <span className="drapeau">à vérifier</span>}
        </p>
        <div className="etiq-meta">
          {e.marque || "Marque inconnue"} · Lot <span className="mono">{e.lot || "—"}</span>
        </div>
        <div className="etiq-dlc mono" style={{ color: COULEURS[st] }}>DLC {dateFR(e.dlc)}</div>
        {e.fournisseur && <div className="lien-bl">↳ {e.fournisseur}</div>}
      </div>
    </button>
  );
}

/* ------------------- Alertes ------------------- */

function VueAlertes({ etiquettes, onClic }) {
  const g = useMemo(() => {
    const r = { perime:[], aujourdhui:[], bientot:[] };
    etiquettes.forEach((e) => { const s = statutDe(e.dlc); if (r[s]) r[s].push(e); });
    Object.values(r).forEach((l) => l.sort((a,b) => (a.dlc||"").localeCompare(b.dlc||"")));
    return r;
  }, [etiquettes]);

  const etat = g.perime.length
    ? { c:COULEURS.perime, n:g.perime.length, mot: g.perime.length>1?"produits périmés":"produit périmé", eb:"À retirer immédiatement" }
    : g.aujourdhui.length
    ? { c:COULEURS.aujourdhui, n:g.aujourdhui.length, mot: g.aujourdhui.length>1?"produits à utiliser aujourd'hui":"produit à utiliser aujourd'hui", eb:"Dernier jour" }
    : g.bientot.length
    ? { c:COULEURS.bientot, n:g.bientot.length, mot:"à utiliser sous 3 jours", eb:"À planifier" }
    : { c:COULEURS.ok, n:0, mot:"Rien ne périme sous 3 jours", eb:"Stock sous contrôle", plat:true };

  const Groupe = ({ titre, liste }) => liste.length ? (
    <>
      <div className="groupe-titre"><span>{titre}</span><span className="mono">{liste.length}</span></div>
      {liste.map((e)=><CarteEtiquette key={e.id} e={e} onClic={onClic} />)}
    </>
  ) : null;

  return (
    <div>
      <div className="etat" style={{ background: etat.c }}>
        <p className="etat-eyebrow">{etat.eb}</p>
        {etat.plat
          ? <div className="etat-libelle" style={{ fontSize:21, fontWeight:600 }}>{etat.mot}</div>
          : <><div className="etat-chiffre mono">{etat.n}</div><div className="etat-libelle">{etat.mot}</div></>}
        <div className="etat-date mono">{dateLongue(iso(aujourdhui()))}</div>
      </div>
      <Groupe titre="Périmés" liste={g.perime} />
      <Groupe titre="Aujourd'hui" liste={g.aujourdhui} />
      <Groupe titre="Sous 3 jours" liste={g.bientot} />
      {!g.perime.length && !g.aujourdhui.length && !g.bientot.length && (
        <div className="vide">
          <p className="vide-titre">Aucune échéance</p>
          <p className="vide-texte">Les produits apparaissent ici trois jours avant leur DLC.</p>
        </div>
      )}
      <div style={{ height:20 }} />
    </div>
  );
}

/* ------------------- Scanner une étiquette ------------------- */

function VueScanner({ onEnregistre }) {
  const [etape, setEtape] = useState("attente");
  const [apercu, setApercu] = useState(null);
  const [blob, setBlob] = useState(null);
  const [avis, setAvis] = useState(null);
  const [confiance, setConfiance] = useState(null);
  const [editDlc, setEditDlc] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [dernier, setDernier] = useState(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [candidats, setCandidats] = useState([]);
  const [rattache, setRattache] = useState(null);
  const [form, setForm] = useState({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });

  const maj = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  /* Un seul candidat : rattaché d'office, le bandeau reste visible et se
     retire d'un tap. Plusieurs : on demande, sinon on rattache tôt ou
     tard au mauvais bon de livraison. */
  const chercherRattachement = useCallback(async (gtin) => {
    const liste = await candidatsParGtin(gtin);
    setCandidats(liste);
    setRattache(liste.length === 1 ? liste[0] : null);
  }, []);

  const analyser = useCallback(async (fichier) => {
    setAvis(null); setEditDlc(false); setDeplie(false); setHorsLigne(false);
    setCandidats([]); setRattache(null);
    setEtape("analyse");
    try {
      const dataUrl = await depuisFichier(fichier);
      const { blob: b, base64 } = await compresser(dataUrl);
      setApercu(URL.createObjectURL(b));
      setBlob(b);
      try {
        const d = await lireEtiquette(base64);
        setForm({ produit:d.produit, marque:d.marque, gtin:d.gtin, lot:d.lot, dlc:d.dlc });
        setConfiance(d.confiance);
        if (d.gtin) await chercherRattachement(d.gtin);
        if (d.confiance != null && d.confiance < 0.7) {
          setAvis({ type:"attention", texte:"Étiquette difficile à lire. Vérifie bien la date." });
        }
      } catch (e) {
        setConfiance(null);
        setHorsLigne(!!e.horsLigne);
        setAvis({ type: e.horsLigne ? "attention" : "erreur", texte: e.message });
      }
      setEtape("verification");
    } catch (e) {
      setAvis({ type:"erreur", texte:e.message });
      setEtape("attente");
    }
  }, [chercherRattachement]);

  async function enregistrer() {
    const donnees = {
      ...form,
      fournisseur: rattache ? rattache.bl.fournisseur : null,
      produit: form.produit || (rattache ? rattache.ligne.designation : ""),
      ligneBlId: rattache ? rattache.ligne.id : null,
      livraisonId: rattache ? rattache.bl.id : null,
      rattachement: rattache ? "gtin" : "aucun",
      source: confiance == null ? "manuelle" : "ia",
      confiance,
      enAttenteLecture: horsLigne,
    };
    try {
      const e = await enregistrerEtiquette(donnees, blob);
      if (horsLigne) await mettreEnAttente(e.id);
      setDernier(e);
      onEnregistre();
      setEtape("enregistre");
    } catch (e) {
      setAvis({ type:"erreur", texte:`Enregistrement impossible : ${e.message}` });
    }
  }

  function recommencer() {
    if (apercu) URL.revokeObjectURL(apercu);
    setEtape("attente"); setApercu(null); setBlob(null); setAvis(null);
    setConfiance(null); setEditDlc(false); setDeplie(false); setHorsLigne(false);
    setCandidats([]); setRattache(null);
    setForm({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });
  }

  return (
    <div className="page">
      <h1 className="page-titre">Scanner une étiquette</h1>
      <p className="page-sous">
        Cadre large : la DLC est souvent tamponnée en dehors de l'étiquette imprimée.
      </p>

      {!configuree() && (
        <div className="avis avis-attention">
          Service de lecture non configuré. La saisie manuelle reste disponible.
        </div>
      )}

      {etape === "attente" && (
        <div>
          <ChampPhoto titre="Prendre la photo" aide="Étiquette bien à plat, sans reflet" onFichier={analyser} />
          {avis && <div className={`avis avis-${avis.type}`} style={{ marginTop:16 }}>{avis.texte}</div>}
        </div>
      )}

      {etape === "analyse" && (
        <div>
          {apercu && <img src={apercu} alt="Étiquette" className="apercu" />}
          <div className="avis avis-ok" style={{ marginTop:16 }}>Lecture de l'étiquette en cours…</div>
        </div>
      )}

      {etape === "verification" && (
        <div>
          {avis && <div className={`avis avis-${avis.type}`}>{avis.texte}</div>}

          <div className="valide">
            {apercu && <img src={apercu} alt="Étiquette photographiée" className="valide-photo" />}
            <div className="valide-corps">
              <p className="valide-produit">{form.produit || "Produit non identifié"}</p>

              {editDlc || !form.dlc ? (
                <div style={{ marginTop:12 }}>
                  <label className="label" htmlFor="f-dlc">Date limite de consommation</label>
                  <input id="f-dlc" type="date" className="input mono" autoFocus
                    value={form.dlc} onChange={(e)=>maj("dlc", e.target.value)} />
                </div>
              ) : (
                <button className="dlc-bloc" onClick={()=>setEditDlc(true)}
                  style={{ color: COULEURS[statutDe(form.dlc)] }}>
                  <span className="dlc-eyebrow">À consommer jusqu'au</span>
                  <span className="dlc-date mono">{dateFR(form.dlc)}</span>
                  <span className="dlc-jours">
                    {(() => {
                      const j = joursRestants(form.dlc);
                      if (j < 0) return `Dépassée de ${Math.abs(j)} jour${Math.abs(j)>1?"s":""}`;
                      if (j === 0) return "Aujourd'hui";
                      return `Dans ${j} jour${j>1?"s":""}`;
                    })()}
                    <span className="dlc-crayon"> · corriger</span>
                  </span>
                </button>
              )}
            </div>
          </div>

          {rattache && (
            <div className="chip">
              <span>{rattache.bl.fournisseur} · BL <span className="mono">{rattache.bl.numeroBl}</span></span>
              <button onClick={()=>{ setRattache(null); setCandidats([]); }}
                aria-label="Retirer le rattachement">✕</button>
            </div>
          )}

          {!rattache && candidats.length > 1 && (
            <div className="match">
              <p className="match-eyebrow">Ce produit figure sur plusieurs livraisons</p>
              {candidats.map((c) => (
                <button key={c.ligne.id} className="match-choix" onClick={()=>setRattache(c)}>
                  <span className="match-nom">{c.bl.fournisseur} · BL {c.bl.numeroBl}</span>
                  <span className="match-meta">
                    Reçu le {dateCourte(c.bl.dateReception)}
                    {c.ligne.quantite ? ` · ${c.ligne.quantite} ${c.ligne.unite || ""}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button className="btn btn-valider" onClick={enregistrer} disabled={!form.dlc}>
            {form.dlc ? "Valider" : "Renseigne la date pour valider"}
          </button>
          <button className="plier" onClick={()=>setDeplie((v)=>!v)}>
            {deplie ? "Masquer les détails" : "Modifier les détails"}
          </button>

          {deplie && (
            <div style={{ marginTop:14 }}>
              <div className="champ">
                <label className="label" htmlFor="f-produit">Produit</label>
                <input id="f-produit" className="input" value={form.produit}
                  onChange={(e)=>maj("produit", e.target.value)} placeholder="Ex. Jambon cuit torchon" />
              </div>
              <div className="champ">
                <label className="label" htmlFor="f-marque">Marque</label>
                <input id="f-marque" className="input" value={form.marque}
                  onChange={(e)=>maj("marque", e.target.value)} placeholder="Ex. Madrange" />
              </div>
              <div className="champ">
                <label className="label" htmlFor="f-four">Fournisseur</label>
                <input id="f-four" className="input" disabled
                  value={rattache ? rattache.bl.fournisseur : ""}
                  placeholder="Renseigné par le bon de livraison" />
                <p className="aide">
                  Le fournisseur ne figure pas sur l'emballage. Il vient du BL,
                  et c'est lui qui compte en cas de rappel produit.
                </p>
              </div>
              <div className="champ">
                <label className="label" htmlFor="f-gtin">Code GTIN</label>
                <input id="f-gtin" className="input mono" value={form.gtin}
                  inputMode="numeric"
                  onChange={(e)=>{
                    const v = e.target.value.replace(/\D/g,"");
                    maj("gtin", v);
                    chercherRattachement(v);
                  }}
                  placeholder="13 chiffres" />
              </div>
              <div className="champ">
                <label className="label" htmlFor="f-lot">Numéro de lot</label>
                <input id="f-lot" className="input mono" value={form.lot}
                  onChange={(e)=>maj("lot", e.target.value)} placeholder="Ex. 6110118072" />
              </div>
            </div>
          )}

          <button className="plier" onClick={recommencer}>Reprendre la photo</button>
        </div>
      )}

      {etape === "enregistre" && (
        <div>
          <div className="avis avis-ok">
            Enregistré. {dernier?.produit ? dernier.produit + " — " : ""}DLC {dateFR(dernier?.dlc)}.
          </div>
          <ChampPhoto titre="Étiquette suivante" aide="Enchaîne sans repasser par l'accueil" onFichier={analyser} />
          <button className="plier" onClick={recommencer}>Terminer</button>
        </div>
      )}
    </div>
  );
}

/* ------------------- Livraisons ------------------- */

function VueLivraisons({ livraisons, etiquettes, onChange }) {
  const [ouvert, setOuvert] = useState(null);
  const [etape, setEtape] = useState("liste");   // liste | analyse | verification | detail
  const [lu, setLu] = useState(null);
  const [blob, setBlob] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [avis, setAvis] = useState(null);
  const [cibleAjout, setCibleAjout] = useState(null); // BL auquel ajouter une page

  const bl = livraisons.find((l) => l.id === ouvert);

  async function analyser(fichier, blExistant = null) {
    setAvis(null); setCibleAjout(blExistant); setEtape("analyse");
    try {
      const dataUrl = await depuisFichier(fichier);
      const { blob: b, base64 } = await compresserBl(dataUrl);
      setApercu(URL.createObjectURL(b));
      setBlob(b);
      const d = await lireBonLivraison(base64);
      if (!d.lignes?.length) {
        setAvis({ type:"erreur", texte:"Aucune ligne détectée. Reprends la photo bien à plat, tableau entièrement visible." });
        setEtape("liste");
        return;
      }
      setLu(d);
      setEtape("verification");
    } catch (e) {
      setAvis({ type:"erreur", texte:e.message });
      setEtape("liste");
    }
  }

  async function valider() {
    try {
      if (cibleAjout) {
        await ajouterLignes(cibleAjout.id, lu.lignes);
      } else {
        await enregistrerLivraison(lu, lu.lignes, blob);
      }
      onChange();
      setEtape("liste"); setLu(null); setBlob(null);
      if (apercu) { URL.revokeObjectURL(apercu); setApercu(null); }
      setAvis({ type:"ok", texte: cibleAjout ? "Page ajoutée au bon de livraison." : "Bon de livraison enregistré." });
      setCibleAjout(null);
    } catch (e) {
      setAvis({ type:"erreur", texte:e.message });
    }
  }

  async function supprimer(id) {
    await supprimerLivraison(id);
    onChange();
    setOuvert(null);
  }

  /* --- Vérification après lecture --- */
  if (etape === "analyse") {
    return (
      <div className="page">
        <h1 className="page-titre">Lecture du bon</h1>
        {apercu && <img src={apercu} alt="Bon de livraison" className="apercu" />}
        <div className="avis avis-ok" style={{ marginTop:16 }}>
          Extraction du tableau en cours… un BL prend plus de temps qu'une étiquette.
        </div>
      </div>
    );
  }

  if (etape === "verification" && lu) {
    const sansGtin = lu.lignes.filter((l) => !l.gtin).length;
    return (
      <div className="page">
        <h1 className="page-titre">Vérifier le bon</h1>
        <p className="page-sous">
          {cibleAjout
            ? `Page supplémentaire pour le BL ${cibleAjout.numeroBl}.`
            : "Contrôle rapide avant enregistrement."}
        </p>

        {avis && <div className={`avis avis-${avis.type}`}>{avis.texte}</div>}

        {!cibleAjout && (
          <div className="entete-bl">
            <div className="entete-four">{lu.fournisseur || "Fournisseur non identifié"}</div>
            <div className="entete-meta">
              BL <span className="mono">{lu.numeroBl || "—"}</span> · {dateCourte(lu.dateBl)}
              {lu.montantHt != null && <> · <span className="mono">{lu.montantHt.toFixed(2)} €</span> HT</>}
            </div>
            {lu.pagesTotal > 1 && (
              <div className="entete-pages">
                Page {lu.page || "?"} sur {lu.pagesTotal} — tu pourras ajouter les suivantes après enregistrement.
              </div>
            )}
          </div>
        )}

        <div className="groupe-titre">
          <span>{lu.lignes.length} lignes lues</span>
          {sansGtin > 0 && <span style={{ color:"#9A7B0A" }}>{sansGtin} sans GTIN</span>}
        </div>

        {sansGtin > 0 && (
          <div className="avis avis-attention">
            Les lignes sans GTIN ne pourront pas être rattachées automatiquement
            à une étiquette. C'est normal pour les produits pesés ou en vrac.
          </div>
        )}

        {lu.lignes.map((l, i) => (
          <div className="ligne" key={i}>
            <div className="ligne-pastille" style={{ background: l.gtin ? "#24705A" : "#D3DAD8" }} />
            <div className="ligne-corps">
              <div className="ligne-nom">{l.designation}</div>
              <div className="ligne-meta">
                {l.marque ? l.marque + " · " : ""}
                <span className="mono">{l.gtin || "sans GTIN"}</span>
                {l.quantite ? ` · ${l.quantite} ${l.unite || ""}` : ""}
              </div>
            </div>
          </div>
        ))}

        <div style={{ padding:"18px 18px 0" }}>
          <button className="btn btn-valider" onClick={valider}>
            {cibleAjout ? "Ajouter ces lignes" : "Enregistrer le bon de livraison"}
          </button>
          <button className="plier" onClick={()=>{ setEtape("liste"); setLu(null); setCibleAjout(null); }}>
            Annuler
          </button>
        </div>
      </div>
    );
  }

  /* --- Détail d'un BL --- */
  if (bl) {
    const cats = [...new Set(bl.lignes.map((l) => l.categorie || "Sans catégorie"))];
    const scannees = bl.lignes.filter((l) => etiquettes.some((e) => e.ligneBlId === l.id)).length;
    return (
      <div>
        <div className="page" style={{ paddingBottom:10 }}>
          <button className="retour" onClick={()=>setOuvert(null)}>← Toutes les livraisons</button>
          <h1 className="page-titre">{bl.fournisseur || "Fournisseur inconnu"}</h1>
          <p className="page-sous" style={{ marginBottom:12 }}>
            BL <span className="mono">{bl.numeroBl || "—"}</span> · reçu le {dateCourte(bl.dateReception)}
            {bl.montantHt != null && <> · <span className="mono">{bl.montantHt.toFixed(2)} €</span> HT</>}
            <br />
            {scannees} ligne{scannees>1?"s":""} sur {bl.lignes.length} avec une étiquette scannée.
          </p>
          <ChampPhoto icone="▥" titre="Ajouter une page"
            aide="Si le bon fait plusieurs pages"
            onFichier={(f)=>analyser(f, bl)} />
        </div>

        {cats.map((cat) => (
          <div key={cat}>
            <div className="groupe-titre"><span>{cat}</span></div>
            {bl.lignes.filter((l)=>(l.categorie || "Sans catégorie")===cat).map((l) => {
              const liees = etiquettes.filter((e) => e.ligneBlId === l.id);
              const suivi = liees.length > 0;
              return (
                <div className="ligne" key={l.id}>
                  <div className="ligne-pastille" style={{ background: suivi ? "#24705A" : "#D3DAD8" }} />
                  <div className="ligne-corps">
                    <div className="ligne-nom">{l.designation}</div>
                    <div className="ligne-meta">
                      {l.marque ? l.marque + " · " : ""}
                      <span className="mono">{l.gtin || "sans GTIN"}</span>
                      {l.quantite ? ` · ${l.quantite} ${l.unite || ""}` : ""}
                      {suivi && liees[0].dlc && <> · DLC <span className="mono">{dateFR(liees[0].dlc)}</span></>}
                    </div>
                  </div>
                  <div className="ligne-etat" style={{ color: suivi ? "#24705A" : "var(--sourd)" }}>
                    {suivi ? "Scanné" : "Non scanné"}
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div style={{ padding:"22px 18px 0" }}>
          <button className="plier" onClick={()=>supprimer(bl.id)}>Supprimer ce bon de livraison</button>
        </div>
        <div style={{ height:20 }} />
      </div>
    );
  }

  /* --- Liste --- */
  return (
    <div>
      <div className="page">
        <h1 className="page-titre">Livraisons</h1>
        <p className="page-sous">
          Le bon de livraison remplit le fournisseur au moment du scan.
          Rien n'oblige à scanner toutes les lignes.
        </p>
        {avis && <div className={`avis avis-${avis.type}`}>{avis.texte}</div>}
        <ChampPhoto icone="▥" titre="Scanner un bon de livraison"
          aide="Tableau entièrement visible, feuille bien à plat"
          onFichier={(f)=>analyser(f)} />
      </div>

      {livraisons.length === 0 && (
        <div className="vide">
          <p className="vide-titre">Aucune livraison</p>
          <p className="vide-texte">
            Scanne le bon à la réception : 30 secondes qui évitent de retaper
            le fournisseur à chaque étiquette.
          </p>
        </div>
      )}

      {livraisons.map((bl) => {
        const n = bl.lignes.filter((l) => etiquettes.some((e) => e.ligneBlId === l.id)).length;
        return (
          <button key={bl.id} className="carte-bl" onClick={()=>setOuvert(bl.id)}>
            <div className="bl-four">{bl.fournisseur || "Fournisseur inconnu"}</div>
            <div className="bl-meta">
              BL <span className="mono">{bl.numeroBl || "—"}</span> · reçu le {dateCourte(bl.dateReception)}
            </div>
            <div className="bl-pied">
              <span className="mono">{bl.lignes.length} lignes</span>
              <span style={{ color:"var(--sourd)" }}>{n} avec étiquette</span>
            </div>
          </button>
        );
      })}
      <div style={{ height:20 }} />
    </div>
  );
}

/* ------------------- Historique ------------------- */

function VueHistorique({ etiquettes, onClic }) {
  const [q, setQ] = useState("");
  const parJour = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = etiquettes.filter((e) => !t ||
      [e.produit, e.marque, e.fournisseur, e.lot, e.gtin].some((v)=>(v||"").toLowerCase().includes(t)));
    const map = new Map();
    f.forEach((e) => { if(!map.has(e.dateScan)) map.set(e.dateScan, []); map.get(e.dateScan).push(e); });
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  }, [etiquettes, q]);

  return (
    <div>
      <div className="page" style={{ paddingBottom:0 }}>
        <h1 className="page-titre">Historique</h1>
        <p className="page-sous">Par jour de scan. Conservation 6 mois pour les DLC.</p>
        <input className="input" value={q} onChange={(e)=>setQ(e.target.value)}
          placeholder="Produit, marque, lot ou GTIN" />
      </div>
      {parJour.length === 0 && (
        <div className="vide">
          <p className="vide-titre">Aucun résultat</p>
          <p className="vide-texte">{q ? "Essaie un autre terme." : "Les étiquettes scannées s'archivent ici."}</p>
        </div>
      )}
      {parJour.map(([jour, liste]) => (
        <div key={jour}>
          <div className="groupe-titre"><span>{dateLongue(jour)}</span><span className="mono">{liste.length}</span></div>
          {liste.map((e)=><CarteEtiquette key={e.id} e={e} onClic={onClic} />)}
        </div>
      ))}
      <div style={{ height:20 }} />
    </div>
  );
}

/* ------------------- Détail d'une étiquette ------------------- */

function Detail({ e, livraisons, onFermer }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true, courant = null;
    photoDe(e.id).then((b) => {
      if (b && vivant) { courant = URL.createObjectURL(b); setUrl(courant); }
    });
    return () => { vivant = false; if (courant) URL.revokeObjectURL(courant); };
  }, [e.id]);

  const bl = e.livraisonId ? livraisons.find((l) => l.id === e.livraisonId) : null;
  const ligne = bl?.lignes.find((l) => l.id === e.ligneBlId);

  return (
    <div className="voile" onClick={onFermer}>
      <div className="panneau" onClick={(ev)=>ev.stopPropagation()}>
        {url && <img src={url} alt="Étiquette archivée" className="panneau-photo" />}
        <div className="panneau-corps">
          <p className="label">Étiquette archivée</p>
          <h2 className="panneau-titre">{e.produit || "Produit non identifié"}</h2>
          {[
            ["Marque", e.marque || "—", false],
            ["Fournisseur", e.fournisseur || "Non renseigné", false],
            ["Code GTIN", e.gtin || "—", true],
            ["Numéro de lot", e.lot || "—", true],
            ["DLC", dateFR(e.dlc), true],
            ["Scanné le", dateLongue(e.dateScan), false],
            ["Saisie", { ia:"Lue automatiquement", manuelle:"Saisie à la main" }[e.source] || "—", false],
            ["Rattachement", { gtin:"Par code GTIN", aucun:"Aucun" }[e.rattachement] || "Aucun", false],
          ].map(([k,v,m]) => (
            <div className="ligne-detail" key={k}>
              <span>{k}</span>
              <span className={m?"mono":""} style={{ fontWeight:600, textAlign:"right" }}>{v}</span>
            </div>
          ))}
          {bl && (
            <div className="encart-bl">
              <p className="match-eyebrow">Bon de livraison</p>
              <div style={{ fontSize:13, lineHeight:1.6 }}>
                {ligne?.designation || "Ligne introuvable"}<br />
                <span style={{ color:"var(--sourd)" }}>
                  {bl.fournisseur} · BL <span className="mono">{bl.numeroBl}</span> ·
                  reçu le {dateCourte(bl.dateReception)}
                </span>
              </div>
            </div>
          )}
          <button className="btn" style={{ marginTop:20 }} onClick={onFermer}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------- Application ------------------- */

export default function App() {
  const [onglet, setOnglet] = useState("alertes");
  const [etiquettes, setEtiquettes] = useState([]);
  const [livraisons, setLivraisons] = useState([]);
  const [detail, setDetail] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [attente, setAttente] = useState(0);
  const [erreur, setErreur] = useState(null);

  const recharger = useCallback(async () => {
    try {
      setEtiquettes(await listerEtiquettes());
      setLivraisons(await listerLivraisons());
      setAttente((await listerAttente()).length);
      setErreur(null);
    } catch (e) {
      setErreur(e.message);
    }
    setChargement(false);
  }, []);

  useEffect(() => { demanderPersistance(); recharger(); }, [recharger]);

  useEffect(() => {
    const revenu = async () => {
      setEnLigne(true);
      const r = await traiterAttente();
      if (r.traitees) recharger(); else setAttente(r.restantes);
    };
    const parti = () => setEnLigne(false);
    window.addEventListener("online", revenu);
    window.addEventListener("offline", parti);
    if (navigator.onLine) revenu();
    return () => {
      window.removeEventListener("online", revenu);
      window.removeEventListener("offline", parti);
    };
  }, [recharger]);

  const urgents = etiquettes.filter((e)=>["perime","aujourdhui"].includes(statutDe(e.dlc))).length;

  const onglets = [
    { cle:"alertes",    icone:"◈", txt:"Alertes",    pastille:urgents },
    { cle:"scanner",    icone:"◉", txt:"Scanner",    pastille:0 },
    { cle:"livraisons", icone:"▥", txt:"Livraisons", pastille:0 },
    { cle:"historique", icone:"▤", txt:"Historique", pastille:0 },
  ];

  return (
    <div className="app">
      <style>{CSS}</style>

      {!enLigne && (
        <div className="bandeau-reseau">
          Hors réseau — les photos sont conservées, la lecture se fera au retour de la connexion.
        </div>
      )}
      {enLigne && attente > 0 && (
        <div className="bandeau-attente">
          {attente} étiquette{attente>1?"s":""} en attente de lecture automatique.
        </div>
      )}
      {erreur && <div className="page"><div className="avis avis-erreur">{erreur}</div></div>}

      {chargement ? (
        <div className="vide"><p className="vide-texte">Chargement…</p></div>
      ) : (
        <>
          {onglet === "alertes" && <VueAlertes etiquettes={etiquettes} onClic={setDetail} />}
          {onglet === "scanner" && <VueScanner onEnregistre={recharger} />}
          {onglet === "livraisons" && <VueLivraisons livraisons={livraisons} etiquettes={etiquettes} onChange={recharger} />}
          {onglet === "historique" && <VueHistorique etiquettes={etiquettes} onClic={setDetail} />}
        </>
      )}

      {detail && <Detail e={detail} livraisons={livraisons} onFermer={()=>setDetail(null)} />}

      <nav className="nav">
        {onglets.map((o)=>(
          <button key={o.cle} className="nav-item" data-actif={onglet===o.cle}
            onClick={()=>setOnglet(o.cle)}>
            <span className="nav-icone">
              {o.icone}
              {o.pastille>0 && <span className="nav-pastille mono">{o.pastille}</span>}
            </span>
            <span className="nav-txt">{o.txt}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
