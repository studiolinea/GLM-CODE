---
titre: "E-Commerce — plan 01 : construire l'appli de pilotage, version 1"
projet: E-Commerce
tiroir: plan
date: 2026-10-05
auteur: Claude (session cloud, depuis le téléphone)
statut: validé par Kévin (« Aller go »), en attente du démarrage
spec: [[ECOMMERCE-spec-01-appli-pilotage-v1]]
tags: [business, e-commerce, application, plan]
---

# E-Commerce — plan 01 : construire l'appli de pilotage, version 1

> Plan tiré de la spec [[ECOMMERCE-spec-01-appli-pilotage-v1]], validée par Kévin le 5 octobre.
> 8 étapes. Chacune est petite, se termine par quelque chose qu'on peut voir ou tester, et ne
> commence que quand la précédente est finie.

## Les choix techniques (simples et gratuits)

| Morceau | Choix proposé | Pourquoi |
|---|---|---|
| L'appli | Page web en **TypeScript + React**, préparée avec **Vite** | Très répandu, facile à faire évoluer, s'installe sur le téléphone (« PWA »). |
| Les tests | **Vitest** | Vérifie tous les calculs automatiquement. |
| La base en ligne + la connexion | **Supabase**, offre gratuite (à vérifier à l'étape 5) | Base de données + comptes dans le même service. Déjà cité pour MarginPilot. |
| L'hébergement | **Vercel** ou **Cloudflare Pages**, offre gratuite (à vérifier à l'étape 6) | Met l'appli en ligne à chaque modification, gratuitement. |
| Le code | Un **dépôt GitHub privé** dédié (nom proposé : `ecommerce-pilotage`) | On peut avancer depuis le Mac **ou** depuis le téléphone, comme aujourd'hui. |

Nom de l'appli : à choisir plus tard. En attendant, on l'appelle « Pilotage ».

## Comment le code est rangé

```
src/
  ventes/       lire le fichier de la boutique → liste de ventes propres
    adaptateurs/  un petit lecteur par plateforme (exemple, puis Payhip ou Gumroad…)
  calculs/      résumé, gains, fenêtres de 48 h (aucun écran, que des calculs)
  alertes/      alertes A, B, C : quand elles s'allument et ce qu'elles disent
  donnees/      enregistrer et relire (d'abord sur l'appareil, puis Supabase)
  ecrans/       tableau de bord, « J'ai publié », ajout du fichier, réglages, connexion
tests/          fichiers d'exemple + résultats calculés à la main
```

Règle : `calculs/` et `alertes/` ne dépendent de rien d'autre. Ils se testent seuls, sans internet.

## Les règles précises (pour que les tests soient sans ambiguïté)

- **Heure** : tout est calculé en heure de Paris. « Aujourd'hui » = la date à Paris.
- **Périodes** : 7 jours = aujourd'hui + les 6 jours d'avant. 1 mois = 30 jours. 3 mois = 90 jours.
- **Une vente gardée** : date, montant payé, frais de la plateforme (si fournis), remboursée oui/non,
  produit, numéro de commande. **Jamais de nom ni d'e-mail client.**
- **Pas de doublon** : une vente est reconnue par plateforme + numéro de commande.
- **Ventes** = total des ventes non remboursées. **Remboursements** affichés à part.
- **Gains réels** = ventes − frais. Si une vente n'a pas de frais dans le fichier :
  « frais non fournis par la boutique », et on n'invente rien.
- **Panier moyen** = ventes ÷ commandes ; 0 commande → « — ».
- **« Ventes chargées jusqu'au »** = moment de l'export du dernier fichier ajouté.
- **Une vidéo** : date et heure de publication (par défaut : maintenant si c'est aujourd'hui,
  sinon midi, modifiable), TikTok ou Instagram, lien et vues facultatifs.
- **Alerte A** s'allume si le nombre de vidéos notées aujourd'hui est inférieur à l'objectif
  (1 par jour par défaut). Texte : « Ton dernier post date de N jours » / « d'hier » /
  « Aucune vidéo notée pour l'instant ».
- **Alerte B** pour chaque vidéo des 7 derniers jours : ventes entre la publication et
  publication + 48 h.
  - Moins de 48 h écoulées, ou ventes pas chargées jusqu'à la fin des 48 h → « Trop tôt pour conclure ».
  - Une autre vidéo publiée moins de 48 h avant ou après → « 2 vidéos à moins de 48 h d'écart :
    N ventes sur la période, impossible de dire laquelle » (les ventes ne sont pas comptées deux fois).
  - Au moins 1 vente → « Cette vidéo a ramené des ventes ». 0 vente avec des vues notées →
    « Des vues mais 0 vente ». 0 vente sans vues notées → « 0 vente dans les 48 h ».
  - Toujours : « Correspondance par dates, pas une preuve. »
- **Alerte C** s'allume si les ventes chargées ont plus de 48 h, ou si aucun fichier n'a encore été
  ajouté (« Ajoute ton premier fichier de ventes »). Pas en mode exemple.
- **Fait / Plus tard** : « Fait » range l'alerte ; « Plus tard » la cache jusqu'au lendemain.

## Les étapes

### Étape 0 — Préparer le terrain
- Créer le dépôt GitHub privé (avec l'accord de Kévin).
- Squelette de l'appli (Vite + React + TypeScript) et des tests (Vitest), page « Bonjour ».
- **Fini quand :** les tests se lancent, et la page s'ouvre sur l'ordinateur.

### Étape 1 — Le cœur : lire les ventes et faire le résumé (sans écran)
- `ventes/` : la forme d'une vente, et un lecteur du **format d'exemple** (un CSV simple qu'on définit).
- `calculs/` : résumé sur 7 jours / 1 mois / 3 mois, gains, remboursements, panier moyen.
- Fichier de test écrit à la main avec ses bons résultats calculés au crayon : ventes normales,
  une remboursée, une sans frais, une à 23 h 30 (cas du fuseau horaire), même fichier chargé deux fois.
- **Fini quand :** tous ces tests passent.

### Étape 2 — Les alertes A, B, C (sans écran)
- `alertes/` : les trois alertes, avec exactement les règles ci-dessus.
- Tests : pas de vidéo aujourd'hui, objectif atteint, vidéo à 47 h et à 49 h, ventes pas encore
  chargées, deux vidéos qui se chevauchent, fichier vieux de 3 jours, aucun fichier.
- **Fini quand :** tous ces tests passent.

### Étape 3 — Les écrans, avec les données d'exemple
- Tableau de bord : résumé + gains + alertes, style inspiré d'OnzeTable (fond sombre, cartes,
  vert pour les gains, rouge pour ce qui cloche).
- Bandeau permanent « DONNÉES D'EXEMPLE ». Données gardées sur l'appareil pour l'instant.
- Lisible sur l'écran du Mac **et** sur un écran de téléphone.
- **Fini quand :** Kévin regarde l'appli sur son Mac et son téléphone et dit si le look lui va.

### Étape 4 — Ce que Kévin peut faire dans l'appli
- « J'ai publié » (saisie en 10 secondes), réglage de l'objectif de rythme, « Ajouter le fichier
  de ventes », boutons « Fait » et « Plus tard », bouton « Sauvegarder ».
- Le premier vrai fichier fait disparaître les données d'exemple.
- **Fini quand :** Kévin peut noter une vidéo, charger le fichier d'exemple et voir les alertes changer.

### Étape 5 — Les mêmes données sur le Mac et le téléphone
- Vérifier les conditions de l'offre gratuite Supabase **avant** l'inscription, et les montrer à Kévin.
  Kévin crée le compte lui-même (c'est son adresse e-mail) ; aucun paiement.
- Tables : ventes, vidéos, réglages, état des alertes. Chaque ligne appartient au compte de Kévin,
  et la base refuse toute lecture par quelqu'un d'autre (règles d'accès testées).
- Connexion par e-mail. Remplacer l'enregistrement sur l'appareil par la base en ligne.
- Pas d'internet → « Pas de connexion, réessaie ».
- **Fini quand :** une vidéo notée sur un appareil apparaît sur l'autre, et un autre compte ne voit rien.

### Étape 6 — Mettre l'appli en ligne et l'installer sur le téléphone
- Vérifier l'offre gratuite de l'hébergeur, puis brancher le dépôt GitHub dessus.
- Icône et réglages pour « Ajouter à l'écran d'accueil » sur le téléphone.
- **Fini quand :** Kévin ouvre l'adresse sur son Mac, installe l'appli sur son téléphone et se connecte des deux côtés.

### Étape 7 — Lire le vrai fichier de la boutique
- **Choix du 5 octobre : Stripe Managed Payments.** Kévin avait choisi Lemon Squeezy (comparée à Payhip et
  Gumroad) ; à l'inscription, Lemon Squeezy l'a orienté vers Stripe Managed Payments, l'offre « merchant of
  record » de Stripe : un peu moins cher pour les cartes européennes, frais donnés vente par vente (gains
  réels exacts), TVA et factures gérées par Stripe. Le mode test de Stripe permet de tout essayer avant
  l'ouverture. Le branchement Lemon Squeezy, déjà fait, reste disponible pour d'autres vendeurs.
- **À vérifier avec un paiement test :** comment Stripe présente la TVA et ses frais dans le détail d'une vente.
- Écrire le lecteur de cette plateforme dans `ventes/adaptateurs/`, à partir d'un vrai export (même vide)
  ou de l'exemple officiel de la plateforme. Les noms et e-mails clients sont ignorés à la lecture.
- **Fini quand :** un export réel se charge sans erreur, et un fichier d'une autre plateforme est refusé proprement.
- **Où on en est (6 octobre) :** plutôt qu'un fichier, l'appli lit directement les ventes Stripe (étape 9, voir
  plus bas). La boutique Stripe de Kévin est reliée en mode test, et les ventes arrivent toutes seules.
- **Reste avant la première vraie vente :** un paiement test (argent fictif), puis « Vérifier les frais et la TVA »
  dans les réglages. Ce bouton montre ce que Stripe a enregistré, mouvement par mouvement. Selon Stripe, Managed
  Payments ajoute 3,5 % du total (TVA comprise) aux frais habituels, et ces frais semblent comptés à part.
  Aujourd'hui l'appli ne compte que les frais attachés au paiement, et le montant inclut peut-être la TVA.
  À corriger d'après le paiement test, pour que les gains réels soient exacts.
- **Paiement test du 6 octobre (Managed Payments, livre électronique, 19,90 € HT) :** le client paie 20,99 €,
  dont 1,09 € de TVA (5,5 %). Dans le paiement, Stripe enregistre des frais de 1,65 € : 1,09 € de TVA retenue
  (« withheld_tax ») et 0,56 € de frais de paiement. Le net est de 19,34 €. Les 3,5 % de Managed Payments
  (environ 0,73 €) n'apparaissent pas dans ce paiement.
  - Corrigé : le montant d'une vente est maintenant la part de Kévin, sans la TVA retenue (19,90 €).
  - En attendant de savoir comment Stripe compte les 3,5 %, les frais de ces ventes restent « inconnus »
    plutôt que faux. À revoir quand une ligne « frais Stripe » séparée apparaît dans « Vérifier les frais et la TVA ».

### Étape 8 — La vérification avec de vraies ventes
- Après les premières vraies ventes, comparer à la main les chiffres de l'appli et ceux de la plateforme.
- Noter dans le cerveau ce qui marche et ce qui manque → préparer la version 2.
- **Fini quand :** les chiffres sont identiques, ou chaque écart est expliqué et corrigé.

## Ce que Kévin aura à faire

| Moment | Action de Kévin |
|---|---|
| Étape 0 | Dire oui à la création du dépôt GitHub privé. |
| Étape 3 | Regarder l'appli et dire si le look lui va. |
| Étape 5 | Créer le compte Supabase gratuit (guidé pas à pas). |
| Étape 6 | Installer l'appli sur son téléphone (guidé). |
| Étape 7 | Choisir la plateforme de la boutique et y télécharger un export. |
| Étape 8 | Comparer les chiffres avec ceux de la boutique. |

À côté de l'appli (pas dans ce plan) : écrire le guide detailing, ouvrir la boutique, publier les vidéos.

## Étape 9 (demandée par Kévin le 5 octobre) — Tout automatique

Kévin veut que l'appli récupère les données toute seule, sans saisie ni fichier.
**Possible, mais seulement une fois les comptes du business créés** (boutique, TikTok, Instagram).

| Source | Comment | Ce qu'il faut |
|---|---|---|
| Ventes | API de la plateforme : Gumroad se lit avec une clé d'accès ; Payhip prévient l'appli à chaque vente (webhooks) | La boutique ouverte (étape 7) |
| TikTok | API « Display » de TikTok : liste des vidéos et leurs vues, pour le compte connecté (mode « sandbox », sans validation, jusqu'à 10 comptes) | Un compte TikTok du business + une appli développeur TikTok |
| Instagram | API Instagram (connexion Instagram) : publications et vues du compte connecté | Un compte Instagram **professionnel** (Créateur ou Entreprise) + une appli développeur Meta |

- Une petite partie « serveur » dans le Worker Cloudflare déjà en ligne : connexion aux comptes, et relevé
  automatique chaque jour. Les clés secrètes restent dans les réglages Cloudflare, jamais dans le code.
- « J'ai publié » et l'ajout de fichier restent disponibles en secours.
- Coût visé : 0 € (API gratuites, offres gratuites de Cloudflare et Supabase). À revérifier au moment de le faire.

Ordre : choisir la boutique en tenant compte de ce branchement (étape 7) → créer les comptes TikTok et
Instagram du business → brancher les trois sources.

**Où on en est (6 octobre) :**
- Boutique : Stripe reliée en mode test, ventes automatiques (voir étape 7).
- TikTok : compte développeur de Kévin créé, appli « Pilotage » en mode test (« Sandbox ») avec Login Kit et les
  autorisations `user.info.basic` + `video.list`. Dans Pilotage, la carte TikTok des réglages relie le compte (accord
  donné sur TikTok, jetons chiffrés côté serveur, renouvelés tout seuls) et les vidéos arrivent avec leurs vues.
  Reste : créer le compte TikTok du business (son nom n'est pas encore choisi), l'ajouter dans « Target Users »
  chez TikTok, puis appuyer sur « Relier mon compte TikTok ». Les vidéos notées à la main avec « J'ai publié »
  restent ; une même vidéo notée à la main et lue sur TikTok compterait deux fois (à régler si ça arrive).
- Instagram : à faire (compte professionnel + appli développeur Meta).

**Prêt pour le grand public (demande de Kévin) :** les branchements se font **compte par compte**, dans les
réglages. Section « Mes comptes reliés » : pour chaque source (boutique, TikTok, Instagram, puis Shopify plus
tard), l'état (relié ou non), un bouton « Relier » et un bouton « Déconnecter ». Chaque personne ne relie que
ses propres comptes et ne voit que ses propres données (déjà garanti par les règles de la base).
À prévoir le jour de l'ouverture au public : rouvrir les inscriptions, « mot de passe oublié », validation
des applis développeur par TikTok et Meta (obligatoire pour d'autres comptes que le sien), page de
confidentialité.

## Étape 10 (demandée par Kévin le 6 octobre) — Plusieurs business

Kévin veut lancer beaucoup de business (15, 20…) sous sa maison mère **Studiolinea**, chacun avec ses propres
comptes TikTok, Instagram et sa boutique. Pilotage devient donc multi-business, avant les premières vraies données.

- En haut de l'écran, le nom du business ouvert : un appui ouvre « Mes business » (changer, renommer, créer).
- Chaque business a ses ventes, ses vidéos, ses voyants, son objectif de vidéos et ses comptes reliés.
- Un business peut relier plusieurs comptes TikTok : leurs vidéos s'additionnent.
- Le premier business montre les données d'exemple ; les suivants commencent vides.
- Base : table `business`, et `business_id` sur toutes les tables (supabase/05-plusieurs-business.sql). Une clé
  étrangère (business, propriétaire) empêche d'écrire dans le business de quelqu'un d'autre.
- Reste : une **vue d'ensemble** qui additionne tous les business. En mode test, TikTok accepte 10 comptes au
  maximum : au-delà, il faudra faire valider l'appli TikTok (vidéo de démonstration).

## Idées pour plus tard (hors de ce plan)

- **Reprendre des éléments de l'appli dashboard du projet Inicia** (projet Supabase mis en pause le 5 octobre
  pour libérer une place) : en particulier la **météo interactive en fond**. À analyser avant de décider.

## Paroles de Kévin (5 octobre)

> Aller go

> je souhaiterais que ça se face automatiquement en gros je le relis a c’est app pour qu’il est accept

> je vais vouloir que dans les paramètres, tu laisses l'accessibilité. Genre, si je le mets au grand public, il faut que chaque personne puisse aller dans les paramètres, se connecter à ses propres comptes, comme il veut, se déconnecter.

> Il y a des choses intéressantes dans l'application d'Inicia qu'on pourra analyser plus tard et peut-être implémenter dedans. Parce qu'on avait fait une météo interactive en fond, ça pourrait être sympa.
