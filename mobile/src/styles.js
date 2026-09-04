export const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;800&family=Chivo+Mono:wght@400;600;700&display=swap');

*, *::before, *::after { box-sizing: border-box; }
html, body, #racine { margin: 0; }

.app {
  --encre:#101A19; --sourd:#5C6B69; --papier:#EEF1F0; --carte:#FFFFFF;
  --trait:#D3DAD8; --petrole:#17323F;
  font-family:'Archivo', system-ui, sans-serif;
  color:var(--encre); background:var(--papier);
  min-height:100dvh; max-width:560px; margin:0 auto;
  padding-bottom:calc(76px + env(safe-area-inset-bottom));
  -webkit-font-smoothing:antialiased; -webkit-tap-highlight-color:transparent;
}
.mono { font-family:'Chivo Mono', ui-monospace, monospace; font-variant-numeric:tabular-nums; }

.page { padding:22px 18px 8px; }
.page-titre { font-size:26px; font-weight:800; letter-spacing:-.02em; margin:0 0 4px; }
.page-sous { font-size:13px; color:var(--sourd); margin:0 0 20px; line-height:1.55; }

/* Bandeaux réseau */
.bandeau-reseau, .bandeau-attente { padding:11px 18px; font-size:12.5px; line-height:1.45; font-weight:500; }
.bandeau-reseau { background:#3A2C08; color:#FFE7A8; }
.bandeau-attente { background:#17323F; color:#D6E4E8; }

/* Bandeau d'état : la couleur dit l'état de la cuisine avant la lecture */
.etat { padding:26px 18px 22px; color:#fff; transition:background-color .35s ease; }
.etat-eyebrow { font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:600; opacity:.72; margin:0 0 10px; }
.etat-chiffre { font-size:52px; font-weight:700; line-height:.92; letter-spacing:-.02em; }
.etat-libelle { font-size:17px; font-weight:500; margin-top:8px; opacity:.95; }
.etat-date { font-size:12px; opacity:.68; margin-top:14px; letter-spacing:.04em; }

.groupe-titre {
  font-size:11px; letter-spacing:.16em; text-transform:uppercase; font-weight:600;
  color:var(--sourd); margin:24px 18px 10px; display:flex;
  justify-content:space-between; align-items:baseline;
}

/* Carte étiquette : reprend la forme de l'étiquette physique */
.etiq {
  display:flex; width:calc(100% - 36px); margin:0 18px 10px;
  background:var(--carte); border:1px solid var(--trait); border-radius:3px;
  overflow:hidden; text-align:left; padding:0; font-family:inherit; cursor:pointer;
}
.etiq:active { background:#F7F9F8; }
.etiq:focus-visible { outline:3px solid var(--petrole); outline-offset:2px; }
.etiq-tab {
  flex:0 0 72px; display:flex; flex-direction:column; align-items:center; justify-content:center;
  color:#fff; padding:14px 4px; border-right:2px dashed rgba(255,255,255,.42);
}
.etiq-j { font-size:21px; font-weight:700; line-height:1; }
.etiq-j-sub { font-size:9px; letter-spacing:.12em; margin-top:5px; opacity:.85; text-transform:uppercase; }
.etiq-corps { flex:1; padding:12px 14px; min-width:0; }
.etiq-produit { font-size:15px; font-weight:600; line-height:1.25; margin:0 0 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.etiq-meta { font-size:12px; color:var(--sourd); line-height:1.5; }
.etiq-dlc { font-size:12px; margin-top:5px; font-weight:600; }
.drapeau {
  display:inline-block; font-size:10px; font-weight:600; letter-spacing:.07em; text-transform:uppercase;
  color:#D4610A; border:1px solid #D4610A; border-radius:2px; padding:1px 5px; margin-left:6px; vertical-align:1px;
}

/* Prise de vue : le champ fichier natif couvre toute la cible, c'est le
   doigt qui l'active — un clic déclenché par script est bloqué en webview. */
.cible {
  position:relative; display:block; width:100%;
  border:2px solid var(--petrole); border-radius:4px; background:var(--carte);
  padding:46px 20px; text-align:center; cursor:pointer; color:var(--encre);
}
.cible:active { background:#F3F7F6; }
.cible:focus-within { box-shadow:0 0 0 3px rgba(23,50,63,.15); }
.cible-input { position:absolute; inset:0; width:100%; height:100%; opacity:0; font-size:0; }
.cible-icone { font-size:34px; display:block; margin-bottom:10px; }
.cible-titre { font-size:17px; font-weight:600; display:block; }
.cible-aide { font-size:12px; color:var(--sourd); margin-top:6px; display:block; }
.apercu { width:100%; border-radius:4px; border:1px solid var(--trait); display:block; }

/* Validation à un geste */
.valide { background:var(--carte); border:1px solid var(--trait); border-radius:4px; overflow:hidden; margin-bottom:14px; }
.valide-photo { width:100%; height:170px; object-fit:cover; display:block; border-bottom:1px solid var(--trait); }
.valide-corps { padding:16px; }
.valide-produit { font-size:17px; font-weight:600; line-height:1.3; margin:0; }
.dlc-bloc { display:block; width:100%; text-align:left; background:none; border:none; padding:14px 0 0; font-family:inherit; cursor:pointer; }
.dlc-eyebrow { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; opacity:.75; }
.dlc-date { display:block; font-size:46px; font-weight:700; line-height:1.05; letter-spacing:-.02em; margin-top:4px; }
.dlc-jours { display:block; font-size:13px; font-weight:600; margin-top:4px; }
.dlc-crayon { font-weight:400; opacity:.6; }

/* Formulaire — 16px minimum, sinon le navigateur zoome à la saisie */
.champ { margin-bottom:14px; }
.label { display:block; font-size:10px; letter-spacing:.14em; text-transform:uppercase; font-weight:600; color:var(--sourd); margin-bottom:5px; }
.input {
  width:100%; padding:13px; font-size:16px; font-family:inherit;
  border:1px solid var(--trait); border-radius:3px; background:var(--carte); color:var(--encre);
}
.input:focus { outline:none; border-color:var(--petrole); box-shadow:0 0 0 3px rgba(23,50,63,.13); }
.input.mono { font-family:'Chivo Mono', monospace; }

.btn {
  width:100%; padding:16px; font-size:15px; font-weight:600; font-family:inherit; border:none;
  border-radius:3px; background:var(--petrole); color:#fff; cursor:pointer;
}
.btn:disabled { background:#97A5A3; }
.btn-valider { padding:20px; font-size:17px; }
.plier {
  display:block; width:100%; background:none; border:none; padding:15px 0 4px;
  font-family:inherit; font-size:13px; color:var(--sourd); cursor:pointer; text-decoration:underline;
}

.avis { padding:12px 14px; border-radius:3px; font-size:13px; line-height:1.55; margin-bottom:16px; }
.avis-attention { background:#FDF4E0; border-left:3px solid #9A7B0A; color:#6B5606; }
.avis-erreur { background:#FBEBEA; border-left:3px solid #A32017; color:#7C1810; }
.avis-ok { background:#E7F3EE; border-left:3px solid #24705A; color:#17513F; }

.vide { text-align:center; padding:50px 26px; color:var(--sourd); }
.vide-titre { font-size:15px; font-weight:600; color:var(--encre); margin-bottom:6px; }
.vide-texte { font-size:13px; line-height:1.6; }

/* Détail */
.voile { position:fixed; inset:0; background:rgba(16,26,25,.55); display:flex; align-items:flex-end; justify-content:center; z-index:60; }
.panneau { background:#fff; width:100%; max-width:560px; border-radius:4px 4px 0 0; max-height:88dvh; overflow-y:auto; }
.panneau-photo { width:100%; max-height:280px; object-fit:contain; background:#101A19; display:block; }
.panneau-corps { padding:22px 18px calc(26px + env(safe-area-inset-bottom)); }
.panneau-titre { font-size:21px; font-weight:700; margin:6px 0 16px; letter-spacing:-.01em; }
.ligne-detail { display:flex; justify-content:space-between; gap:16px; padding:9px 0; border-bottom:1px solid var(--papier); font-size:14px; }
.ligne-detail > span:first-child { color:var(--sourd); flex-shrink:0; }

/* Navigation basse : atteignable au pouce, cibles larges pour mains gantées */
.nav {
  position:fixed; bottom:0; left:50%; transform:translateX(-50%);
  width:100%; max-width:560px; display:flex; background:var(--carte);
  border-top:1px solid var(--trait); z-index:40;
  padding-bottom:env(safe-area-inset-bottom);
}
.nav-item {
  flex:1; padding:12px 2px 15px; background:none; border:none; cursor:pointer;
  font-family:inherit; color:var(--sourd); display:flex; flex-direction:column;
  align-items:center; gap:5px; border-top:3px solid transparent; margin-top:-1px; min-height:62px;
}
.nav-item[data-actif="true"] { color:var(--petrole); border-top-color:var(--petrole); }
.nav-icone { font-size:19px; line-height:1; position:relative; }
.nav-txt { font-size:10px; font-weight:600; letter-spacing:.06em; text-transform:uppercase; }
.nav-pastille {
  position:absolute; top:-5px; left:13px; background:#A32017; color:#fff;
  font-size:9px; font-weight:700; min-width:16px; height:16px; border-radius:8px;
  display:flex; align-items:center; justify-content:center; padding:0 4px;
}

@media (prefers-reduced-motion:reduce) { * { transition:none !important; animation:none !important; } }
`;
