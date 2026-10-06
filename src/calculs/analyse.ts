import type { Action } from '../alertes/alertes';
import { formatEuros } from '../argent';
import { jourMois, quandParis } from '../temps';
import type { Resume } from './resume';
import type { Rythme } from './rythme';

export interface LectureLocale {
  periode: string;
  constats: { titre: string; preuve: string }[];
  prochaine: { texte: string; action?: Action };
}

/** Lecture déterministe des chiffres déjà calculés. Aucun service distant, aucune estimation. */
export function analyserPeriode({ resume, rythme, couverture, automatique, sources }: {
  resume: Resume;
  rythme: Rythme;
  couverture: string | null;
  automatique: boolean;
  /** null : la liste des comptes reliés est encore en cours de lecture. */
  sources: { boutique: boolean; videos: boolean } | null;
}): LectureLocale {
  const constats: LectureLocale['constats'] = [];
  const periode = `Du ${jourMois(resume.debut)} au ${jourMois(resume.fin)} · heure de Paris`;
  if (couverture) {
    constats.push({
      titre: resume.commandes ? `${resume.commandes} commande${resume.commandes > 1 ? 's' : ''} enregistrée${resume.commandes > 1 ? 's' : ''}` : 'Aucune commande enregistrée sur cette période',
      preuve: `${formatEuros(resume.ventesCentimes)} de ventes non remboursées dans les données chargées. Dernière lecture : ${quandParis(new Date(couverture))}.`,
    });
    if (resume.ventesSansFrais > 0) {
      constats.push({ titre: 'Les gains restent incomplets', preuve: `Frais manquants pour ${resume.ventesSansFrais} vente${resume.ventesSansFrais > 1 ? 's' : ''}. Aucun gain estimé en attendant.` });
    } else if (resume.gainsCentimes === null) {
      constats.push({ titre: 'Les gains après remboursement sont inconnus', preuve: 'Un remboursement Stripe est enregistré, mais ses mouvements et frais ne sont pas disponibles. Aucun gain net estimé.' });
    } else if (resume.commandes > 0) {
      constats.push({ titre: `${formatEuros(resume.gainsCentimes)} de gains avant impôts et cotisations`, preuve: `${formatEuros(resume.ventesCentimes)} de ventes − ${formatEuros(resume.fraisCentimes)} de frais fournis par la boutique.` });
    }
  } else {
    constats.push({ titre: 'Les ventes ne sont pas encore disponibles', preuve: 'Aucune date de couverture des ventes : impossible de conclure à zéro vente.' });
  }
  if (rythme.objectif > 0) {
    constats.push({ titre: 'Ton rythme de publication', preuve: `${rythme.publiees} vidéo${rythme.publiees > 1 ? 's' : ''} enregistrée${rythme.publiees > 1 ? 's' : ''} sur les 7 derniers jours, pour un objectif de ${rythme.objectif}. Cette fenêtre reste de 7 jours, quelle que soit la période des ventes.` });
  }
  let prochaine: LectureLocale['prochaine'];
  if (automatique && sources === null) prochaine = { texte: 'Lecture des comptes reliés en cours…' };
  else if (automatique && !sources?.boutique) prochaine = { texte: 'Prépare ta boutique, puis relie-la. Vérifie un paiement test et ses frais avant le lancement ; les ventes test restent séparées des vraies ventes.', action: { libelle: 'Relier ma boutique', cible: 'comptes', compte: 'boutique' } };
  else if (!couverture) prochaine = { texte: automatique ? 'Lance une lecture de la boutique reliée.' : 'Ajoute un fichier pour démarrer avec tes ventes.', action: automatique ? { libelle: 'Actualiser', cible: 'actualiser' } : { libelle: 'Ajouter le fichier', cible: 'import' } };
  else if (automatique && !sources?.videos) prochaine = { texte: 'Relie TikTok pour retrouver tes publications et leurs vues.', action: { libelle: 'Relier TikTok', cible: 'comptes', compte: 'tiktok' } };
  else if (resume.ventesSansFrais > 0) prochaine = { texte: 'Vérifie les frais de la boutique avant de comparer tes gains.', action: { libelle: 'Voir les réglages', cible: 'comptes', compte: 'boutique' } };
  else prochaine = { texte: 'Consulte les voyants pour examiner les 48 h après chaque vidéo. Une correspondance de dates ne prouve pas qu’une vidéo a fait vendre.' };
  return { periode, constats, prochaine };
}
