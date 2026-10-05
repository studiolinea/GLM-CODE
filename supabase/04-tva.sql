-- Pilotage : garder la TVA retenue par la boutique (Stripe Managed Payments) avec chaque vente.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.

alter table public.ventes add column if not exists tva_centimes integer check (tva_centimes >= 0);
