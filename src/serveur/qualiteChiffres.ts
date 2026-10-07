import { dateParis } from '../temps';
import type { Vente } from '../ventes/modele';
import type { Resume } from '../calculs/resume';

/** Précisions factuelles : zéro calculé reste distinct des données absentes. */
export function qualifierChiffres(resume: Resume, couverture: string | null, remboursementStripe: boolean) {
  return {
    couvertureVentes: couverture === null ? 'non_connue' : 'fournie',
    frais: resume.ventesSansFrais > 0 ? 'incomplets' : 'connus',
    fraisConnusCentimes: resume.fraisCentimes,
    ventesAuxFraisAbsents: resume.ventesSansFrais,
    gains: resume.gainsCentimes === null ? 'non_calculables' : 'calcules',
    raisonGainsNonCalculables: resume.gainsCentimes !== null ? null
      : resume.ventesSansFrais > 0 && remboursementStripe ? 'frais_absents_et_mouvements_remboursement_stripe_inconnus'
      : resume.ventesSansFrais > 0 ? 'frais_absents'
      : remboursementStripe ? 'mouvements_remboursement_stripe_inconnus' : 'non_connue',
  };
}

/** La marge UTC de lecture ne doit pas modifier la raison d’un gain inconnu. */
export function qualifierChiffresVentes(resume: Resume, couverture: string | null, ventes: readonly Vente[]) {
  const remboursementStripe = ventes.some((vente) => {
    if (!vente.rembourse || !/^stripe(-test)?$/.test(vente.plateforme)) return false;
    const jour = dateParis(new Date(vente.instant));
    return jour >= resume.debut && jour <= resume.fin;
  });
  return qualifierChiffres(resume, couverture, remboursementStripe);
}
