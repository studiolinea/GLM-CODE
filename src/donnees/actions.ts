// Tout ce qui modifie les données passe par ces fonctions. Elles ne touchent ni à l'écran
// ni au stockage : elles prennent des données et en rendent de nouvelles.

import { NOMS_RESEAUX, REGLAGES_PAR_DEFAUT, type Donnees, type EtatAlerte, type Reglages, type Video } from '../modele';
import { fusionnerVentes, type ResultatFusion } from '../ventes/lire';
import type { Vente } from '../ventes/modele';
import { memeNom } from '../texte';

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
 * Avec `essai`, les ventes s'ajoutent aux données d'exemple, qui restent marquées comme exemple.
 */
export function importerVentes(
  d: Donnees,
  ventes: Vente[],
  couverture: string,
  options: { essai?: boolean } = {},
): ResultatImport {
  const base = options.essai ? d : quitterExemple(d);
  const fusion = fusionnerVentes(base.ventes, ventes);
  const plusRecente = base.couverture && base.couverture > couverture ? base.couverture : couverture;
  return {
    donnees: { ...base, ventes: fusion.ventes, couverture: plusRecente },
    fusion,
    exempleRetire: d.exemple && !options.essai,
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

/** Le business d'où vient une sauvegarde. Les anciennes sauvegardes (et celles de l'appareil seul) n'en ont pas. */
export interface BusinessSauvegarde {
  id: string | null;
  nom: string;
}

export interface Sauvegarde {
  donnees: Donnees;
  business: BusinessSauvegarde | null;
}

/** Le contenu du fichier de sauvegarde : les données, et le business d'où elles viennent (avec la base en ligne). */
export function versSauvegarde(d: Donnees, business?: { id: string; nom: string }): string {
  const origine = business ? { business: { id: business.id, nom: business.nom } } : {};
  return JSON.stringify({ format: FORMAT_SAUVEGARDE, version: 1, ...origine, donnees: d }, null, 2);
}

/** Relit un fichier de sauvegarde. Renvoie les données et leur business, ou un message d'erreur. */
export function ouvrirSauvegarde(texte: string): Sauvegarde | string {
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return 'Ce fichier n’est pas une sauvegarde de Pilotage.';
  }
  const enveloppe = brut as { format?: unknown; donnees?: unknown; business?: { id?: unknown; nom?: unknown } } | null;
  if (enveloppe?.format !== FORMAT_SAUVEGARDE) return 'Ce fichier n’est pas une sauvegarde de Pilotage.';
  const donnees = donneesValides(enveloppe.donnees);
  if (!donnees) return 'Cette sauvegarde est abîmée : rien n’a été modifié.';
  const b = enveloppe.business;
  const business =
    b && typeof b === 'object' && typeof b.nom === 'string' && b.nom.trim()
      ? { id: typeof b.id === 'string' ? b.id : null, nom: b.nom }
      : null;
  return { donnees, business };
}

/** Relit un fichier de sauvegarde. Renvoie les données, ou un message d'erreur. */
export function lireSauvegarde(texte: string): Donnees | string {
  const resultat = ouvrirSauvegarde(texte);
  return typeof resultat === 'string' ? resultat : resultat.donnees;
}

/** « pilotage-guide-detailing-2026-10-06.json » : le nom du business, simplifié, puis la date. */
export function nomFichierSauvegarde(nomBusiness: string | null | undefined, date: string): string {
  const simple = (nomBusiness ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .slice(0, 40)
    .replace(/^-+|-+$/g, '');
  return `pilotage-${simple || 'sauvegarde'}-${date}.json`;
}

/**
 * La question posée avant de restaurer, dans la fenêtre. Si la sauvegarde vient d'un autre business, on le dit.
 * `actuel` est absent sur l'appareil seul (pas de business).
 */
export function questionRestauration(fichier: BusinessSauvegarde | null, actuel?: { id: string; nom: string } | null): string {
  const definitif = 'Ça ne peut pas être annulé.';
  if (!actuel) return `Remplacer les données de cet appareil par cette sauvegarde ? ${definitif}`;
  const autre = fichier && !(fichier.id === actuel.id || memeNom(fichier.nom, actuel.nom));
  if (autre) {
    return `Cette sauvegarde vient de « ${fichier.nom} », pas de « ${actuel.nom} ». Remplacer quand même les données de « ${actuel.nom} » ? ${definitif}`;
  }
  return `Remplacer les données de « ${actuel.nom} » par cette sauvegarde ? ${definitif}`;
}

// --- Contrôle des données relues (sauvegarde, copie de l'appareil) ---

const entier = (n: unknown): n is number => Number.isSafeInteger(n) && (n as number) >= 0;
const texte = (s: unknown, max: number): s is string => typeof s === 'string' && s.length <= max;
/** Un instant ISO avec son fuseau (Z ou +02:00) : jamais lu à l'heure de l'appareil. */
const instantIso = (s: unknown): s is string =>
  typeof s === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(s) &&
  !Number.isNaN(Date.parse(s));
const jourIso = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

function venteValide(brut: unknown, exemple: boolean): Vente | null {
  const v = brut as Partial<Vente> | null;
  if (!v || typeof v !== 'object') return null;
  if (!texte(v.plateforme, 50) || !v.plateforme) return null;
  // Une vente du mode test n'entre jamais dans de vraies données.
  if (!exemple && v.plateforme.endsWith('-test')) return null;
  if (!texte(v.numeroCommande, 200) || !v.numeroCommande || !instantIso(v.instant)) return null;
  if (!entier(v.montantCentimes) || (v.fraisCentimes !== null && !entier(v.fraisCentimes))) return null;
  if (v.tvaCentimes !== undefined && !entier(v.tvaCentimes)) return null;
  if (typeof v.rembourse !== 'boolean') return null;
  const produit = v.produit ?? '';
  if (!texte(produit, 1000)) return null;
  // On reconstruit la vente : aucun autre champ (nom ou e-mail d'un client, par exemple) ne passe.
  return {
    plateforme: v.plateforme,
    numeroCommande: v.numeroCommande,
    instant: v.instant,
    montantCentimes: v.montantCentimes,
    fraisCentimes: v.fraisCentimes,
    ...(v.tvaCentimes !== undefined ? { tvaCentimes: v.tvaCentimes } : {}),
    rembourse: v.rembourse,
    produit,
  };
}

function videoValide(brut: unknown): Video | null {
  const v = brut as Partial<Video> | null;
  if (!v || typeof v !== 'object') return null;
  if (!texte(v.id, 200) || !v.id || !instantIso(v.instant)) return null;
  if (typeof v.reseau !== 'string' || !Object.hasOwn(NOMS_RESEAUX, v.reseau)) return null;
  if (v.lien !== undefined && !(texte(v.lien, 2000) && v.lien.startsWith('https://'))) return null;
  if (v.vues !== undefined && !entier(v.vues)) return null;
  return {
    id: v.id,
    instant: v.instant,
    reseau: v.reseau,
    ...(v.lien !== undefined ? { lien: v.lien } : {}),
    ...(v.vues !== undefined ? { vues: v.vues } : {}),
  };
}

function etatsValides(brut: unknown): Record<string, EtatAlerte> | null {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) return null;
  const etats: Record<string, EtatAlerte> = {};
  for (const [id, e] of Object.entries(brut as Record<string, Partial<EtatAlerte> | null>)) {
    if (id.length > 200 || !e || (e.statut !== 'fait' && e.statut !== 'plus-tard') || !jourIso(e.le)) return null;
    etats[id] = { statut: e.statut, le: e.le };
  }
  return etats;
}

/**
 * Vérifie les données relues (sauvegarde ou copie de l'appareil) et les reconstruit.
 * Renvoie null si un seul élément est abîmé : rien n'est alors modifié ni affiché.
 */
export function donneesValides(brut: unknown): Donnees | null {
  const d = brut as Partial<Donnees> | null;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.exemple !== 'boolean' || !Array.isArray(d.ventes) || !Array.isArray(d.videos)) return null;
  const objectif = d.reglages?.objectifParJour;
  if (!entier(objectif) || objectif > 20) return null;
  if (d.couverture !== null && !instantIso(d.couverture)) return null;
  const exemple = d.exemple;
  const ventes = d.ventes.map((v) => venteValide(v, exemple));
  const videos = d.videos.map(videoValide);
  const etatsAlertes = etatsValides(d.etatsAlertes);
  if (ventes.includes(null) || videos.includes(null) || !etatsAlertes) return null;
  return {
    ventes: ventes as Vente[],
    videos: videos as Video[],
    reglages: { objectifParJour: objectif },
    couverture: d.couverture,
    etatsAlertes,
    exemple,
  };
}
