// Tout ce qui modifie les données passe par ces fonctions. Elles ne touchent ni à l'écran
// ni au stockage : elles prennent des données et en rendent de nouvelles.

import { REGLAGES_PAR_DEFAUT, type Donnees, type Reglages, type Video } from '../modele';
import { fusionnerVentes, type ResultatFusion } from '../ventes/lire';
import type { Vente } from '../ventes/modele';

export function donneesVides(reglages: Reglages = REGLAGES_PAR_DEFAUT): Donnees {
  return { ventes: [], videos: [], reglages, couverture: null, etatsAlertes: {}, exemple: false };
}

/** Retire les données d'exemple (les réglages sont gardés). */
export function quitterExemple(d: Donnees): Donnees {
  return d.exemple ? donneesVides(d.reglages) : d;
}

/**
 * Ajoute une nouvelle vidéo, ou modifie une vidéo existante.
 * Une nouvelle vidéo est une vraie donnée : elle fait disparaître l'exemple.
 */
export function enregistrerVideo(d: Donnees, video: Video): Donnees {
  if (d.videos.some((v) => v.id === video.id)) {
    return { ...d, videos: trierVideos(d.videos.map((v) => (v.id === video.id ? video : v))) };
  }
  const base = quitterExemple(d);
  return { ...base, videos: trierVideos([...base.videos, video]) };
}

export function supprimerVideo(d: Donnees, id: string): Donnees {
  return { ...d, videos: d.videos.filter((v) => v.id !== id) };
}

export interface ResultatImport {
  donnees: Donnees;
  fusion: ResultatFusion;
  exempleRetire: boolean;
}

/**
 * Ajoute les ventes d'un fichier. Le premier vrai fichier fait disparaître l'exemple.
 * `couverture` = moment de l'export du fichier ; on garde le plus récent.
 */
export function importerVentes(d: Donnees, ventes: Vente[], couverture: string): ResultatImport {
  const base = quitterExemple(d);
  const fusion = fusionnerVentes(base.ventes, ventes);
  const plusRecente = base.couverture && base.couverture > couverture ? base.couverture : couverture;
  return {
    donnees: { ...base, ventes: fusion.ventes, couverture: plusRecente },
    fusion,
    exempleRetire: d.exemple,
  };
}

export function rangerAlerte(d: Donnees, id: string, statut: 'fait' | 'plus-tard', aujourdhui: string): Donnees {
  return { ...d, etatsAlertes: { ...d.etatsAlertes, [id]: { statut, le: aujourdhui } } };
}

export function changerReglages(d: Donnees, reglages: Reglages): Donnees {
  return { ...d, reglages };
}

function trierVideos(videos: Video[]): Video[] {
  return [...videos].sort((a, b) => a.instant.localeCompare(b.instant));
}

// --- Sauvegarde dans un fichier ---

const FORMAT_SAUVEGARDE = 'pilotage-sauvegarde';

export function versSauvegarde(d: Donnees): string {
  return JSON.stringify({ format: FORMAT_SAUVEGARDE, version: 1, donnees: d }, null, 2);
}

/** Relit un fichier de sauvegarde. Renvoie les données, ou un message d'erreur. */
export function lireSauvegarde(texte: string): Donnees | string {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return 'Ce fichier n’est pas une sauvegarde de Pilotage.';
  }
  const enveloppe = brut as { format?: unknown; donnees?: unknown };
  if (enveloppe?.format !== FORMAT_SAUVEGARDE) return 'Ce fichier n’est pas une sauvegarde de Pilotage.';
  return donneesValides(enveloppe.donnees) ?? 'Cette sauvegarde est abîmée : rien n’a été modifié.';
}

/** Vérifie la forme des données (sauvegarde ou stockage). Renvoie null si elles sont abîmées. */
export function donneesValides(brut: unknown): Donnees | null {
  const d = brut as Partial<Donnees> | null;
  if (!d || typeof d !== 'object') return null;
  if (!Array.isArray(d.ventes) || !Array.isArray(d.videos)) return null;
  if (!d.reglages || typeof d.reglages.objectifParJour !== 'number') return null;
  if (d.couverture !== null && typeof d.couverture !== 'string') return null;
  if (!d.etatsAlertes || typeof d.etatsAlertes !== 'object') return null;
  if (typeof d.exemple !== 'boolean') return null;
  const ventesOk = d.ventes.every(
    (v) =>
      typeof v?.numeroCommande === 'string' &&
      typeof v.instant === 'string' &&
      typeof v.montantCentimes === 'number' &&
      typeof v.rembourse === 'boolean',
  );
  const videosOk = d.videos.every((v) => typeof v?.id === 'string' && typeof v.instant === 'string');
  return ventesOk && videosOk ? (d as Donnees) : null;
}
