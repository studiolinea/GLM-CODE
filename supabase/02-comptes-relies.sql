-- Pilotage : les comptes reliés (boutique, TikTok, Instagram), compte par compte.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.
--
-- La clé d'accès de chaque compte relié est chiffrée par le serveur de l'appli (Cloudflare)
-- avant d'arriver ici : sans la clé de chiffrement du serveur, elle est illisible.
-- Chacun ne voit et ne modifie que ses propres comptes reliés.

create table if not exists public.comptes_relies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null check (source in ('stripe', 'lemonsqueezy', 'shopify', 'tiktok', 'instagram')),
  cle_chiffree text not null,
  libelle text not null default '',
  relie_le timestamptz not null default now(),
  derniere_synchro timestamptz,
  derniere_erreur text,
  primary key (user_id, source)
);

alter table public.comptes_relies enable row level security;

drop policy if exists "Chacun ses comptes reliés" on public.comptes_relies;
create policy "Chacun ses comptes reliés" on public.comptes_relies for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.comptes_relies from anon;
grant select, insert, update, delete on public.comptes_relies to authenticated;
