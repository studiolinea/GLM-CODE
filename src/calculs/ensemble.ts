// La vue d'ensemble : les chiffres de chaque business, puis leur total.
// Même règle que partout : un chiffre qu'on ne connaît pas n'est jamais deviné.

import type { Video } from '../modele';
import { dateParis, quandParis } from '../temps';
import { cleVente, type Vente } from '../ventes/modele';
import { bornesPeriode, calculerResume, type Periode, type Resume } from './resume';

export interface DonneesBusiness {
  id: string;
  nom: string;
  ventes: Vente[];
  videos: Video[];
  /** Jusqu'à quand les ventes sont lues ; null si aucune vente n'a encore été lue (boutique pas reliée). */
  couverture?: string | null;
  /** Ce qui est relié à ce business (absent si on ne le sait pas). */
  relies?: {
    boutique: boolean;
    /** Un réseau (TikTok, Instagram) est relié. */
    reseau: boolean;
    /** La plus récente des actualisations réussies de ses comptes reliés, ISO UTC ; null si aucune. */
    derniereSynchro: string | null;
  };
  /** Faux tant que ce business n'a jamais commencé avec de vraies données : son écran montre alors l'exemple. */
  exempleTermine?: boolean;
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
  /** « à jour le 06/10 à 14h05 » : la dernière actualisation de ses comptes reliés ; null si rien n'est relié. */
  aJour: string | null;
  /** Pour un business vide : ce qu'il en est vraiment (boutique reliée sans vente, rien de relié, exemple). */
  etatVide: string | null;
}

/** Ce qu'on dit d'un business sans aucune vente ni vidéo, selon ce qui y est relié. */
function etatVide(b: DonneesBusiness): string {
  if (b.relies?.boutique) return 'Boutique reliée, aucune vente pour l’instant.';
  if (b.exempleTermine === false && !b.couverture) return 'Données d’exemple seulement.';
  if (!b.relies) return 'Pas encore de données : relie sa boutique et ses comptes.';
  if (b.relies.reseau) return 'Aucune vidéo pour l’instant, et sa boutique n’est pas reliée.';
  return 'Rien de relié pour l’instant : relie sa boutique et ses comptes.';
}

function aJour(b: DonneesBusiness): string | null {
  if (!b.relies || (!b.relies.boutique && !b.relies.reseau)) return null;
  return b.relies.derniereSynchro ? `à jour le ${quandParis(new Date(b.relies.derniereSynchro))}` : 'pas encore actualisé';
}

export interface TotalEnsemble {
  ventesCentimes: number;
  commandes: number;
  fraisCentimes: number;
  /** null si au moins un business a des ventes sans frais connus : on n'additionne pas un chiffre inconnu. */
  gainsCentimes: number | null;
  /** Les business dont les gains sont inconnus. */
  businessSansGains: string[];
  /** Vrai si aucun business n'a de vente lue : ventes, commandes et gains du total sont inconnus (« — »). */
  ventesInconnues: boolean;
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

/** Stripe et Lemon Squeezy : l'identifiant d'un paiement est unique entre tous les comptes. */
const NUMEROS_UNIQUES = /^(stripe|lemonsqueezy)(-test)?$/;

export function calculerEnsemble(business: DonneesBusiness[], periode: Periode, maintenant: Date): Ensemble {
  const { debut, fin } = bornesPeriode(periode, dateParis(maintenant));
  const lignes = business.map((b) => {
    const resume = calculerResume(b.ventes, periode, maintenant);
    const videos = b.videos.filter((v) => {
      const date = dateParis(new Date(v.instant));
      return date >= debut && date <= fin;
    }).length;
    const vide = b.ventes.length === 0 && b.videos.length === 0;
    return {
      id: b.id,
      nom: b.nom,
      resume,
      videos,
      vide,
      ventesInconnues: b.ventes.length === 0 && b.couverture === null,
      aJour: aJour(b),
      etatVide: vide ? etatVide(b) : null,
    };
  });

  // Un même compte (Stripe, TikTok) peut être relié dans deux business : chaque vente et chaque vidéo ne compte qu'une fois.
  // Seulement pour les boutiques dont les numéros sont uniques partout : ceux d'un fichier de ventes repartent de 1 dans
  // chaque business, et deux ventes différentes y portent le même numéro.
  const cle = (b: DonneesBusiness, v: Vente) => (NUMEROS_UNIQUES.test(v.plateforme) ? cleVente(v) : `${b.id}|${cleVente(v)}`);
  const ventesUniques = [...new Map(business.flatMap((b) => b.ventes.map((v) => [cle(b, v), v] as const))).values()];
  const videosUniques = new Set(
    business.flatMap((b) => b.videos).filter((v) => {
      const date = dateParis(new Date(v.instant));
      return date >= debut && date <= fin;
    }).map((v) => v.id),
  );
  const tout = calculerResume(ventesUniques, periode, maintenant);

  const sansGains = lignes.filter((l) => l.resume.gainsCentimes === null);
  // Aucune vente lue nulle part : le total des ventes est inconnu, pas « 0 € ».
  const ventesInconnues = lignes.every((l) => l.ventesInconnues);
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
      ventesInconnues,
      tvaCentimes: tout.tvaCentimes,
      remboursementsCentimes: tout.remboursementsCentimes,
      videos: videosUniques.size,
    },
  };
}
