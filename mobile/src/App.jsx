import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { CSS } from "./styles.js";
import {
  listerEtiquettes, enregistrerEtiquette, mettreEnAttente, listerAttente,
  photoDe, demanderPersistance, espace,
} from "./stockage.js";
import {
  lireEtiquette, compresser, depuisFichier, traiterAttente, configuree,
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

function badgeJours(dlc) {
  const j = joursRestants(dlc);
  if (j === null) return { haut:"?", bas:"sans dlc" };
  if (j < 0) return { haut:`+${Math.abs(j)}`, bas:"dépassé" };
  if (j === 0) return { haut:"0", bas:"aujourd'hui" };
  return { haut:`${j}`, bas: j > 1 ? "jours" : "jour" };
}

/* ------------------- Carte ------------------- */

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

/* ------------------- Scanner ------------------- */

function VueScanner({ onEnregistre }) {
  const [etape, setEtape] = useState("attente");
  const [apercu, setApercu] = useState(null);
  const [blob, setBlob] = useState(null);
  const [avis, setAvis] = useState(null);           // { type, texte }
  const [confiance, setConfiance] = useState(null);
  const [editDlc, setEditDlc] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [dernier, setDernier] = useState(null);
  const [horsLigne, setHorsLigne] = useState(false);
  const [form, setForm] = useState({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });
  const inputRef = useRef(null);

  const maj = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const analyser = useCallback(async (dataUrl) => {
    setAvis(null); setEditDlc(false); setDeplie(false); setHorsLigne(false);
    setEtape("analyse");
    try {
      const { blob: b, base64 } = await compresser(dataUrl);
      setApercu(URL.createObjectURL(b));
      setBlob(b);
      try {
        const d = await lireEtiquette(base64);
        setForm({ produit:d.produit, marque:d.marque, gtin:d.gtin, lot:d.lot, dlc:d.dlc });
        setConfiance(d.confiance);
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
  }, []);

  async function enregistrer() {
    const donnees = {
      ...form,
      fournisseur: null,
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
    setForm({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });
    if (inputRef.current) inputRef.current.value = "";
  }

  const ChampPhoto = ({ titre, aide }) => (
    <label className="cible">
      <input ref={inputRef} className="cible-input" type="file"
        accept="image/*" capture="environment"
        onChange={(ev)=>{
          const f = ev.target.files?.[0];
          if (f) depuisFichier(f).then(analyser).catch((e)=>setAvis({type:"erreur",texte:e.message}));
        }} />
      <span className="cible-icone">◉</span>
      <span className="cible-titre">{titre}</span>
      {aide && <span className="cible-aide">{aide}</span>}
    </label>
  );

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
          <ChampPhoto titre="Prendre la photo" aide="Étiquette bien à plat, sans reflet" />
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

          <button className="btn btn-valider" onClick={enregistrer} disabled={!form.dlc}>
            {form.dlc ? "Valider" : "Renseigne la date pour valider"}
          </button>
          <button className="plier" onClick={()=>setDeplie((v)=>!v)}>
            {deplie ? "Masquer les détails" : "Modifier les détails"}
          </button>

          {deplie && (
            <div style={{ marginTop:14 }}>
              {[["produit","Produit","Ex. Jambon cuit torchon",false],
                ["marque","Marque","Ex. Madrange",false],
                ["gtin","Code GTIN","13 chiffres",true],
                ["lot","Numéro de lot","Ex. 6110118072",true]].map(([k,l,p,m])=>(
                <div className="champ" key={k}>
                  <label className="label" htmlFor={`f-${k}`}>{l}</label>
                  <input id={`f-${k}`} className={`input${m?" mono":""}`} value={form[k]}
                    onChange={(e)=>maj(k, e.target.value)} placeholder={p} />
                </div>
              ))}
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
          <ChampPhoto titre="Étiquette suivante" aide="Enchaîne sans repasser par l'accueil" />
          <button className="plier" onClick={recommencer}>Terminer</button>
        </div>
      )}
    </div>
  );
}

/* ------------------- Historique ------------------- */

function VueHistorique({ etiquettes, onClic }) {
  const [q, setQ] = useState("");
  const parJour = useMemo(() => {
    const t = q.trim().toLowerCase();
    const f = etiquettes.filter((e) => !t ||
      [e.produit, e.marque, e.lot, e.gtin].some((v)=>(v||"").toLowerCase().includes(t)));
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

/* ------------------- Détail ------------------- */

function Detail({ e, onFermer }) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let vivant = true, courant = null;
    photoDe(e.id).then((b) => {
      if (b && vivant) { courant = URL.createObjectURL(b); setUrl(courant); }
    });
    return () => { vivant = false; if (courant) URL.revokeObjectURL(courant); };
  }, [e.id]);

  return (
    <div className="voile" onClick={onFermer}>
      <div className="panneau" onClick={(ev)=>ev.stopPropagation()}>
        {url && <img src={url} alt="Étiquette archivée" className="panneau-photo" />}
        <div className="panneau-corps">
          <p className="label">Étiquette archivée</p>
          <h2 className="panneau-titre">{e.produit || "Produit non identifié"}</h2>
          {[
            ["Marque", e.marque || "—", false],
            ["Code GTIN", e.gtin || "—", true],
            ["Numéro de lot", e.lot || "—", true],
            ["DLC", dateFR(e.dlc), true],
            ["Scanné le", dateLongue(e.dateScan), false],
            ["Saisie", { ia:"Lue automatiquement", manuelle:"Saisie à la main" }[e.source] || "—", false],
          ].map(([k,v,m]) => (
            <div className="ligne-detail" key={k}>
              <span>{k}</span>
              <span className={m?"mono":""} style={{ fontWeight:600, textAlign:"right" }}>{v}</span>
            </div>
          ))}
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
  const [detail, setDetail] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [enLigne, setEnLigne] = useState(navigator.onLine);
  const [attente, setAttente] = useState(0);
  const [stockage, setStockage] = useState(null);

  const recharger = useCallback(async () => {
    setEtiquettes(await listerEtiquettes());
    setAttente((await listerAttente()).length);
    setChargement(false);
  }, []);

  useEffect(() => {
    demanderPersistance();
    espace().then(setStockage);
    recharger();
  }, [recharger]);

  useEffect(() => {
    const enLigneMaj = async () => {
      setEnLigne(true);
      const r = await traiterAttente();
      if (r.traitees) recharger(); else setAttente(r.restantes);
    };
    const horsLigne = () => setEnLigne(false);
    window.addEventListener("online", enLigneMaj);
    window.addEventListener("offline", horsLigne);
    if (navigator.onLine) enLigneMaj();
    return () => {
      window.removeEventListener("online", enLigneMaj);
      window.removeEventListener("offline", horsLigne);
    };
  }, [recharger]);

  const urgents = etiquettes.filter((e)=>["perime","aujourdhui"].includes(statutDe(e.dlc))).length;

  const onglets = [
    { cle:"alertes",    icone:"◈", txt:"Alertes",    pastille:urgents },
    { cle:"scanner",    icone:"◉", txt:"Scanner",    pastille:0 },
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

      {chargement ? (
        <div className="vide"><p className="vide-texte">Chargement…</p></div>
      ) : (
        <>
          {onglet === "alertes" && <VueAlertes etiquettes={etiquettes} onClic={setDetail} />}
          {onglet === "scanner" && <VueScanner onEnregistre={recharger} />}
          {onglet === "historique" && <VueHistorique etiquettes={etiquettes} onClic={setDetail} />}
        </>
      )}

      {detail && <Detail e={detail} onFermer={()=>setDetail(null)} />}

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
