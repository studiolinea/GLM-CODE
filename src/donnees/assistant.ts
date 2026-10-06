import type { Periode } from '../calculs/resume';
import { ETAPES_PREPARATION, type EtapePreparation } from './preparation';
import { appelerServeur } from './comptesRelies';

export type QuestionAssistant = 'preparation' | 'priorites' | 'ventes' | 'videos' | 'frais' | 'essai-synthetique';
export interface ReponseAssistant { texte: string; genereLe: string; modele: string; avertissement?: string; actions?: { id: EtapePreparation; raison: string }[] }

/** Aucun chiffre ni texte libre envoyé par le navigateur : le serveur lit les agrégats autorisés. */
export async function analyserAvecIA(business: string, periode: Periode, question: QuestionAssistant): Promise<ReponseAssistant> {
  const resultat = await appelerServeur<ReponseAssistant>('/api/assistant/analyser', { business, periode, question });
  if (typeof resultat.texte !== 'string' || !resultat.texte.trim() || typeof resultat.genereLe !== 'string' || !Number.isFinite(Date.parse(resultat.genereLe)) || typeof resultat.modele !== 'string') {
    throw new Error('L’IA a renvoyé une réponse illisible. La lecture locale reste disponible.');
  }
  if (resultat.actions !== undefined && (!Array.isArray(resultat.actions) || resultat.actions.length > 4 || resultat.actions.some((action) => !action || !ETAPES_PREPARATION.includes(action.id) || typeof action.raison !== 'string' || action.raison.length > 300))) {
    throw new Error('Le plan proposé par l’IA est illisible. La lecture locale reste disponible.');
  }
  return resultat;
}

/** Empreinte des seules données utiles : un réglage de suivi ne relance pas une analyse. */
export function empreinteAnalyse(ventes: readonly import('../ventes/modele').Vente[], videos: readonly import('../modele').Video[], couverture: string | null, objectifParJour: number): string {
  return JSON.stringify({
    couverture,
    objectifParJour,
    ventes: ventes.map((v) => [v.plateforme, v.numeroCommande, v.instant, v.montantCentimes, v.fraisCentimes, v.tvaCentimes ?? null, v.rembourse, v.produit]).sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1]))),
    videos: videos.map((v) => [v.id, v.instant, v.reseau, v.vues ?? null]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
  });
}

/** Un essai ne propose aucune commande susceptible de modifier la préparation réelle. */
export function actionsApplicables(question: QuestionAssistant, reponse: ReponseAssistant): NonNullable<ReponseAssistant['actions']> {
  return question === 'essai-synthetique' ? [] : reponse.actions ?? [];
}
