// La vue d'ensemble : les chiffres de chaque business, puis leur total.
// Même règle que partout : un chiffre qu'on ne connaît pas n'est jamais deviné.

import type { Video } from '../modele';
import { dateParis } from '../temps';
import type { Vente } from '../ventes/modele';
import { bornesPeriode, calculerResume, type Periode, type Resume } from './resume';

export interface DonneesBusiness {
  id: string;
  nom: string;
  ventes: Vente[];
  videos: Video[];
}

export interface LigneEnsemble {
  id: string;
  nom: string;
  resume: Resume;
  /** Vidéos publiées sur la période. */
  videos: number;
  /** Vrai s'il n'y a encore ni vente ni vidéo dans ce business. */
  vide: boolean;
}

export interface TotalEnsemble {
  ventesCentimes: number;
  commandes: number;
  fraisCentimes: number;
  /** null si au moins un business a des ventes sans frais connus : on n'additionne pas un chiffre inconnu. */
  gainsCentimes: number | null;
  /** Les business dont les gains sont inconnus. */
  businessSansGains: string[];
  /** TVA retenue par les boutiques ; null si aucun business n'en donne. */
  tvaCentimes: number | null;
  remboursementsCentimes: number;
  videos: number;
}

export interface Ensemble {
  periode: Periode;
  debut: string;
  fin: string;
  lignes: LigneEnsemble[];
  total: TotalEnsemble;
}

export function calculerEnsemble(business: DonneesBusiness[], periode: Periode, maintenant: Date): Ensemble {
  const { debut, fin } = bornesPeriode(periode, dateParis(maintenant));
  const lignes = business.map((b) => {
    const resume = calculerResume(b.ventes, periode, maintenant);
    const videos = b.videos.filter((v) => {
      const date = dateParis(new Date(v.instant));
      return date >= debut && date <= fin;
    }).length;
    return { id: b.id, nom: b.nom, resume, videos, vide: b.ventes.length === 0 && b.videos.length === 0 };
  });

  const somme = (f: (l: LigneEnsemble) => number) => lignes.reduce((t, l) => t + f(l), 0);
  const sansGains = lignes.filter((l) => l.resume.gainsCentimes === null);
  const avecTva = lignes.filter((l) => l.resume.tvaCentimes !== null);
  return {
    periode,
    debut,
    fin,
    lignes,
    total: {
      ventesCentimes: somme((l) => l.resume.ventesCentimes),
      commandes: somme((l) => l.resume.commandes),
      fraisCentimes: somme((l) => l.resume.fraisCentimes),
      gainsCentimes: sansGains.length > 0 ? null : somme((l) => l.resume.gainsCentimes ?? 0),
      businessSansGains: sansGains.map((l) => l.nom),
      tvaCentimes: avecTva.length > 0 ? avecTva.reduce((t, l) => t + (l.resume.tvaCentimes ?? 0), 0) : null,
      remboursementsCentimes: somme((l) => l.resume.remboursementsCentimes),
      videos: somme((l) => l.videos),
    },
  };
}
