-- =====================================================================
-- TRAÇABILITÉ DLC — Schéma Supabase
-- La Carte / Conseil Restaurant
-- Périmètre MVP : étiquettes fournisseurs, DLC primaire uniquement
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ÉTABLISSEMENTS (un par client)
-- ---------------------------------------------------------------------
create table public.etablissements (
  id           uuid primary key default gen_random_uuid(),
  nom          text not null,
  email_alerte text,                    -- destinataire du récap quotidien
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 2. PROFILS (rattache un compte auth à un établissement)
-- ---------------------------------------------------------------------
create table public.profils (
  id               uuid primary key references auth.users(id) on delete cascade,
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,
  nom              text not null,
  role             text not null default 'cuisine'
                     check (role in ('cuisine', 'responsable', 'admin')),
  cree_le          timestamptz not null default now()
);

create index idx_profils_etablissement on public.profils(etablissement_id);

-- ---------------------------------------------------------------------
-- 3. ÉTIQUETTES (le cœur du système)
-- ---------------------------------------------------------------------
create table public.etiquettes (
  id               uuid primary key default gen_random_uuid(),
  etablissement_id uuid not null references public.etablissements(id) on delete cascade,

  -- Photo
  photo_path       text not null,       -- chemin dans le bucket Storage
  photo_miniature  text,                -- vignette pour les listes

  -- Données extraites de l'étiquette
  produit          text,
  fournisseur      text,
  lot              text,
  dlc              date,

  -- Qualité de la saisie : essentiel pour le suivi terrain
  source_saisie    text not null default 'ia'
                     check (source_saisie in ('ia', 'manuelle', 'corrigee')),
  ia_brut          jsonb,               -- réponse complète du modèle vision
  ia_confiance     numeric(3,2),        -- 0.00 à 1.00

  -- Contexte
  date_scan        date not null default current_date,
  commentaire      text,
  scanne_par       uuid references public.profils(id) on delete set null,

  cree_le          timestamptz not null default now(),
  modifie_le       timestamptz not null default now()
);

-- Index calés sur les 3 usages réels : alertes, archives, recherche lot
create index idx_etiq_dlc      on public.etiquettes(etablissement_id, dlc);
create index idx_etiq_scan     on public.etiquettes(etablissement_id, date_scan desc);
create index idx_etiq_lot      on public.etiquettes(etablissement_id, lot);
create index idx_etiq_recherche on public.etiquettes
  using gin (to_tsvector('french', coalesce(produit,'') || ' ' || coalesce(fournisseur,'')));

-- Mise à jour auto de modifie_le
create or replace function public.touch_modifie_le()
returns trigger language plpgsql as $$
begin
  new.modifie_le := now();
  return new;
end $$;

create trigger trg_etiq_touch
  before update on public.etiquettes
  for each row execute function public.touch_modifie_le();

-- =====================================================================
-- 4. SÉCURITÉ — cloisonnement strict entre clients
--    Le filtrage se fait ICI, pas dans le code de l'app.
-- =====================================================================

create or replace function public.mon_etablissement()
returns uuid language sql stable security definer set search_path = public as $$
  select etablissement_id from public.profils where id = auth.uid()
$$;

alter table public.etablissements enable row level security;
alter table public.profils        enable row level security;
alter table public.etiquettes     enable row level security;

-- Établissements : lecture de son propre établissement seulement
create policy "lecture etablissement" on public.etablissements
  for select using (id = public.mon_etablissement());

-- Profils : voir ses collègues
create policy "lecture collegues" on public.profils
  for select using (etablissement_id = public.mon_etablissement());

-- Étiquettes : accès complet, mais uniquement sur son établissement
create policy "lecture etiquettes" on public.etiquettes
  for select using (etablissement_id = public.mon_etablissement());

create policy "creation etiquettes" on public.etiquettes
  for insert with check (etablissement_id = public.mon_etablissement());

create policy "correction etiquettes" on public.etiquettes
  for update using (etablissement_id = public.mon_etablissement());

-- Pas de policy DELETE : les archives HACCP ne se suppriment pas.
-- La purge après rétention légale se fera par un job avec la clé service.

-- =====================================================================
-- 5. VUE D'ALERTES — alimente directement l'écran d'accueil
-- =====================================================================

create or replace view public.v_alertes_dlc as
select
  e.id,
  e.etablissement_id,
  e.produit,
  e.fournisseur,
  e.lot,
  e.dlc,
  e.photo_path,
  e.photo_miniature,
  (e.dlc - current_date) as jours_restants,
  case
    when e.dlc <  current_date then 'perime'
    when e.dlc =  current_date then 'aujourdhui'
    when e.dlc <= current_date + 3 then 'bientot'
    else 'ok'
  end as statut
from public.etiquettes e
where e.dlc is not null;

-- La vue hérite du RLS de la table sous-jacente
alter view public.v_alertes_dlc set (security_invoker = on);

-- =====================================================================
-- 6. STORAGE — bucket privé pour les photos
-- =====================================================================
-- À exécuter après création du bucket 'etiquettes' (privé) :
--
-- create policy "lecture photos etablissement" on storage.objects
--   for select using (
--     bucket_id = 'etiquettes'
--     and (storage.foldername(name))[1] = public.mon_etablissement()::text
--   );
--
-- create policy "upload photos etablissement" on storage.objects
--   for insert with check (
--     bucket_id = 'etiquettes'
--     and (storage.foldername(name))[1] = public.mon_etablissement()::text
--   );
--
-- Convention de chemin : {etablissement_id}/{AAAA-MM}/{uuid}.jpg
-- Le classement par mois facilite la purge après rétention.
