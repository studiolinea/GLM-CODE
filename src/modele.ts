import type { Vente } from './ventes/modele';

export type Reseau = 'tiktok' | 'instagram';

export const NOMS_RESEAUX: Record<Reseau, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

/** Une vidéo notée par Kévin avec « J'ai publié ». */
export interface Video {
  id: string;
  /** Moment de publication, ISO UTC. */
  instant: string;
  reseau: Reseau;
  lien?: string;
  vues?: number;
}

export interface Reglages {
  /** Nombre de vidéos visé par jour. 0 = pas de rappel. */
  objectifParJour: number;
}

export const REGLAGES_PAR_DEFAUT: Reglages = { objectifParJour: 1 };

/** Ce que Kévin a fait d'une alerte. */
export interface EtatAlerte {
  statut: 'fait' | 'plus-tard';
  /** Date (Paris) du choix. */
  le: string;
}

/** Tout ce que l'appli enregistre. */
export interface Donnees {
  ventes: Vente[];
  videos: Video[];
  reglages: Reglages;
  /** Jusqu'à quand les ventes sont chargées (moment de l'export du dernier fichier), ISO UTC. */
  couverture: string | null;
  etatsAlertes: Record<string, EtatAlerte>;
  /** Vrai tant que ce sont des données d'exemple. */
  exemple: boolean;
}
