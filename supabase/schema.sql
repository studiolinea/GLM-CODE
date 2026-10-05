-- Pilotage : les tables et les règles de sécurité de la base en ligne.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.
--
-- Chaque ligne appartient à un compte. La base refuse toute lecture ou écriture
-- par quelqu'un d'autre que le propriétaire de la ligne (Row Level Security).
-- Aucun nom ni e-mail de client n'est gardé.

create table if not exists public.ventes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plateforme text not null,
  numero_commande text not null,
  instant timestamptz not null,
  montant_centimes integer not null check (montant_centimes >= 0),
  frais_centimes integer check (frais_centimes >= 0),
  tva_centimes integer check (tva_centimes >= 0),
  rembourse boolean not null default false,
  produit text not null default '',
  primary key (user_id, plateforme, numero_commande)
);

create table if not exists public.videos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  instant timestamptz not null,
  reseau text not null check (reseau in ('tiktok', 'instagram')),
  lien text,
  vues integer check (vues >= 0),
  primary key (user_id, id)
);

create table if not exists public.reglages (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  objectif_par_jour integer not null default 1 check (objectif_par_jour between 0 and 20),
  couverture timestamptz,
  exemple_termine boolean not null default false
);

create table if not exists public.etats_alertes (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  alerte_id text not null,
  statut text not null check (statut in ('fait', 'plus-tard')),
  le date not null,
  primary key (user_id, alerte_id)
);

alter table public.ventes enable row level security;
alter table public.videos enable row level security;
alter table public.reglages enable row level security;
alter table public.etats_alertes enable row level security;

drop policy if exists "Chacun ses ventes" on public.ventes;
create policy "Chacun ses ventes" on public.ventes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Chacun ses vidéos" on public.videos;
create policy "Chacun ses vidéos" on public.videos for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Chacun ses réglages" on public.reglages;
create policy "Chacun ses réglages" on public.reglages for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Chacun ses alertes" on public.etats_alertes;
create policy "Chacun ses alertes" on public.etats_alertes for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Seuls les comptes connectés passent par l'API ; les visiteurs anonymes n'ont accès à rien.
revoke all on public.ventes, public.videos, public.reglages, public.etats_alertes from anon;
grant select, insert, update, delete on public.ventes, public.videos, public.reglages, public.etats_alertes to authenticated;
