export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=Chivo+Mono:wght@400;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body, #racine { height: 100%; margin: 0; }

.app {
  --encre:#101A19; --sourd:#5C6B69; --papier:#EEF1F0; --carte:#FFFFFF;
  --trait:#D3DAD8; --petrole:#17323F;
  font-family:'Archivo', system-ui, sans-serif;
  color:var(--encre); background:var(--papier); min-height:100%;
  -webkit-font-smoothing:antialiased;
}
.mono { font-family:'Chivo Mono', ui-monospace, monospace; font-variant-numeric:tabular-nums; }

/* Barre supérieure */
.barre {
  display:flex; align-items:center; justify-content:space-between; gap:24px;
  padding:0 26px; height:60px; background:var(--carte);
  border-bottom:1px solid var(--trait); position:sticky; top:0; z-index:30;
}
.marque { font-size:15px; font-weight:700; letter-spacing:-.01em; display:flex; align-items:baseline; gap:12px; }
.marque-etab { font-size:12px; font-weight:500; color:var(--sourd); }
.nav { display:flex; gap:2px; }
.nav-item {
  position:relative; background:none; border:none; padding:19px 15px 17px; cursor:pointer;
  font-family:inherit; font-size:13px; font-weight:600; color:var(--sourd);
  border-bottom:3px solid transparent;
}
.nav-item:hover { color:var(--encre); }
.nav-item[data-actif="true"] { color:var(--petrole); border-bottom-color:var(--petrole); }
.nav-pastille {
  display:inline-flex; align-items:center; justify-content:center; margin-left:7px;
  background:#A32017; color:#fff; font-size:10px; font-weight:700;
  min-width:17px; height:17px; border-radius:9px; padding:0 5px;
}

.contenu { padding:26px 26px 40px; max-width:1100px; }
.contenu.etroit { max-width:520px; }
.page-titre { font-size:27px; font-weight:800; letter-spacing:-.02em; margin:0 0 4px; }
.page-sous { font-size:13px; color:var(--sourd); margin:0 0 22px; line-height:1.55; }
.aide { font-size:12px; color:var(--sourd); line-height:1.55; margin:7px 0 0; }

/* Bandeau d'état */
.etat { padding:30px 26px 26px; color:#fff; transition:background-color .35s ease; }
.etat-eyebrow { font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:600; opacity:.72; margin:0 0 10px; }
.etat-chiffre { font-size:58px; font-weight:700; line-height:.92; letter-spacing:-.02em; }
.etat-libelle { font-size:18px; font-weight:500; margin-top:8px; opacity:.95; }
.etat-date { font-size:12px; opacity:.68; margin-top:14px; letter-spacing:.04em; }

.groupe-titre {
  font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:600;
  color:var(--sourd); margin:26px 0 11px; display:flex; justify-content:space-between;
  align-items:baseline; max-width:340px;
}

/* Cartes en grille sur desktop */
.grille { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:11px; }
.etiq {
  display:flex; background:var(--carte); border:1px solid var(--trait); border-radius:3px;
  overflow:hidden; text-align:left; padding:0; font-family:inherit; cursor:pointer;
  transition:transform .12s ease, box-shadow .12s ease;
}
.etiq:hover { transform:translateY(-1px); box-shadow:0 3px 10px rgba(16,26,25,.09); }
.etiq:focus-visible { outline:3px solid var(--petrole); outline-offset:2px; }
.etiq-tab {
  flex:0 0 74px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  color:#fff; padding:14px 4px; border-right:2px dashed rgba(255,255,255,.42);
}
.etiq-j { font-size:22px; font-weight:700; line-height:1; }
.etiq-j-sub { font-size:9px; letter-spacing:.12em; margin-top:5px; opacity:.85; text-transform:uppercase; }
.etiq-corps { flex:1; padding:13px 15px; min-width:0; }
.etiq-produit { font-size:15px; font-weight:600; line-height:1.25; margin:0 0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.etiq-meta { font-size:12px; color:var(--sourd); line-height:1.5; }
.etiq-dlc { font-size:12px; margin-top:5px; font-weight:600; }
.drapeau {
  display:inline-block; font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase;
  color:#D4610A; border:1px solid #D4610A; border-radius:2px; padding:1px 5px; margin-left:6px; vertical-align:1px;
}

/* Zone d'import */
.cible {
  border:2px dashed var(--trait); border-radius:4px; background:var(--carte);
  padding:46px 22px; text-align:center; cursor:pointer;
  transition:border-color .15s ease, background-color .15s ease;
}
.cible:hover, .cible[data-survol="true"] { border-color:var(--petrole); background:#F3F7F6; }
.cible-icone { font-size:32px; display:block; margin-bottom:10px; }
.cible-titre { font-size:16px; font-weight:600; display:block; }
.cible-aide { font-size:12px; color:var(--sourd); margin-top:6px; display:block; }
.apercu { width:100%; border-radius:4px; border:1px solid var(--trait); display:block; }

/* Validation à un geste */
.valide { background:var(--carte); border:1px solid var(--trait); border-radius:4px; overflow:hidden; margin-bottom:14px; }
.valide-photo { width:100%; height:190px; object-fit:cover; display:block; border-bottom:1px solid var(--trait); }
.valide-corps { padding:18px; }
.valide-produit { font-size:18px; font-weight:600; line-height:1.3; margin:0; }
.dlc-bloc { display:block; width:100%; text-align:left; background:none; border:none; padding:14px 0 0; font-family:inherit; cursor:pointer; }
.dlc-eyebrow { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; opacity:.75; }
.dlc-date { display:block; font-size:48px; font-weight:700; line-height:1.05; letter-spacing:-.02em; margin-top:4px; }
.dlc-jours { display:block; font-size:13px; font-weight:600; margin-top:4px; }
.dlc-crayon { font-weight:400; opacity:.6; }

/* Caméra */
.camera { position:relative; background:#101A19; border-radius:4px; overflow:hidden; aspect-ratio:4/3; }
.camera-video { width:100%; height:100%; object-fit:cover; display:block; }
.camera-viseur {
  position:absolute; inset:11% 8%; border:2px solid rgba(255,255,255,.72);
  border-radius:3px; pointer-events:none;
  box-shadow:0 0 0 2000px rgba(16,26,25,.28);
}
.cible-camera {
  width:100%; font-family:inherit; color:var(--encre);
  border-style:solid; border-color:var(--petrole); background:var(--carte);
}
.cible-camera:hover { background:#F3F7F6; }
.separateur { display:flex; align-items:center; gap:12px; margin:14px 0; color:var(--sourd); font-size:12px; }
.separateur::before, .separateur::after { content:""; flex:1; height:1px; background:var(--trait); }

/* Formulaire */
.champ { margin-bottom:15px; }
.label { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; color:var(--sourd); margin-bottom:5px; }
.input {
  width:100%; padding:12px 13px; font-size:15px; font-family:inherit;
  border:1px solid var(--trait); border-radius:3px; background:var(--carte); color:var(--encre);
}
.input:focus { outline:none; border-color:var(--petrole); box-shadow:0 0 0 3px rgba(23,50,63,.13); }
.input.mono { font-family:'Chivo Mono', monospace; }

.btn {
  width:100%; padding:15px; font-size:15px; font-weight:600; font-family:inherit; border:none;
  border-radius:3px; background:var(--petrole); color:#fff; cursor:pointer;
}
.btn:hover { background:#1F4356; }
.btn:disabled { background:#97A5A3; cursor:not-allowed; }
.btn-valider { padding:19px; font-size:16px; }
.btn-fant { background:transparent; color:var(--sourd); border:1px solid var(--trait); margin-top:9px; }
.btn-fant:hover { background:var(--carte); color:var(--encre); }
.plier {
  display:block; width:100%; background:none; border:none; padding:14px 0 4px;
  font-family:inherit; font-size:13px; color:var(--sourd); cursor:pointer; text-decoration:underline;
}
.plier:hover { color:var(--encre); }

.avis { padding:12px 14px; border-radius:3px; font-size:13px; line-height:1.55; margin-bottom:16px; }
.avis-attention { background:#FDF4E0; border-left:3px solid #9A7B0A; color:#6B5606; }
.avis-erreur { background:#FBEBEA; border-left:3px solid #A32017; color:#7C1810; }
.avis-ok { background:#E7F3EE; border-left:3px solid #24705A; color:#17513F; }

.vide { text-align:center; padding:56px 28px; color:var(--sourd); }
.vide-titre { font-size:15px; font-weight:600; color:var(--encre); margin-bottom:6px; }
.vide-texte { font-size:13px; line-height:1.6; }

/* Panneau de détail */
.voile { position:fixed; inset:0; background:rgba(16,26,25,.55); display:flex; align-items:center; justify-content:center; z-index:60; padding:30px; }
.panneau { background:#fff; width:100%; max-width:520px; border-radius:4px; max-height:86vh; overflow-y:auto; }
.panneau-photo { width:100%; max-height:300px; object-fit:contain; background:#101A19; display:block; }
.panneau-corps { padding:24px; }
.panneau-titre { font-size:22px; font-weight:700; margin:6px 0 18px; letter-spacing:-.01em; }
.ligne-detail { display:flex; justify-content:space-between; gap:18px; padding:9px 0; border-bottom:1px solid var(--papier); font-size:14px; }
.ligne-detail > span:first-child { color:var(--sourd); flex-shrink:0; }

@media (prefers-reduced-motion:reduce) { * { transition:none !important; animation:none !important; } }
`;
