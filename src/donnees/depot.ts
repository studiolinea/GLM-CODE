// Le dépôt : là où les vraies données sont gardées (la base en ligne).
// Les données d'exemple ne quittent jamais l'appareil.

import { REGLAGES_PAR_DEFAUT, type Donnees, type EtatAlerte, type Video } from '../modele';
import { cleVente, type Vente } from '../ventes/modele';
import { donneesVides } from './actions';
import { donneesExemple } from './exemple';

export interface ReglagesCompte {
  objectifParJour: number;
  couverture: string | null;
  /** Vrai dès que Kévin a commencé avec ses vraies données : l'exemple ne revient plus. */
  exempleTermine: boolean;
}

/** Tout ce que le compte contient dans la base. */
export interface DonneesCompte {
  ventes: Vente[];
  videos: Video[];
  etatsAlertes: Record<string, EtatAlerte>;
  reglages: ReglagesCompte | null;
}

/** Ce qu'il faut écrire dans la base pour passer d'un état à l'autre. */
export interface Changements {
  ventes: { enregistrer: Vente[]; supprimer: Pick<Vente, 'plateforme' | 'numeroCommande'>[] };
  videos: { enregistrer: Video[]; supprimer: string[] };
  etatsAlertes: { enregistrer: { id: string; etat: EtatAlerte }[]; supprimer: string[] };
  reglages: ReglagesCompte | null;
}

export interface Depot {
  charger(): Promise<DonneesCompte>;
  appliquer(changements: Changements): Promise<void>;
}

/** Ce que l'appli affiche à partir du compte : l'exemple tant que le compte est vide et que Kévin n'a pas commencé. */
export function versDonnees(compte: DonneesCompte, maintenant: Date): Donnees {
  const reglages = { objectifParJour: compte.reglages?.objectifParJour ?? REGLAGES_PAR_DEFAUT.objectifParJour };
  const vide = compte.ventes.length === 0 && compte.videos.length === 0 && !compte.reglages?.couverture;
  if (vide && !compte.reglages?.exempleTermine) return { ...donneesExemple(maintenant), reglages };
  return {
    ventes: [...compte.ventes].sort((a, b) => a.instant.localeCompare(b.instant)),
    videos: [...compte.videos].sort((a, b) => a.instant.localeCompare(b.instant)),
    reglages,
    couverture: compte.reglages?.couverture ?? null,
    etatsAlertes: compte.etatsAlertes,
    exemple: false,
  };
}

const identiques = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function difference<T>(avant: T[], apres: T[], cle: (x: T) => string) {
  const parCleAvant = new Map(avant.map((x) => [cle(x), x]));
  const clesApres = new Set(apres.map(cle));
  return {
    enregistrer: apres.filter((x) => {
      const ancien = parCleAvant.get(cle(x));
      return !ancien || !identiques(ancien, x);
    }),
    supprimer: avant.filter((x) => !clesApres.has(cle(x))),
  };
}

/**
 * Compare deux états et liste ce qu'il faut écrire dans la base.
 * Renvoie null s'il n'y a rien à écrire (par exemple, une action sur les données d'exemple).
 */
export function calculerChangements(avant: Donnees, apres: Donnees): Changements | null {
  if (apres.exemple) return null;
  // En quittant l'exemple, on part d'un compte vide : tout ce qui est réel est à écrire.
  const base = avant.exemple ? donneesVides(apres.reglages) : avant;

  const ventes = difference(base.ventes, apres.ventes, cleVente);
  const videos = difference(base.videos, apres.videos, (v) => v.id);
  const etats = difference(
    Object.entries(base.etatsAlertes).map(([id, etat]) => ({ id, etat })),
    Object.entries(apres.etatsAlertes).map(([id, etat]) => ({ id, etat })),
    (e) => e.id,
  );

  const reglagesAvant: ReglagesCompte | null = avant.exemple
    ? null
    : { objectifParJour: base.reglages.objectifParJour, couverture: base.couverture, exempleTermine: true };
  const reglagesApres: ReglagesCompte = {
    objectifParJour: apres.reglages.objectifParJour,
    couverture: apres.couverture,
    exempleTermine: true,
  };

  const changements: Changements = {
    ventes: {
      enregistrer: ventes.enregistrer,
      supprimer: ventes.supprimer.map(({ plateforme, numeroCommande }) => ({ plateforme, numeroCommande })),
    },
    videos: { enregistrer: videos.enregistrer, supprimer: videos.supprimer.map((v) => v.id) },
    etatsAlertes: { enregistrer: etats.enregistrer, supprimer: etats.supprimer.map((e) => e.id) },
    reglages: identiques(reglagesAvant, reglagesApres) ? null : reglagesApres,
  };

  const rien =
    changements.ventes.enregistrer.length === 0 &&
    changements.ventes.supprimer.length === 0 &&
    changements.videos.enregistrer.length === 0 &&
    changements.videos.supprimer.length === 0 &&
    changements.etatsAlertes.enregistrer.length === 0 &&
    changements.etatsAlertes.supprimer.length === 0 &&
    changements.reglages === null;
  return rien ? null : changements;
}
