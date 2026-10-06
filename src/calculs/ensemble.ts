// La vue d'ensemble : les chiffres de chaque business, puis leur total.
// Même règle que partout : un chiffre qu'on ne connaît pas n'est jamais deviné.

import type { Video } from '../modele';
import { dateParis } from '../temps';
import { cleVente, type Vente } from '../ventes/modele';
import { bornesPeriode, calculerResume, type Periode, type Resume } from './resume';

export interface DonneesBusiness {
  id: string;
  nom: string;
  ventes: Vente[];
  videos: Video[];
  /** Jusqu'à quand les ventes sont lues ; null si aucune vente n'a encore été lue (boutique pas reliée). */
  couverture?: string | null;
}

export interface LigneEnsemble {
  id: string;
  nom: string;
  resume: Resume;
  /** Vidéos publiées sur la période. */
  videos: number;
  /** Vrai s'il n'y a encore ni vente ni vidéo dans ce business. */
  vide: boolean;
  /** Vrai si aucune vente n'a encore été lue (boutique pas reliée) : ses ventes sont inconnues, pas « 0 € ». */
  ventesInconnues: boolean;
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
    return {
      id: b.id,
      nom: b.nom,
      resume,
      videos,
      vide: b.ventes.length === 0 && b.videos.length === 0,
      ventesInconnues: b.ventes.length === 0 && b.couverture === null,
    };
  });

  // Un même compte (Stripe, TikTok) peut être relié dans deux business : chaque vente et chaque vidéo ne compte qu'une fois.
  const ventesUniques = [...new Map(business.flatMap((b) => b.ventes).map((v) => [cleVente(v), v])).values()];
  const videosUniques = new Set(
    business.flatMap((b) => b.videos).filter((v) => {
      const date = dateParis(new Date(v.instant));
      return date >= debut && date <= fin;
    }).map((v) => v.id),
  );
  const tout = calculerResume(ventesUniques, periode, maintenant);

  const sansGains = lignes.filter((l) => l.resume.gainsCentimes === null);
  return {
    periode,
    debut,
    fin,
    lignes,
    total: {
      ventesCentimes: tout.ventesCentimes,
      commandes: tout.commandes,
      fraisCentimes: tout.fraisCentimes,
      gainsCentimes: tout.gainsCentimes,
      businessSansGains: sansGains.map((l) => l.nom),
      tvaCentimes: tout.tvaCentimes,
      remboursementsCentimes: tout.remboursementsCentimes,
      videos: videosUniques.size,
    },
  };
}
