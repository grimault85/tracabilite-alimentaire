import React, { useState, useEffect, useMemo, useCallback } from "react";
import { CSS } from "./styles.js";

/* =====================================================================
   Traçabilité DLC — interface desktop
   Toutes les données passent par window.api (voir electron/preload.js).
   ===================================================================== */

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

/* ------------------- Compression avant envoi ------------------- */

function compresser(source, maxPx = 1400, qualite = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const r = Math.min(1, maxPx / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * r);
      c.height = Math.round(img.height * r);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      const url = c.toDataURL("image/jpeg", qualite);
      resolve({ url, base64: url.split(",")[1] });
    };
    img.onerror = () => reject(new Error("Image illisible."));
    img.src = source;
  });
}

const depuisFichier = (fichier) => new Promise((resolve, reject) => {
  const l = new FileReader();
  l.onload = () => resolve(l.result);
  l.onerror = () => reject(new Error("Lecture du fichier impossible."));
  l.readAsDataURL(fichier);
});

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
      <div className="grille">{liste.map((e)=><CarteEtiquette key={e.id} e={e} onClic={onClic} />)}</div>
    </>
  ) : null;

  return (
    <div>
      <div className="etat" style={{ background: etat.c }}>
        <p className="etat-eyebrow">{etat.eb}</p>
        {etat.plat
          ? <div className="etat-libelle" style={{ fontSize:24, fontWeight:600 }}>{etat.mot}</div>
          : <><div className="etat-chiffre mono">{etat.n}</div><div className="etat-libelle">{etat.mot}</div></>}
        <div className="etat-date mono">{dateLongue(iso(aujourdhui()))}</div>
      </div>
      <div className="contenu">
        <Groupe titre="Périmés" liste={g.perime} />
        <Groupe titre="Aujourd'hui" liste={g.aujourdhui} />
        <Groupe titre="Sous 3 jours" liste={g.bientot} />
        {!g.perime.length && !g.aujourdhui.length && !g.bientot.length && (
          <div className="vide">
            <p className="vide-titre">Aucune échéance</p>
            <p className="vide-texte">Les produits apparaissent ici trois jours avant leur DLC.</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------- Scanner ------------------- */

function VueScanner({ onEnregistre, cleDefinie }) {
  const [etape, setEtape] = useState("attente");
  const [apercu, setApercu] = useState(null);
  const [base64, setBase64] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [confiance, setConfiance] = useState(null);
  const [survol, setSurvol] = useState(false);
  const [editDlc, setEditDlc] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const [dernier, setDernier] = useState(null);
  const [form, setForm] = useState({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });

  const maj = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const analyser = useCallback(async (dataUrl) => {
    setErreur(null); setEditDlc(false); setDeplie(false);
    setEtape("analyse");
    try {
      const { url, base64: b64 } = await compresser(dataUrl);
      setApercu(url); setBase64(b64);
      const r = await window.api.extraction.lire(b64);
      if (!r.ok) throw new Error(r.erreur);
      const d = r.donnees;
      setForm({ produit:d.produit, marque:d.marque, gtin:d.gtin, lot:d.lot, dlc:d.dlc });
      setConfiance(d.confiance);
      setEtape("verification");
    } catch (e) {
      setErreur(`${e.message} La photo est conservée, complète à la main.`);
      setConfiance(null);
      setEtape("verification");
    }
  }, []);

  useEffect(() => {
    function surCollage(ev) {
      if (etape !== "attente") return;
      const it = [...(ev.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (it) depuisFichier(it.getAsFile()).then(analyser).catch((e)=>setErreur(e.message));
    }
    window.addEventListener("paste", surCollage);
    return () => window.removeEventListener("paste", surCollage);
  }, [etape, analyser]);

  async function choisirFichier() {
    const r = await window.api.photo.choisir();
    if (!r.ok) return setErreur(r.erreur);
    if (!r.donnees) return;
    analyser(`data:image/jpeg;base64,${r.donnees.base64}`);
  }

  async function enregistrer() {
    const donnees = {
      ...form,
      fournisseur: null,
      source: confiance == null ? "manuelle" : "ia",
      confiance,
      rattachement: "aucun",
    };
    const r = await window.api.etiquettes.ajouter(donnees, base64);
    if (!r.ok) return setErreur(r.erreur);
    setDernier(r.donnees);
    onEnregistre();
    setEtape("enregistre");
  }

  function recommencer() {
    setEtape("attente"); setApercu(null); setBase64(null); setErreur(null);
    setConfiance(null); setEditDlc(false); setDeplie(false);
    setForm({ produit:"", marque:"", gtin:"", lot:"", dlc:"" });
  }

  return (
    <div className="contenu etroit">
      <h1 className="page-titre">Scanner une étiquette</h1>
      <p className="page-sous">
        Cadre large : la DLC est souvent tamponnée en dehors de l'étiquette imprimée.
      </p>

      {!cleDefinie && (
        <div className="avis avis-attention">
          Aucune clé API enregistrée : la lecture automatique est désactivée.
          Renseigne-la dans les réglages, ou saisis les informations à la main.
        </div>
      )}

      {etape === "attente" && (
        <div>
          <div className="cible" data-survol={survol}
            onClick={choisirFichier}
            onDragOver={(ev)=>{ev.preventDefault();setSurvol(true);}}
            onDragLeave={()=>setSurvol(false)}
            onDrop={(ev)=>{ev.preventDefault();setSurvol(false);
              const f = ev.dataTransfer.files?.[0];
              if (f?.type.startsWith("image/")) depuisFichier(f).then(analyser).catch((e)=>setErreur(e.message));
            }}>
            <span className="cible-icone">▣</span>
            <span className="cible-titre">Choisir une photo d'étiquette</span>
            <span className="cible-aide">Glisse un fichier ici, ou colle une image avec Ctrl+V</span>
          </div>
          {erreur && <div className="avis avis-erreur" style={{ marginTop:16 }}>{erreur}</div>}
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
          {erreur && <div className="avis avis-erreur">{erreur}</div>}

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

          {confiance != null && confiance < 0.7 && (
            <div className="avis avis-attention">
              Étiquette difficile à lire. Vérifie bien la date avant de valider.
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
          <div className="cible" onClick={choisirFichier}>
            <span className="cible-icone">▣</span>
            <span className="cible-titre">Photo suivante</span>
            <span className="cible-aide">Enchaîne sans repasser par l'accueil</span>
          </div>
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
      [e.produit, e.marque, e.fournisseur, e.lot, e.gtin].some((v)=>(v||"").toLowerCase().includes(t)));
    const map = new Map();
    f.forEach((e) => { if(!map.has(e.dateScan)) map.set(e.dateScan, []); map.get(e.dateScan).push(e); });
    return [...map.entries()].sort((a,b)=>b[0].localeCompare(a[0]));
  }, [etiquettes, q]);

  return (
    <div className="contenu">
      <h1 className="page-titre">Historique des scans</h1>
      <p className="page-sous">Classé par jour. Conservation 6 mois pour les DLC.</p>
      <input className="input" value={q} onChange={(e)=>setQ(e.target.value)}
        placeholder="Produit, marque, lot ou code GTIN" style={{ maxWidth:420, marginBottom:8 }} />
      {parJour.length === 0 && (
        <div className="vide">
          <p className="vide-titre">Aucun résultat</p>
          <p className="vide-texte">{q ? "Essaie un autre terme." : "Les étiquettes scannées s'archivent ici."}</p>
        </div>
      )}
      {parJour.map(([jour, liste]) => (
        <div key={jour}>
          <div className="groupe-titre"><span>{dateLongue(jour)}</span><span className="mono">{liste.length}</span></div>
          <div className="grille">{liste.map((e)=><CarteEtiquette key={e.id} e={e} onClic={onClic} />)}</div>
        </div>
      ))}
    </div>
  );
}

/* ------------------- Réglages ------------------- */

function VueReglages({ config, onConfig, nbEtiquettes }) {
  const [cle, setCle] = useState("");
  const [etab, setEtab] = useState(config.etablissement || "");
  const [message, setMessage] = useState(null);
  const [journal, setJournal] = useState(null);

  async function enregistrer() {
    const patch = { etablissement: etab };
    if (cle.trim()) patch.cleApi = cle.trim();
    const r = await window.api.config.ecrire(patch);
    setMessage(r.ok ? "Réglages enregistrés." : r.erreur);
    setCle("");
    onConfig();
  }

  async function verifier() {
    const r = await window.api.journal.verifier();
    setJournal(r.ok ? r.donnees : { valide:false, motif:r.erreur });
  }

  async function exporter() {
    const r = await window.api.exporter.csv();
    if (!r.ok) return setMessage(r.erreur);
    setMessage(r.donnees ? `Registre exporté vers ${r.donnees}` : null);
  }

  return (
    <div className="contenu etroit">
      <h1 className="page-titre">Réglages</h1>
      <p className="page-sous">{nbEtiquettes} étiquette{nbEtiquettes>1?"s":""} enregistrée{nbEtiquettes>1?"s":""}.</p>

      <div className="champ">
        <label className="label" htmlFor="r-etab">Établissement</label>
        <input id="r-etab" className="input" value={etab} onChange={(e)=>setEtab(e.target.value)}
          placeholder="Ex. Le Noirmoutier" />
      </div>

      <div className="champ">
        <label className="label" htmlFor="r-cle">Clé API Anthropic</label>
        <input id="r-cle" className="input mono" type="password" value={cle}
          onChange={(e)=>setCle(e.target.value)}
          placeholder={config.cleDefinie ? "Clé enregistrée — saisir pour remplacer" : "sk-ant-…"} />
        <p className="aide">
          Stockée en clair dans le dossier de données de l'application, jamais transmise à la fenêtre.
          Pour un déploiement chez un client, mieux vaut passer par un serveur intermédiaire.
        </p>
      </div>

      <button className="btn" onClick={enregistrer}>Enregistrer</button>
      {message && <div className="avis avis-ok" style={{ marginTop:14 }}>{message}</div>}

      <div className="groupe-titre" style={{ margin:"30px 0 10px" }}><span>Registre</span></div>
      <button className="btn btn-fant" onClick={exporter}>Exporter le registre en CSV</button>
      <button className="btn btn-fant" onClick={verifier}>Vérifier l'intégrité du journal</button>
      {journal && (
        <div className={`avis ${journal.valide ? "avis-ok" : "avis-erreur"}`} style={{ marginTop:14 }}>
          {journal.valide
            ? `Journal intact — ${journal.entrees} entrée${journal.entrees>1?"s":""} vérifiée${journal.entrees>1?"s":""}.`
            : `Anomalie à l'entrée ${journal.rupture ?? "?"} : ${journal.motif}`}
        </div>
      )}
      <p className="aide" style={{ marginTop:10 }}>
        Chaque enregistrement porte l'empreinte du précédent. Modifier ou retirer une ligne
        après coup casse la chaîne, et cette vérification le détecte.
      </p>
    </div>
  );
}

/* ------------------- Application ------------------- */

export default function App() {
  const [onglet, setOnglet] = useState("alertes");
  const [etiquettes, setEtiquettes] = useState([]);
  const [config, setConfig] = useState({ etablissement:"", cleDefinie:false });
  const [detail, setDetail] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);

  const recharger = useCallback(async () => {
    const r = await window.api.etiquettes.liste();
    if (r.ok) { setEtiquettes(r.donnees); setErreur(null); }
    else setErreur(r.erreur);
    setChargement(false);
  }, []);

  const rechargerConfig = useCallback(async () => {
    const r = await window.api.config.lire();
    if (r.ok) setConfig(r.donnees);
  }, []);

  useEffect(() => { recharger(); rechargerConfig(); }, [recharger, rechargerConfig]);

  const urgents = etiquettes.filter((e)=>["perime","aujourdhui"].includes(statutDe(e.dlc))).length;

  const onglets = [
    { cle:"alertes",     txt:"Alertes",     pastille:urgents },
    { cle:"scanner",     txt:"Scanner",     pastille:0 },
    { cle:"historique",  txt:"Historique",  pastille:0 },
    { cle:"reglages",    txt:"Réglages",    pastille:0 },
  ];

  return (
    <div className="app">
      <style>{CSS}</style>

      <header className="barre">
        <div className="marque">
          Traçabilité DLC
          {config.etablissement && <span className="marque-etab">{config.etablissement}</span>}
        </div>
        <nav className="nav">
          {onglets.map((o)=>(
            <button key={o.cle} className="nav-item" data-actif={onglet===o.cle}
              onClick={()=>setOnglet(o.cle)}>
              {o.txt}
              {o.pastille>0 && <span className="nav-pastille mono">{o.pastille}</span>}
            </button>
          ))}
        </nav>
      </header>

      {erreur && <div className="contenu"><div className="avis avis-erreur">{erreur}</div></div>}

      {chargement ? (
        <div className="vide"><p className="vide-texte">Chargement…</p></div>
      ) : (
        <>
          {onglet === "alertes" && <VueAlertes etiquettes={etiquettes} onClic={setDetail} />}
          {onglet === "scanner" && <VueScanner onEnregistre={recharger} cleDefinie={config.cleDefinie} />}
          {onglet === "historique" && <VueHistorique etiquettes={etiquettes} onClic={setDetail} />}
          {onglet === "reglages" && <VueReglages config={config} onConfig={rechargerConfig} nbEtiquettes={etiquettes.length} />}
        </>
      )}

      {detail && (
        <div className="voile" onClick={()=>setDetail(null)}>
          <div className="panneau" onClick={(e)=>e.stopPropagation()}>
            {detail.photoPath && (
              <img src={window.api.photo.url(detail.photoPath)} alt="Étiquette archivée" className="panneau-photo" />
            )}
            <div className="panneau-corps">
              <p className="label">Étiquette archivée</p>
              <h2 className="panneau-titre">{detail.produit || "Produit non identifié"}</h2>
              {[
                ["Marque", detail.marque || "—", false],
                ["Fournisseur", detail.fournisseur || "Non renseigné", false],
                ["Code GTIN", detail.gtin || "—", true],
                ["Numéro de lot", detail.lot || "—", true],
                ["DLC", dateFR(detail.dlc), true],
                ["Scanné le", dateLongue(detail.dateScan), false],
                ["Saisie", { ia:"Lue automatiquement", manuelle:"Saisie à la main", corrigee:"Lue puis corrigée" }[detail.source] || "—", false],
              ].map(([k,v,m]) => (
                <div className="ligne-detail" key={k}>
                  <span>{k}</span>
                  <span className={m?"mono":""} style={{ fontWeight:600, textAlign:"right" }}>{v}</span>
                </div>
              ))}
              <button className="btn" style={{ marginTop:20 }} onClick={()=>setDetail(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
