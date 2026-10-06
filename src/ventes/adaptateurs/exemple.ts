import { lireMontant } from '../../argent';
import { lireDateHeure } from '../../temps';
import type { Adaptateur, Vente } from '../modele';

// Le format d'exemple de l'appli, en attendant de choisir la plateforme de la boutique.
// Colonnes : numero_commande, date, montant, frais, rembourse, produit.

const OUI = new Set(['oui', 'o', 'yes', 'y', 'true', 'vrai', '1']);
const NON = new Set(['non', 'n', 'no', 'false', 'faux', '0', '']);

export const adaptateurExemple: Adaptateur = {
  plateforme: 'exemple',
  nom: 'Format d’exemple',

  reconnait(entetes) {
    const colonnes = new Set(entetes.map((e) => e.toLowerCase()));
    return ['numero_commande', 'date', 'montant'].every((c) => colonnes.has(c));
  },

  lireLigne(ligne): Vente | string {
    const champ = (nom: string) => (ligne[nom] ?? '').trim();

    const numeroCommande = champ('numero_commande');
    if (!numeroCommande) return 'numéro de commande manquant';

    const instant = lireDateHeure(champ('date'));
    if (!instant) return `date illisible (« ${champ('date')} »)`;

    const montantCentimes = lireMontant(champ('montant'));
    if (montantCentimes === null || montantCentimes < 0) return `montant illisible (« ${champ('montant')} »)`;

    let fraisCentimes: number | null = null;
    if (champ('frais') !== '') {
      const frais = lireMontant(champ('frais'));
      if (frais === null) return `frais illisibles (« ${champ('frais')} »)`;
      fraisCentimes = Math.abs(frais);
    }

    const rembourseTexte = champ('rembourse').toLowerCase();
    if (!OUI.has(rembourseTexte) && !NON.has(rembourseTexte)) {
      return `colonne « rembourse » illisible (« ${champ('rembourse')} »)`;
    }

    return {
      plateforme: 'exemple',
      numeroCommande,
      instant: instant.toISOString(),
      montantCentimes,
      fraisCentimes,
      rembourse: OUI.has(rembourseTexte),
      produit: champ('produit'),
    };
  },
};
