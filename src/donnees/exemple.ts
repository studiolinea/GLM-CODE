// Données d'exemple, pour voir l'appli avant la première vraie vente.
// Toujours affichées avec le bandeau « DONNÉES D'EXEMPLE ». Les chiffres sont inventés
// exprès et n'ont rien à voir avec la vidéo OnzeTable.

import { FENETRE_VIDEO_MS } from '../calculs/fenetres';
import { REGLAGES_PAR_DEFAUT, type Donnees, type Video } from '../modele';
import { ajouterJours, dateParis, instantParis } from '../temps';
import type { Vente } from '../ventes/modele';

const PRODUITS = [
  { nom: 'Guide detailing', prix: 1990 },
  { nom: 'Guide + checklist', prix: 2990 },
];

/** Générateur pseudo-aléatoire fixe : les mêmes données à chaque fois. */
function hasard(graine: number) {
  let a = graine;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function donneesExemple(maintenant: Date): Donnees {
  const alea = hasard(42);
  const aujourdhui = dateParis(maintenant);
  const ventes: Vente[] = [];
  let numero = 1000;

  const nouvelleVente = (instant: Date, rembourse = false): Vente => {
    const produit = PRODUITS[alea() < 0.75 ? 0 : 1]!;
    return {
      plateforme: 'exemple',
      numeroCommande: String(++numero),
      instant: instant.toISOString(),
      montantCentimes: produit.prix,
      fraisCentimes: Math.round(produit.prix * 0.05) + 25,
      rembourse,
      produit: produit.nom,
    };
  };

  for (let j = 89; j >= 0; j--) {
    const date = ajouterJours(aujourdhui, -j);
    const nombre = alea() < 0.55 ? 0 : alea() < 0.75 ? 1 : 2;
    for (let k = 0; k < nombre; k++) {
      const heure = 8 + Math.floor(alea() * 15);
      const minute = Math.floor(alea() * 60);
      const instant = instantParis(date, `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      if (instant.getTime() < maintenant.getTime()) ventes.push(nouvelleVente(instant));
    }
  }

  // Trois vidéos pour montrer les trois cas : des ventes, des vues sans vente, trop tôt.
  const videos: Video[] = [
    { id: 'exemple-1', reseau: 'instagram', instant: instantParis(ajouterJours(aujourdhui, -5), '12:30').toISOString(), vues: 950 },
    { id: 'exemple-2', reseau: 'tiktok', instant: instantParis(ajouterJours(aujourdhui, -3), '19:00').toISOString(), vues: 1840 },
    { id: 'exemple-3', reseau: 'tiktok', instant: instantParis(ajouterJours(aujourdhui, -1), '20:00').toISOString(), vues: 420 },
  ];

  // Pas de vente dans les 48 h de la première vidéo, au moins une dans celles de la deuxième.
  const debut1 = Date.parse(videos[0]!.instant);
  const sansVente = ventes.filter((v) => {
    const t = Date.parse(v.instant);
    return t < debut1 || t >= debut1 + FENETRE_VIDEO_MS;
  });
  const debut2 = Date.parse(videos[1]!.instant);
  sansVente.push(nouvelleVente(new Date(debut2 + 3 * 3_600_000)));
  sansVente.push(nouvelleVente(new Date(debut2 + 26 * 3_600_000)));

  // Une vente remboursée il y a quelques jours.
  sansVente.push(nouvelleVente(instantParis(ajouterJours(aujourdhui, -4), '10:10'), true));

  sansVente.sort((a, b) => a.instant.localeCompare(b.instant));
  sansVente.forEach((v, i) => (v.numeroCommande = String(1001 + i)));

  return {
    ventes: sansVente,
    videos,
    reglages: REGLAGES_PAR_DEFAUT,
    couverture: maintenant.toISOString(),
    etatsAlertes: {},
    exemple: true,
  };
}

/** Un petit fichier de ventes au format d'exemple, daté d'aujourd'hui, pour essayer l'ajout de fichier. */
export function fichierEssai(maintenant: Date): string {
  const aujourdhui = dateParis(maintenant);
  const lignes = [
    ['E-101', ajouterJours(aujourdhui, -6), '10:15', '19,90', '1,25', 'non', 'Guide detailing'],
    ['E-102', ajouterJours(aujourdhui, -4), '21:40', '29,90', '1,75', 'non', 'Guide + checklist'],
    ['E-103', ajouterJours(aujourdhui, -2), '08:05', '19,90', '1,25', 'oui', 'Guide detailing'],
    ['E-104', ajouterJours(aujourdhui, -1), '18:30', '19,90', '1,25', 'non', 'Guide detailing'],
  ];
  return [
    'numero_commande,date,montant,frais,rembourse,produit',
    ...lignes.map(([n, d, h, m, f, r, p]) => `${n},${d} ${h},"${m}","${f}",${r},${p}`),
  ].join('\n');
}
