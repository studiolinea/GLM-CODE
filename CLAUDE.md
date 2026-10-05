# Consignes pour travailler sur Pilotage

- **Kévin ne lit pas l'anglais.** Réponses, textes de l'appli, commits et documents : en français simple.
  Il dicte souvent à la voix : suivre l'intention, sans corriger son orthographe.
- Le besoin est dans `docs/ECOMMERCE-spec-01-appli-pilotage-v1.md`, l'ordre de travail dans
  `docs/ECOMMERCE-plan-01-construction.md`. Mettre à jour le tableau « Où on en est » du README
  à la fin de chaque étape.
- **Jamais de chiffre inventé.** S'il manque une donnée, l'appli l'écrit (« — », « pas encore de
  données », « frais non fournis par la boutique »). Les données d'exemple sont toujours signalées.
- **Aucun nom ni e-mail de client** n'est gardé : seulement date, montant, frais, remboursé, produit,
  numéro de commande.
- Tout est calculé en **heure de Paris** (`src/temps.ts`). Les montants sont en **centimes** (`src/argent.ts`).
- `src/calculs/` et `src/alertes/` ne dépendent ni des écrans ni d'internet : chaque règle a ses tests
  dans `tests/`. Lancer `npm run verifier` avant chaque commit.
- Données : sans `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, tout reste sur l'appareil ; avec, tout passe par le
  compte en ligne (`src/donnees/depot.ts`, `synchro.ts`, `depotSupabase.ts`). Les données d'exemple ne vont jamais
  dans la base. Ne jamais mettre une clé secrète (« service_role », « secret ») dans le code ou le `.env`.
- Aucune inscription à un service, aucun paiement, aucun achat sans l'accord explicite de Kévin.
