import type { Video } from '../modele';
import { ajouterJours, dateParis } from '../temps';

export interface Rythme {
  /** Vidéos notées sur les 7 derniers jours, aujourd'hui compris. */
  publiees: number;
  /** Objectif sur ces 7 jours (objectif par jour × 7). 0 = pas d'objectif. */
  objectif: number;
}

/** Le rythme de publication de la semaine, affiché par le compte-tours. */
export function rythmeSemaine(videos: Video[], objectifParJour: number, maintenant: Date): Rythme {
  const aujourdhui = dateParis(maintenant);
  const premierJour = ajouterJours(aujourdhui, -6);
  const publiees = videos.filter((v) => {
    const date = dateParis(new Date(v.instant));
    return date >= premierJour && date <= aujourdhui;
  }).length;
  return { publiees, objectif: Math.max(0, objectifParJour) * 7 };
}
