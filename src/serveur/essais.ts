import { calculerResume, type Periode } from '../calculs/resume';
import { ajouterJours, dateParis } from '../temps';
import type { Vente } from '../ventes/modele';

/** Trois cas fixes en mémoire. Aucune lecture ou écriture de vente réelle. */
export function contexteEssaisSynthetiques(periode: Periode, maintenant: Date) {
  const vente: Vente = { plateforme: 'stripe', numeroCommande: '', produit: '', instant: maintenant.toISOString(), montantCentimes: 2000, fraisCentimes: null, rembourse: false };
  const essaisSynthetiques = [
    { etiquette: 'SYNTHÉTIQUE — avant lancement, aucune vente', resume: calculerResume([], periode, maintenant), couvertureVentes: null },
    { etiquette: 'SYNTHÉTIQUE — vente de 20 € avec frais inconnus', resume: calculerResume([vente], periode, maintenant), couvertureVentes: maintenant.toISOString() },
    { etiquette: 'SYNTHÉTIQUE — remboursement Stripe de 20 €, frais origine 3 €', resume: calculerResume([{ ...vente, rembourse: true, fraisCentimes: 300 }], periode, maintenant), couvertureVentes: maintenant.toISOString() },
  ];
  return {
    resume: calculerResume([], periode, maintenant), jourParis: dateParis(maintenant),
    resumeJour: { ...calculerResume([], '7j', maintenant), periode: 'jour', debut: dateParis(maintenant), fin: dateParis(maintenant) },
    rythme: { publiees: 0, objectif: null },
    videos: { debut: ajouterJours(dateParis(maintenant), -6), fin: dateParis(maintenant), parReseau: [], precision: 'Aucune vidéo synthétique.' },
    couvertureVentes: null,
    sources: null as null | { source: unknown; derniereSynchro: string | null; enErreur: boolean }[],
    coutsPublicitairesEtAutresDepenses: null, uniteMontants: 'centimes d’euros', fuseau: 'Europe/Paris',
    etiquette: 'ESSAI SYNTHÉTIQUE — aucun chiffre de l’activité réelle', essaisSynthetiques,
  };
}
