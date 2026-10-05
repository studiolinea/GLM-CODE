-- Pilotage : autoriser les boutiques Stripe (et Shopify plus tard) dans les comptes reliés.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.

alter table public.comptes_relies drop constraint if exists comptes_relies_source_check;
alter table public.comptes_relies add constraint comptes_relies_source_check
  check (source in ('stripe', 'lemonsqueezy', 'shopify', 'tiktok', 'instagram'));
