// Ce que partagent les branchements aux boutiques (Stripe, Lemon Squeezy…).

import type { Vente } from '../ventes/modele';

export type Recuperateur = typeof fetch;

/** La plateforme refuse la clé (mauvaise, effacée ou incomplète). */
export class CleRefusee extends Error {}

/** La clé est valable, mais il lui manque une autorisation de lecture. */
export class DroitsInsuffisants extends Error {}

export interface VenteIgnoree {
  numero: string;
  raison: string;
}

export interface VentesLues {
  ventes: Vente[];
  ignorees: VenteIgnoree[];
}

/** Un branchement à une boutique : vérifier une clé, puis lire les ventes. */
export interface Connecteur {
  nom: string;
  /** Refuse avant tout appel une clé dangereuse ou mal formée ; renvoie le message à afficher, ou null. */
  refuserCle?(cle: string): string | null;
  /** Vérifie la clé et renvoie un libellé (par exemple le nom de la boutique). */
  verifier(cle: string, recuperer: Recuperateur): Promise<string>;
  lireVentes(cle: string, recuperer: Recuperateur): Promise<VentesLues>;
  /** Message quand il manque une autorisation à la clé. */
  messageDroits: string;
}
