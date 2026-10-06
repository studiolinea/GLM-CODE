-- Pilotage : plusieurs business par compte.
-- Chaque vente, vidéo, réglage, voyant et compte relié appartient maintenant à un business.
-- Les données déjà présentes vont dans un premier business, « Mon premier business », renommable dans l'appli.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.

create table if not exists public.business (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  nom text not null check (char_length(nom) between 1 and 60),
  cree_le timestamptz not null default now(),
  unique (id, user_id)
);

alter table public.business enable row level security;
drop policy if exists "Chacun ses business" on public.business;
create policy "Chacun ses business" on public.business for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.business from anon;
grant select, insert, update, delete on public.business to authenticated;

-- Un premier business pour chaque compte qui n'en a pas encore.
insert into public.business (user_id, nom)
select u.id, 'Mon premier business'
from auth.users u
where not exists (select 1 from public.business b where b.user_id = u.id);

-- Les données déjà présentes vont dans le premier business du compte.

-- Ventes
alter table public.ventes add column if not exists business_id uuid;
update public.ventes t set business_id = (
  select b.id from public.business b where b.user_id = t.user_id order by b.cree_le, b.id limit 1
) where t.business_id is null;
alter table public.ventes alter column business_id set not null;
alter table public.ventes drop constraint if exists ventes_pkey;
alter table public.ventes add primary key (user_id, business_id, plateforme, numero_commande);
alter table public.ventes drop constraint if exists ventes_business_fk;
alter table public.ventes add constraint ventes_business_fk
  foreign key (business_id, user_id) references public.business (id, user_id) on delete cascade;

-- Vidéos
alter table public.videos add column if not exists business_id uuid;
update public.videos t set business_id = (
  select b.id from public.business b where b.user_id = t.user_id order by b.cree_le, b.id limit 1
) where t.business_id is null;
alter table public.videos alter column business_id set not null;
alter table public.videos drop constraint if exists videos_pkey;
alter table public.videos add primary key (user_id, business_id, id);
alter table public.videos drop constraint if exists videos_business_fk;
alter table public.videos add constraint videos_business_fk
  foreign key (business_id, user_id) references public.business (id, user_id) on delete cascade;

-- Réglages (objectif de vidéos, date des ventes, exemple terminé) : un par business
alter table public.reglages add column if not exists business_id uuid;
update public.reglages t set business_id = (
  select b.id from public.business b where b.user_id = t.user_id order by b.cree_le, b.id limit 1
) where t.business_id is null;
alter table public.reglages alter column business_id set not null;
alter table public.reglages drop constraint if exists reglages_pkey;
alter table public.reglages add primary key (user_id, business_id);
alter table public.reglages drop constraint if exists reglages_business_fk;
alter table public.reglages add constraint reglages_business_fk
  foreign key (business_id, user_id) references public.business (id, user_id) on delete cascade;

-- Voyants rangés
alter table public.etats_alertes add column if not exists business_id uuid;
update public.etats_alertes t set business_id = (
  select b.id from public.business b where b.user_id = t.user_id order by b.cree_le, b.id limit 1
) where t.business_id is null;
alter table public.etats_alertes alter column business_id set not null;
alter table public.etats_alertes drop constraint if exists etats_alertes_pkey;
alter table public.etats_alertes add primary key (user_id, business_id, alerte_id);
alter table public.etats_alertes drop constraint if exists etats_alertes_business_fk;
alter table public.etats_alertes add constraint etats_alertes_business_fk
  foreign key (business_id, user_id) references public.business (id, user_id) on delete cascade;

-- Comptes reliés : par business, et plusieurs comptes d'un même réseau (par exemple plusieurs TikTok).
-- « identifiant » distingue ces comptes (vide pour une boutique : une seule par business et par plateforme).
alter table public.comptes_relies add column if not exists business_id uuid;
alter table public.comptes_relies add column if not exists identifiant text not null default '';
update public.comptes_relies t set business_id = (
  select b.id from public.business b where b.user_id = t.user_id order by b.cree_le, b.id limit 1
) where t.business_id is null;
alter table public.comptes_relies alter column business_id set not null;
alter table public.comptes_relies drop constraint if exists comptes_relies_pkey;
alter table public.comptes_relies add primary key (user_id, business_id, source, identifiant);
alter table public.comptes_relies drop constraint if exists comptes_relies_business_fk;
alter table public.comptes_relies add constraint comptes_relies_business_fk
  foreign key (business_id, user_id) references public.business (id, user_id) on delete cascade;
