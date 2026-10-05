// Passage entre les lignes de la base (snake_case) et les objets de l'appli.

import type { EtatAlerte, Reseau, Video } from '../modele';
import type { Vente } from '../ventes/modele';
import type { ReglagesCompte } from './depot';

export interface LigneVente {
  user_id: string;
  plateforme: string;
  numero_commande: string;
  instant: string;
  montant_centimes: number;
  frais_centimes: number | null;
  rembourse: boolean;
  produit: string;
}

export interface LigneVideo {
  user_id: string;
  id: string;
  instant: string;
  reseau: Reseau;
  lien: string | null;
  vues: number | null;
}

export interface LigneEtatAlerte {
  user_id: string;
  alerte_id: string;
  statut: EtatAlerte['statut'];
  le: string;
}

export interface LigneReglages {
  user_id: string;
  objectif_par_jour: number;
  couverture: string | null;
  exemple_termine: boolean;
}

/** La base renvoie "2026-10-05T08:15:00+00:00" ; l'appli garde "2026-10-05T08:15:00.000Z". */
const iso = (instant: string) => new Date(instant).toISOString();

export function venteVersLigne(v: Vente, userId: string): LigneVente {
  return {
    user_id: userId,
    plateforme: v.plateforme,
    numero_commande: v.numeroCommande,
    instant: v.instant,
    montant_centimes: v.montantCentimes,
    frais_centimes: v.fraisCentimes,
    rembourse: v.rembourse,
    produit: v.produit,
  };
}

export function ligneVersVente(l: LigneVente): Vente {
  return {
    plateforme: l.plateforme,
    numeroCommande: l.numero_commande,
    instant: iso(l.instant),
    montantCentimes: l.montant_centimes,
    fraisCentimes: l.frais_centimes,
    rembourse: l.rembourse,
    produit: l.produit,
  };
}

export function videoVersLigne(v: Video, userId: string): LigneVideo {
  return { user_id: userId, id: v.id, instant: v.instant, reseau: v.reseau, lien: v.lien ?? null, vues: v.vues ?? null };
}

export function ligneVersVideo(l: LigneVideo): Video {
  return {
    id: l.id,
    instant: iso(l.instant),
    reseau: l.reseau,
    ...(l.lien !== null ? { lien: l.lien } : {}),
    ...(l.vues !== null ? { vues: l.vues } : {}),
  };
}

export function etatVersLigne(id: string, etat: EtatAlerte, userId: string): LigneEtatAlerte {
  return { user_id: userId, alerte_id: id, statut: etat.statut, le: etat.le };
}

export function lignesVersEtats(lignes: LigneEtatAlerte[]): Record<string, EtatAlerte> {
  return Object.fromEntries(lignes.map((l) => [l.alerte_id, { statut: l.statut, le: l.le }]));
}

export function reglagesVersLigne(r: ReglagesCompte, userId: string): LigneReglages {
  return {
    user_id: userId,
    objectif_par_jour: r.objectifParJour,
    couverture: r.couverture,
    exemple_termine: r.exempleTermine,
  };
}

export function ligneVersReglages(l: LigneReglages): ReglagesCompte {
  return {
    objectifParJour: l.objectif_par_jour,
    couverture: l.couverture ? iso(l.couverture) : null,
    exempleTermine: l.exemple_termine,
  };
}
