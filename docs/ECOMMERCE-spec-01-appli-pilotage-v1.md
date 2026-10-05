---
titre: "E-Commerce — spec 01 : appli de pilotage, version 1 (saisie simple + fichier de la boutique)"
projet: E-Commerce
tiroir: spec
date: 2026-10-05
auteur: Claude (session cloud, depuis le téléphone), suite de la session Mac du 5 octobre
statut: validée par Kévin le 2026-10-05 (« Aller go »), plan de construction écrit : [[ECOMMERCE-plan-01-construction]]
tags: [business, e-commerce, application, spec, onzetable]
---

# E-Commerce — spec 01 : l'appli de pilotage, version 1

> Suite directe de la conversation Mac du 5 octobre. Le Mac s'est déconnecté juste après
> l'activation de Remote Control, avant d'écrire cette spec. Elle a été reprise et écrite depuis
> le téléphone. Référence vidéo : [[2026-10-05-video-onzetable-brief-application]].

## En une phrase

Une appli qui regarde les ventes de ta boutique et tes vidéos TikTok/Insta, et te dit en français
simple ce qui va, ce qui cloche et quoi faire, avec les chiffres qui le prouvent.

## Décisions déjà prises (Kévin, 5 octobre)

- L'appli sert **d'abord à Kévin**. Si elle donne des résultats concrets, on la vendra à d'autres vendeurs.
- Premier business **100 % en ligne** : un **guide numérique detailing** (PDF + checklist « nettoyer
  l'intérieur de sa voiture comme un pro »). Zéro stock. Le kit physique (Alibaba) continue à côté.
- Boutique sur une **plateforme gratuite** (0 € par mois, une commission par vente).
  Shopify seulement le jour où on vend l'appli aux autres.
- Clients amenés par des **vidéos gratuites TikTok et Instagram**. Pas de pub payante au début.
- **Version A** : l'appli lit le fichier des ventes de la boutique, plus 30 secondes de saisie par
  jour de Kévin. Pas de branchement direct TikTok/Instagram au début.

## Ce que l'appli affiche

### 1. Le résumé

Choix de la période : **7 jours, 1 mois, 3 mois**.

- **Ventes** (€) : ce que les clients ont payé sur la période.
- **Commandes** : nombre de ventes.
- **Panier moyen** : ventes ÷ commandes. Aucune commande → « — », jamais un 0 € inventé.
- Toujours affiché : « Ventes chargées jusqu'au JJ/MM ».

### 1 bis. Le rythme de la semaine

Un compte-tours montre les vidéos notées sur les 7 derniers jours, par rapport à l'objectif
(objectif par jour × 7, par exemple « 3/7 »). Pas d'objectif réglé (0) : pas de compte-tours.

### 2. Les gains réels

**Gains réels = ventes − commissions et frais de la plateforme**, tels qu'écrits dans le fichier de la boutique.

- Plus tard, on retirera aussi les dépenses de pub, quand il y en aura.
- Toujours écrit sous le chiffre : « avant impôts et cotisations ». L'appli ne fait pas la compta.
- Si le fichier ne donne pas les frais, l'appli l'écrit (« frais non fournis par la boutique »)
  au lieu de deviner.

### 3. Les alertes du jour

Chaque alerte a toujours la même forme, comme dans la vidéo OnzeTable :

- un **titre simple** ;
- **« D'après… »** : les chiffres qui expliquent l'alerte ;
- un **bouton d'action** court ;
- deux boutons pour la ranger : **« Fait »** ou **« Plus tard »**.

**Alerte A : « Tu n'as pas publié aujourd'hui »**
- Se déclenche quand aucune vidéo n'est notée aujourd'hui alors que l'objectif de rythme le demande
  (rythme choisi au démarrage, par exemple 1 vidéo par jour).
- D'après : « Ton dernier post date de N jours. Ton objectif : 1 par jour. »
- Bouton : « J'ai publié » (ouvre la saisie rapide).

**Alerte B : « Cette vidéo a ramené des ventes » ou « Cette vidéo a fait des vues mais 0 vente »**
- Compte les ventes dans les **48 h** qui suivent chaque vidéo notée.
- D'après : « X vues, N ventes dans les 48 h suivantes. »
- Toujours écrit : « Correspondance par dates, pas une preuve. »
- Ne conclut qu'une fois les 48 h passées **et** les ventes chargées sur toute cette période.
  Sinon : « Trop tôt pour conclure ».
- Deux vidéos à moins de 48 h d'écart : l'appli le signale et ne donne pas les ventes à l'une plutôt
  qu'à l'autre (pas de double compte).
- Bouton : « Voir la vidéo » (ouvre le lien noté).

**Alerte C : « Ajoute ton fichier de ventes »**
- Se déclenche quand les ventes chargées ont plus de 2 jours.
- D'après : « Dernières ventes chargées le JJ/MM. Les chiffres s'arrêtent là. »
- Bouton : « Ajouter le fichier ».

### 4. La saisie de 30 secondes

- **« J'ai publié »** : date (aujourd'hui par défaut), TikTok ou Instagram, lien de la vidéo
  (facultatif), vues (facultatif, modifiable plus tard).
- **Au démarrage, une seule fois** : l'objectif de rythme (par exemple 1 vidéo par jour).
- **« Ajouter le fichier de ventes »** : choisir le fichier exporté depuis la boutique. Les ventes
  déjà connues sont ignorées, donc recharger le même fichier ne crée pas de doublon.

### 5. Le mode exemple

Avant la première vraie vente, l'appli peut afficher des données d'exemple pour voir à quoi elle
ressemble. Un bandeau **« DONNÉES D'EXEMPLE »** reste affiché en permanence, et elles disparaissent
dès le premier vrai fichier. Les chiffres de la vidéo OnzeTable ne servent jamais d'objectifs.

## Ce qu'on laisse de côté pour l'instant, et pourquoi

- **Montants « Sur la table »** : pas assez de ventes pour estimer sans inventer. Ils viendront avec de vrais chiffres.
- **Paniers abandonnés** : seulement si la plateforme choisie les fournit.
- **Alertes de pub** (créative usée, pixel muet) : pas de pub au début.
- **Branchement direct TikTok / Instagram** : il faut des comptes pro et une validation longue. Plus tard, un par un.
- **Analyse automatique des hooks et des vidéos** : annoncée dans la vidéo, jamais montrée. Peut-être plus tard.
- **Comptes pour d'autres vendeurs, abonnement, vente de l'appli** : version 2 ou après, si l'appli fait ses preuves.

## Le look

Choix de Kévin (5 octobre) : **« Compteur »**, le tableau de bord d'une voiture. Compte-tours pour
le rythme de vidéos, compteur kilométrique pour les ventes, voyants pour les alertes (orange à
traiter, vert bonne nouvelle, bleu pour info). Sur ordinateur : le compteur à gauche, les voyants à droite.

## Comment c'est construit

Choix de Kévin (5 octobre) : **sur le Mac surtout, et aussi sur le téléphone**.

- Une **page web** avec une adresse. Elle s'ouvre sur le **Mac (appareil principal)** et sur le PC,
  et elle **s'installe sur l'écran d'accueil du téléphone** comme une appli.
- **Les mêmes données partout** : elles sont gardées dans une petite base en ligne, donc ce qui est
  noté sur le téléphone apparaît sur le Mac, et inversement.
- **Connexion avec ton compte, toi seul.** Rien n'est public. Ce compte prépare aussi le jour où
  d'autres vendeurs auront le leur (version 2).
- Répartition naturelle : le fichier de ventes s'ajoute surtout depuis le Mac (c'est là qu'on
  télécharge l'export de la boutique) ; « J'ai publié » se note en 10 secondes sur le téléphone,
  juste après la vidéo.
- L'appli ne garde **pas les noms ni les e-mails des clients**, seulement : date, montant, frais,
  produit, numéro de commande.
- Un bouton « Sauvegarder » produit un fichier de sauvegarde, au cas où.
- Hébergement et base en ligne sur des **offres gratuites**. **Coût visé : 0 €.** Les conditions
  des offres gratuites sont vérifiées avant toute inscription ; aucun paiement sans l'accord de Kévin.
- Le code est découpé en petits morceaux indépendants : lecture du fichier de la boutique,
  calculs, alertes, écrans. Changer de plateforme de boutique ne touchera que la lecture du fichier.

## Erreurs et cas particuliers

- Fichier illisible ou venant d'une autre plateforme : message clair, rien n'est modifié.
- Remboursements présents dans le fichier : retirés des ventes et affichés à part.
- Aucune donnée sur une période : « pas encore de données », jamais un chiffre inventé.
- Pas d'internet : message « Pas de connexion, réessaie », rien n'est perdu de ce qui est déjà enregistré.
- Toutes les dates sont en heure de Paris.

## Comment on vérifie que ça marche

- Les calculs sont testés automatiquement sur un petit fichier d'exemple dont on connaît les bons
  résultats calculés à la main : ventes, panier moyen, gains, fenêtre de 48 h, vidéos qui se
  chevauchent, même fichier rechargé sans doublon.
- Kévin teste sur le Mac et le téléphone : charger un fichier sur le Mac, noter une vidéo sur le
  téléphone, vérifier qu'elle apparaît sur le Mac, lire les alertes.
- Après la première vraie vente, on vérifie à la main que les chiffres de l'appli sont ceux de la plateforme.

## Ce qui reste à décider avant de construire

1. ~~La plateforme gratuite de la boutique~~ → **Stripe Managed Payments**, choisie par Kévin le 5 octobre.
   Il avait d'abord choisi Lemon Squeezy ; à l'inscription, Lemon Squeezy (qui appartient à Stripe) l'a orienté
   vers Stripe Managed Payments. Frais : frais Stripe (environ 1,5 % + 0,25 € pour une carte européenne)
   + 3,5 %. TVA et factures gérées par Stripe (« merchant of record »), frais visibles vente par vente.
   Frais à revérifier avant l'ouverture. Lemon Squeezy reste lisible par l'appli (pour d'autres vendeurs).
2. À côté de l'appli : écrire le guide detailing et ouvrir la boutique.

## Prochaine étape

Kévin relit cette spec, puis on écrit le plan de construction, étape par étape.

## Paroles de Kévin (5 octobre)

> elle va servir à moi principalement et si on arrive à des résultats très concrets, euh, on la vendra à d'autres vendeurs.

> Oui, la boutique du kit Detain, mais euh, les vendeurs sont longs à répondre sur Alibaba, tout ça, donc euh, je me posais une question si on pouvait pas faire vraiment juste du en ligne, en ligne, sans vente de choses physiques, plus du de la vente en ligne pour avoir un, un premier business au début.

> On aurait bien aimé avoir une solution gratuite, hein, totalement gratuite, parce que Shopify, il faut payer un abonnement. Si tu me dis que je peux relier mon truc à Shopify, ça peut être pas mal.

> je pence tiktok inst

> oui la version A, vas-y

> Sur téléphone, ouais, comme sur PC. Hein. Genre mon Mac surtout, principalement.
