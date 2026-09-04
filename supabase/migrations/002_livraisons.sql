-- =====================================================================
-- TRAÇABILITÉ DLC — Migration 002 : bons de livraison
-- À appliquer après schema_tracabilite.sql
--
-- Principe : le BL sert à PRÉ-REMPLIR le scan d'étiquette, pas à
-- contrôler ce que la cuisine scanne. Une ligne sans étiquette est
-- un choix du client, jamais une anomalie.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LIVRAISONS (un BL photographié)
-- ---------------------------------------------------------------------
create table public.livraisons (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,

  fournisseur      text not null,          -- Transgourmet, Metro, Pomona…
  numero_bl        text,
  date_bl          date,
  date_reception   date not null default current_date,
  montant_ht       numeric(10,2),

  photo_path       text,                   -- page(s) du BL dans Storage
  source_saisie    text not null default 'ia'
                     check (source_saisie in ('ia', 'manuelle', 'corrigee')),
  ia_brut          jsonb,

  saisi_par        uuid references public.profils(id) on delete set null,
  cree_le          timestamptz not null default now()
);

-- Attention : un BL peut contenir des données personnelles
-- (téléphones, codes d'accès du site). À couvrir dans la politique
-- de conservation et le contrat client.

create index idx_livr_etab on public.livraisons(etablissement_id, date_reception desc);
create unique index idx_livr_bl_unique
  on public.livraisons(etablissement_id, fournisseur, numero_bl)
  where numero_bl is not null;

-- ---------------------------------------------------------------------
-- 2. LIGNES DU BL
-- ---------------------------------------------------------------------
create table public.lignes_bl (
  id               uuid primary key default gen_random_uuid(),
  livraison_id     uuid not null references public.livraisons(id) on delete cascade,
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,

  rang             int,                    -- ordre d'apparition sur le BL
  categorie        text,                   -- Ambiant / Frais / Surgelé
  code_article     text,
  designation      text not null,
  marque           text,
  gtin             text,                   -- la clé de jointure avec l'étiquette
  quantite         numeric(10,3),
  unite            text,                   -- POT, BQ, KG, SHT…
  prix_unitaire    numeric(10,3),
  montant_ht       numeric(10,2),

  cree_le          timestamptz not null default now()
);

create index idx_lbl_livraison on public.lignes_bl(livraison_id, rang);
create index idx_lbl_gtin      on public.lignes_bl(etablissement_id, gtin)
  where gtin is not null;

-- ---------------------------------------------------------------------
-- 3. RATTACHEMENT DE L'ÉTIQUETTE
-- ---------------------------------------------------------------------
alter table public.etiquettes
  add column gtin        text,
  add column ligne_bl_id uuid references public.lignes_bl(id) on delete set null,
  add column rattachement text default 'aucun'
    check (rattachement in ('aucun', 'gtin', 'manuel'));

create index idx_etiq_gtin  on public.etiquettes(etablissement_id, gtin) where gtin is not null;
create index idx_etiq_ligne on public.etiquettes(ligne_bl_id) where ligne_bl_id is not null;

-- ---------------------------------------------------------------------
-- 4. RECHERCHE DE LA LIGNE CORRESPONDANTE
--    Appelée juste après la lecture de l'étiquette.
--    Renvoie les candidats, classés du plus récent au plus ancien.
--    L'app propose, l'utilisateur confirme : jamais de rattachement
--    silencieux, un même GTIN pouvant revenir sur plusieurs livraisons.
-- ---------------------------------------------------------------------
create or replace function public.candidats_ligne_bl(
  p_gtin      text,
  p_jours     int default 30
)
returns table (
  ligne_id       uuid,
  designation    text,
  marque         text,
  fournisseur    text,
  numero_bl      text,
  date_reception date,
  quantite       numeric,
  unite          text
)
language sql stable security invoker as $$
  select l.id, l.designation, l.marque,
         v.fournisseur, v.numero_bl, v.date_reception,
         l.quantite, l.unite
  from public.lignes_bl l
  join public.livraisons v on v.id = l.livraison_id
  where l.etablissement_id = public.mon_etablissement()
    and l.gtin = p_gtin
    and v.date_reception >= current_date - p_jours
  order by v.date_reception desc
  limit 5;
$$;

-- ---------------------------------------------------------------------
-- 5. VUE LIVRAISON — état neutre, sans jugement
--    'scanné' / 'non scanné'. Pas de 'manquant' : la cuisine décide
--    de ce qu'elle trace.
-- ---------------------------------------------------------------------
create or replace view public.v_lignes_livraison as
select
  l.id                as ligne_id,
  l.livraison_id,
  l.etablissement_id,
  l.rang,
  l.categorie,
  l.designation,
  l.marque,
  l.gtin,
  l.quantite,
  l.unite,
  count(e.id)         as nb_etiquettes,
  min(e.dlc)          as dlc_la_plus_proche,
  case when count(e.id) > 0 then 'scanne' else 'non_scanne' end as suivi
from public.lignes_bl l
left join public.etiquettes e on e.ligne_bl_id = l.id
group by l.id;

alter view public.v_lignes_livraison set (security_invoker = on);

-- ---------------------------------------------------------------------
-- 6. SÉCURITÉ
-- ---------------------------------------------------------------------
alter table public.livraisons enable row level security;
alter table public.lignes_bl  enable row level security;

create policy "lecture livraisons" on public.livraisons
  for select using (etablissement_id = public.mon_etablissement());
create policy "creation livraisons" on public.livraisons
  for insert with check (etablissement_id = public.mon_etablissement());
create policy "correction livraisons" on public.livraisons
  for update using (etablissement_id = public.mon_etablissement());

create policy "lecture lignes" on public.lignes_bl
  for select using (etablissement_id = public.mon_etablissement());
create policy "creation lignes" on public.lignes_bl
  for insert with check (etablissement_id = public.mon_etablissement());
create policy "correction lignes" on public.lignes_bl
  for update using (etablissement_id = public.mon_etablissement());
