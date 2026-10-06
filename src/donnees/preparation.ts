import type { Donnees, EtatAlerte } from '../modele';

export const ETAPES_PREPARATION = ['boutique', 'paiement', 'publications', 'rythme'] as const;
export type EtapePreparation = typeof ETAPES_PREPARATION[number];
export const idPreparation = (etape: EtapePreparation) => `preparation:${etape}`;
export function preparationFaite(etats: Record<string, EtatAlerte>, etape: EtapePreparation): boolean {
  return etats[idPreparation(etape)]?.statut === 'fait';
}
/** Réutilise la sauvegarde et la synchronisation des états du business courant. */
export function changerPreparation(donnees: Donnees, etape: EtapePreparation, fait: boolean, jour: string): Donnees {
  const etatsAlertes = { ...donnees.etatsAlertes };
  if (fait) etatsAlertes[idPreparation(etape)] = { statut: 'fait', le: jour };
  else delete etatsAlertes[idPreparation(etape)];
  return { ...donnees, etatsAlertes };
}
