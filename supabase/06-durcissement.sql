-- Pilotage : durcissement de la base. À lancer après 05-plusieurs-business.sql.
-- À coller dans Supabase > SQL Editor > New query, puis « Run ». On peut le relancer sans risque.

-- 1. Les comptes connectés n'ont besoin que de lire, ajouter, modifier et supprimer leurs propres lignes.
--    Supabase leur donne aussi « truncate » par défaut (vider toute une table, sans les règles de sécurité) : on l'enlève.
revoke truncate, references, trigger
  on public.ventes, public.videos, public.reglages, public.etats_alertes, public.comptes_relies, public.business
  from authenticated, anon;

-- 2. Tailles maximales : un compte ne peut pas remplir la base avec de très longs textes.
--    « not valid » : les lignes déjà présentes ne sont pas revérifiées, seules les nouvelles le sont.
alter table public.comptes_relies drop constraint if exists comptes_relies_tailles;
alter table public.comptes_relies add constraint comptes_relies_tailles check (
  char_length(cle_chiffree) <= 8192 and char_length(libelle) <= 300 and char_length(identifiant) <= 200
  and char_length(coalesce(derniere_erreur, '')) <= 1000
) not valid;

alter table public.ventes drop constraint if exists ventes_tailles;
alter table public.ventes add constraint ventes_tailles check (
  char_length(plateforme) <= 50 and char_length(numero_commande) <= 200 and char_length(produit) <= 1000
) not valid;

alter table public.videos drop constraint if exists videos_tailles;
alter table public.videos add constraint videos_tailles check (
  char_length(id) <= 200 and (lien is null or (char_length(lien) <= 1000 and lien ~* '^https?://'))
) not valid;

alter table public.etats_alertes drop constraint if exists etats_alertes_tailles;
alter table public.etats_alertes add constraint etats_alertes_tailles check (char_length(alerte_id) <= 300) not valid;
