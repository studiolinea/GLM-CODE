# Pilotage

L'appli de pilotage de la boutique de Kévin : elle regarde les ventes de la boutique et les
vidéos TikTok/Instagram, et dit en français simple ce qui va, ce qui cloche et quoi faire,
avec les chiffres qui le prouvent.

- Ce qu'elle doit faire : [docs/ECOMMERCE-spec-01-appli-pilotage-v1.md](docs/ECOMMERCE-spec-01-appli-pilotage-v1.md)
- Comment on la construit, étape par étape : [docs/ECOMMERCE-plan-01-construction.md](docs/ECOMMERCE-plan-01-construction.md)

## Où on en est

| Étape | État |
|---|---|
| 0. Préparer le terrain | ✅ |
| 1. Lire les ventes et faire le résumé | ✅ |
| 2. Les alertes A, B, C | ✅ |
| 3. Les écrans, avec les données d'exemple | ✅ fait, le look reste à valider par Kévin |
| 4. Ce que Kévin peut faire dans l'appli | ✅ (données gardées sur l'appareil jusqu'à l'étape 5) |
| 5. Les mêmes données sur le Mac et le téléphone | code prêt, testé avec une base simulée ; en attente du projet Supabase de Kévin |
| 6. Mettre l'appli en ligne | à faire |
| 7. Lire le vrai fichier de la boutique | à faire |
| 8. Vérifier avec de vraies ventes | à faire |

## La base en ligne (Supabase)

- Tables et règles de sécurité : [supabase/schema.sql](supabase/schema.sql), à coller dans Supabase > SQL Editor.
- L'appli lit l'adresse du projet et sa clé publique dans `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`
  (fichier `.env`, valeurs publiques seulement, jamais la clé secrète).
- Sans ces deux valeurs, l'appli garde les données sur l'appareil (c'est le cas de la version de test,
  construite avec `VITE_SUPABASE_URL= VITE_SUPABASE_ANON_KEY= npm run build`).
- Les données d'exemple ne sont jamais écrites dans la base.

## Mise en ligne (Cloudflare)

Cloudflare reconstruit et publie l'appli à chaque modification de la branche `main`
(commande de build `npm run build`, puis `npx wrangler deploy` avec `wrangler.jsonc`).

## Commandes

```bash
npm install        # une seule fois
npm run dev        # ouvre l'appli sur l'ordinateur
npm test           # lance les tests
npm run verifier   # vérifie les types puis lance les tests
npm run build      # prépare la version à mettre en ligne
```

## Le format d'exemple du fichier de ventes

En attendant de choisir la plateforme de la boutique, l'appli lit un CSV simple
(virgules, points-virgules ou tabulations) :

| Colonne | Exemple | Remarque |
|---|---|---|
| `numero_commande` | `1001` | obligatoire, sert à éviter les doublons |
| `date` | `2026-10-05 10:15` ou `05/10/2026 10:15` | heure de Paris |
| `montant` | `19,90` | ce que le client a payé |
| `frais` | `1,50` | vide si la boutique ne les donne pas |
| `rembourse` | `oui` / `non` | vide = non |
| `produit` | `Guide detailing` | |

Exemple complet : [tests/fichiers/ventes-exemple.csv](tests/fichiers/ventes-exemple.csv).
