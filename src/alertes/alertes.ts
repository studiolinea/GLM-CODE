import { FENETRE_VIDEO_MS, ventesEntre } from '../calculs/fenetres';
import { NOMS_RESEAUX, type EtatAlerte, type Reglages, type Video } from '../modele';
import { ajouterJours, dateParis, jourMois, joursEntre, quandParis } from '../temps';
import type { Vente } from '../ventes/modele';

export type Ton = 'attention' | 'bonne-nouvelle' | 'info';

export type Action =
  | { libelle: string; cible: 'saisie-video' }
  | { libelle: string; cible: 'import' }
  | { libelle: string; cible: 'lien'; url: string }
  | { libelle: string; cible: 'modifier-video'; videoId: string };

export interface Alerte {
  /** Identifiant stable : sert à retenir « Fait » et « Plus tard ». */
  id: string;
  type: 'publication' | 'video' | 'fichier';
  ton: Ton;
  titre: string;
  /** Les chiffres qui expliquent l'alerte (« D'après… »). */
  dapres: string;
  /** Précaution affichée sous l'alerte. */
  note?: string;
  action: Action;
}

export interface ContexteAlertes {
  ventes: Vente[];
  videos: Video[];
  reglages: Reglages;
  /** Jusqu'à quand les ventes sont chargées, ISO UTC ; null si aucun fichier. */
  couverture: string | null;
  exemple: boolean;
  maintenant: Date;
}

export const NOTE_DATES = 'Correspondance par dates, pas une preuve.';

/** Toutes les alertes du moment, dans l'ordre d'affichage. */
export function calculerAlertes(ctx: ContexteAlertes): Alerte[] {
  const alertes: Alerte[] = [];
  const fichier = alerteFichier(ctx);
  if (fichier) alertes.push(fichier);
  const publication = alertePublication(ctx);
  if (publication) alertes.push(publication);
  alertes.push(...alertesVideos(ctx));
  return alertes;
}

/** Retire les alertes rangées avec « Fait », et celles mises à « Plus tard » aujourd'hui. */
export function alertesVisibles(alertes: Alerte[], etats: Record<string, EtatAlerte>, aujourdhui: string): Alerte[] {
  return alertes.filter((a) => {
    const etat = etats[a.id];
    if (!etat) return true;
    if (etat.statut === 'fait') return false;
    return etat.le < aujourdhui;
  });
}

// Alerte C : les ventes chargées sont trop anciennes, ou absentes.
function alerteFichier(ctx: ContexteAlertes): Alerte | null {
  if (ctx.exemple) return null;
  const action: Action = { libelle: 'Ajouter le fichier', cible: 'import' };
  if (!ctx.couverture) {
    return {
      id: 'fichier-premier',
      type: 'fichier',
      ton: 'attention',
      titre: 'Ajoute ton premier fichier de ventes',
      dapres: 'D’après : aucune vente chargée pour l’instant, les chiffres restent vides.',
      action,
    };
  }
  const couverture = new Date(ctx.couverture);
  if (ctx.maintenant.getTime() - couverture.getTime() <= FENETRE_VIDEO_MS) return null;
  return {
    id: `fichier-${ctx.couverture}`,
    type: 'fichier',
    ton: 'attention',
    titre: 'Ajoute ton fichier de ventes',
    dapres: `D’après : dernières ventes chargées le ${jourMois(dateParis(couverture))}. Les chiffres s’arrêtent là.`,
    action,
  };
}

// Alerte A : rythme de publication.
function alertePublication(ctx: ContexteAlertes): Alerte | null {
  const objectif = ctx.reglages.objectifParJour;
  if (objectif <= 0) return null;

  const aujourdhui = dateParis(ctx.maintenant);
  const dates = ctx.videos.map((v) => dateParis(new Date(v.instant))).filter((d) => d <= aujourdhui);
  const duJour = dates.filter((d) => d === aujourdhui).length;
  if (duJour >= objectif) return null;

  let constat: string;
  if (duJour > 0) {
    constat = `Tu as publié ${duJour} vidéo${duJour > 1 ? 's' : ''} aujourd’hui.`;
  } else if (dates.length === 0) {
    constat = 'Aucune vidéo notée pour l’instant.';
  } else {
    const derniere = dates.reduce((a, b) => (a > b ? a : b));
    const n = joursEntre(derniere, aujourdhui);
    constat = n === 1 ? 'Ton dernier post date d’hier.' : `Ton dernier post date de ${n} jours.`;
  }

  const manque = objectif - duJour;
  return {
    id: `publication-${aujourdhui}`,
    type: 'publication',
    ton: 'attention',
    titre:
      duJour === 0
        ? 'Tu n’as pas publié aujourd’hui'
        : `Encore ${manque} vidéo${manque > 1 ? 's' : ''} pour ton objectif du jour`,
    dapres: `D’après : ${constat} Ton objectif : ${objectif} par jour.`,
    action: { libelle: 'J’ai publié', cible: 'saisie-video' },
  };
}

// Alerte B : ce qu'a donné chaque vidéo des 7 derniers jours, sur les 48 h qui suivent.
function alertesVideos(ctx: ContexteAlertes): Alerte[] {
  const aujourdhui = dateParis(ctx.maintenant);
  const premierJour = ajouterJours(aujourdhui, -6);
  const recentes = ctx.videos
    .filter((v) => {
      const d = dateParis(new Date(v.instant));
      return d >= premierJour && d <= aujourdhui && Date.parse(v.instant) <= ctx.maintenant.getTime();
    })
    .sort((a, b) => b.instant.localeCompare(a.instant));
  return recentes.map((v) => alerteVideo(v, ctx));
}

function alerteVideo(video: Video, ctx: ContexteAlertes): Alerte {
  const debut = new Date(video.instant);
  const fin = new Date(debut.getTime() + FENETRE_VIDEO_MS);
  const nom = `Ta vidéo ${NOMS_RESEAUX[video.reseau]} du ${jourMois(dateParis(debut))}`;
  const action: Action = video.lien
    ? { libelle: 'Voir la vidéo', cible: 'lien', url: video.lien }
    : { libelle: 'Compléter la vidéo', cible: 'modifier-video', videoId: video.id };
  const base = { type: 'video' as const, action };

  // Pas encore 48 h, ou ventes pas chargées jusqu'au bout : on ne conclut pas.
  if (ctx.maintenant.getTime() < fin.getTime()) {
    return {
      ...base,
      id: `video-${video.id}-tot`,
      ton: 'info',
      titre: `${nom} : trop tôt pour conclure`,
      dapres: `D’après : les 48 h se terminent le ${quandParis(fin)}.`,
    };
  }
  if (!ctx.couverture || Date.parse(ctx.couverture) < fin.getTime()) {
    const charge = ctx.couverture ? `Ventes chargées jusqu’au ${quandParis(new Date(ctx.couverture))}` : 'Aucune vente chargée';
    return {
      ...base,
      id: `video-${video.id}-tot`,
      ton: 'info',
      titre: `${nom} : trop tôt pour conclure`,
      dapres: `D’après : ${charge}, il manque la fin des 48 h (${quandParis(fin)}).`,
    };
  }

  const n = ventesEntre(ctx.ventes, debut, fin).length;
  const ventesTexte = `${n} vente${n > 1 ? 's' : ''} dans les 48 h suivantes`;

  // Une autre vidéo à moins de 48 h : impossible de départager, on ne compte pas deux fois.
  const voisines = ctx.videos.filter(
    (autre) => autre.id !== video.id && Math.abs(Date.parse(autre.instant) - debut.getTime()) < FENETRE_VIDEO_MS,
  );
  if (voisines.length > 0) {
    const autres = voisines.length === 1 ? 'une autre vidéo' : `${voisines.length} autres vidéos`;
    return {
      ...base,
      id: `video-${video.id}-chevauchement`,
      ton: 'info',
      titre: `${nom} : impossible de dire quelle vidéo a fait vendre`,
      dapres: `D’après : ${autres} publiée${voisines.length > 1 ? 's' : ''} à moins de 48 h d’écart, ${ventesTexte} sur cette période.`,
      note: NOTE_DATES,
    };
  }

  const vues = video.vues !== undefined ? `${video.vues.toLocaleString('fr-FR')} vues, ` : '';
  if (n > 0) {
    return {
      ...base,
      id: `video-${video.id}-ventes`,
      ton: 'bonne-nouvelle',
      titre: `${nom} a ramené des ventes`,
      dapres: `D’après : ${vues}${ventesTexte}.`,
      note: NOTE_DATES,
    };
  }
  if (video.vues !== undefined && video.vues > 0) {
    return {
      ...base,
      id: `video-${video.id}-vues-zero`,
      ton: 'attention',
      titre: `${nom} a fait des vues mais 0 vente`,
      dapres: `D’après : ${vues}${ventesTexte}.`,
      note: NOTE_DATES,
    };
  }
  return {
    ...base,
    id: `video-${video.id}-zero`,
    ton: 'info',
    titre: `${nom} : 0 vente dans les 48 h`,
    dapres: vues ? `D’après : ${vues}${ventesTexte}.` : `D’après : ${ventesTexte}. Ajoute les vues pour mieux comparer.`,
    note: NOTE_DATES,
  };
}
