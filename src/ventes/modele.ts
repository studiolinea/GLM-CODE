/**
 * Une vente, telle que l'appli la garde. Volontairement, aucun nom ni e-mail de client :
 * seulement ce qu'il faut pour les calculs.
 */
export interface Vente {
  /** Plateforme d'où vient la vente ("exemple", puis "payhip", "gumroad"…). */
  plateforme: string;
  numeroCommande: string;
  /** Moment de la vente, ISO UTC. */
  instant: string;
  /** Ce que le client a payé, en centimes, sans la TVA quand la plateforme la retient (Stripe Managed Payments). */
  montantCentimes: number;
  /** Commission et frais de la plateforme en centimes ; null si le fichier ne les donne pas. */
  fraisCentimes: number | null;
  rembourse: boolean;
  produit: string;
}

/** Une vente est reconnue par sa plateforme et son numéro de commande. */
export function cleVente(v: Pick<Vente, 'plateforme' | 'numeroCommande'>): string {
  return `${v.plateforme}:${v.numeroCommande}`;
}

/** Un lecteur pour l'export d'une plateforme donnée. */
export interface Adaptateur {
  plateforme: string;
  /** Nom affiché à Kévin. */
  nom: string;
  /** Vrai si ces en-têtes de colonnes ressemblent à l'export de cette plateforme. */
  reconnait(entetes: string[]): boolean;
  /** Lit une ligne : renvoie la vente, ou la raison pour laquelle la ligne est refusée. */
  lireLigne(ligne: Record<string, string>): Vente | string;
}

export interface LigneIgnoree {
  /** Numéro de ligne dans le fichier (la ligne 1 est celle des en-têtes). */
  ligne: number;
  raison: string;
}

export type ResultatLecture =
  | { ok: true; plateforme: string; nomPlateforme: string; ventes: Vente[]; lignesIgnorees: LigneIgnoree[] }
  | { ok: false; erreur: string };
