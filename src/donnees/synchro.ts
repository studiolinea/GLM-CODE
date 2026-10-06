import type { Donnees } from '../modele';
import { calculerChangements, type Depot } from './depot';

/**
 * D'où vient une modification : d'une action de la personne (rien de précisé),
 * ou d'une actualisation automatique des comptes reliés (ventes de la boutique, vidéos d'un réseau).
 */
export type OrigineModification = 'ventes' | 'videos';

/**
 * Envoie les changements à la base, un par un et dans l'ordre.
 * Si un envoi échoue (pas de connexion), les envois suivants déjà prévus sont abandonnés
 * et l'appli revient au dernier état confirmé par la base : rien n'est perdu en silence.
 */
export class Synchro {
  private file: Promise<void> = Promise.resolve();
  private generation = 0;
  private enCours = 0;

  constructor(
    private readonly depot: Depot,
    /** Le dernier état que la base a confirmé. */
    public etatServeur: Donnees,
    /** `origine` : celle du changement qui n'a pas pu être enregistré (absente pour une action de la personne). */
    private readonly surEchec: (etatServeur: Donnees, origine?: OrigineModification) => void,
  ) {}

  /** Vrai tant qu'un envoi n'est pas terminé. */
  get occupee(): boolean {
    return this.enCours > 0;
  }

  /** Renvoie une promesse : vrai quand la base a enregistré le changement, faux s'il n'a pas pu l'être. */
  enregistrer(avant: Donnees, apres: Donnees, origine?: OrigineModification): Promise<boolean> {
    const changements = calculerChangements(avant, apres);
    if (!changements) return Promise.resolve(true);
    const generation = this.generation;
    this.enCours++;
    let enregistre = false;
    this.file = this.file
      .then(async () => {
        if (generation !== this.generation) return;
        try {
          await this.depot.appliquer(changements);
          this.etatServeur = apres;
          enregistre = true;
        } catch {
          this.generation++;
          this.surEchec(this.etatServeur, origine);
        }
      })
      .finally(() => {
        this.enCours--;
      });
    return this.file.then(() => enregistre);
  }

  /** Attend la fin de tous les envois prévus. */
  attendre(): Promise<void> {
    return this.file;
  }
}

/** Le message quand un enregistrement dans la base a échoué, selon ce qui l'a demandé. */
export function messageEchecEnregistrement(origine?: OrigineModification): string {
  if (origine === 'ventes') return 'Tes dernières ventes n’ont pas pu être enregistrées. Réessaie dans un moment.';
  if (origine === 'videos') return 'Tes dernières vidéos n’ont pas pu être enregistrées. Réessaie dans un moment.';
  return 'Ta dernière action n’a pas été enregistrée. Vérifie ta connexion, puis réessaie.';
}
