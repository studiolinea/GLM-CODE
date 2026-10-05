import { ajouterJours, dateParis } from '../temps';
import type { Vente } from '../ventes/modele';

export type Periode = '7j' | '1m' | '3m';

export const PERIODES: Record<Periode, { jours: number; libelle: string }> = {
  '7j': { jours: 7, libelle: '7 jours' },
  '1m': { jours: 30, libelle: '1 mois' },
  '3m': { jours: 90, libelle: '3 mois' },
};

/** Première et dernière date (incluses) d'une période qui se termine aujourd'hui. */
export function bornesPeriode(periode: Periode, aujourdhui: string): { debut: string; fin: string } {
  return { debut: ajouterJours(aujourdhui, -(PERIODES[periode].jours - 1)), fin: aujourdhui };
}

export interface Resume {
  periode: Periode;
  debut: string;
  fin: string;
  /** Total des ventes non remboursées. */
  ventesCentimes: number;
  commandes: number;
  /** null quand il n'y a aucune commande : on n'affiche pas 0 €. */
  panierMoyenCentimes: number | null;
  remboursementsCentimes: number;
  nbRemboursements: number;
  /** Frais connus des ventes non remboursées. */
  fraisCentimes: number;
  /** Ventes non remboursées dont le fichier ne donne pas les frais. */
  ventesSansFrais: number;
  /** Ventes − frais. null si des frais manquent : on ne devine pas. */
  gainsCentimes: number | null;
  /** TVA retenue par la boutique sur les ventes non remboursées ; null si aucune vente n'en donne. */
  tvaCentimes: number | null;
}

export function calculerResume(ventes: Vente[], periode: Periode, maintenant: Date): Resume {
  const { debut, fin } = bornesPeriode(periode, dateParis(maintenant));
  const dansPeriode = ventes.filter((v) => {
    const date = dateParis(new Date(v.instant));
    return date >= debut && date <= fin;
  });

  const gardees = dansPeriode.filter((v) => !v.rembourse);
  const remboursees = dansPeriode.filter((v) => v.rembourse);

  const ventesCentimes = somme(gardees.map((v) => v.montantCentimes));
  const commandes = gardees.length;
  const fraisCentimes = somme(gardees.map((v) => v.fraisCentimes ?? 0));
  const ventesSansFrais = gardees.filter((v) => v.fraisCentimes === null).length;
  const avecTva = gardees.filter((v) => v.tvaCentimes !== undefined);

  return {
    periode,
    debut,
    fin,
    ventesCentimes,
    commandes,
    panierMoyenCentimes: commandes > 0 ? Math.round(ventesCentimes / commandes) : null,
    remboursementsCentimes: somme(remboursees.map((v) => v.montantCentimes)),
    nbRemboursements: remboursees.length,
    fraisCentimes,
    ventesSansFrais,
    gainsCentimes: ventesSansFrais > 0 ? null : ventesCentimes - fraisCentimes,
    tvaCentimes: avecTva.length > 0 ? somme(avecTva.map((v) => v.tvaCentimes ?? 0)) : null,
  };
}

function somme(valeurs: number[]): number {
  return valeurs.reduce((total, v) => total + v, 0);
}
