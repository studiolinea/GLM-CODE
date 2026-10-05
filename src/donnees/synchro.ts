import type { Donnees } from '../modele';
import { calculerChangements, type Depot } from './depot';

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
    private readonly surEchec: (etatServeur: Donnees) => void,
  ) {}

  /** Vrai tant qu'un envoi n'est pas terminé. */
  get occupee(): boolean {
    return this.enCours > 0;
  }

  enregistrer(avant: Donnees, apres: Donnees): void {
    const changements = calculerChangements(avant, apres);
    if (!changements) return;
    const generation = this.generation;
    this.enCours++;
    this.file = this.file
      .then(async () => {
        if (generation !== this.generation) return;
        try {
          await this.depot.appliquer(changements);
          this.etatServeur = apres;
        } catch {
          this.generation++;
          this.surEchec(this.etatServeur);
        }
      })
      .finally(() => {
        this.enCours--;
      });
  }

  /** Attend la fin de tous les envois prévus. */
  attendre(): Promise<void> {
    return this.file;
  }
}
