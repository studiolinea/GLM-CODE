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

/** « vente en USD (seules les ventes en euros sont lues) » : la raison d'une vente écartée à cause de sa devise. */
export function raisonAutreDevise(devise: string | null | undefined): string {
  const code = (devise ?? '').trim().toUpperCase();
  return `${code ? `vente en ${code}` : 'devise inconnue'} (seules les ventes en euros sont lues)`;
}

export interface VentesLues {
  ventes: Vente[];
  ignorees: VenteIgnoree[];
}

/**
 * Un mouvement d'argent tel que la plateforme l'a enregistré, sans aucune donnée de client.
 * Sert à vérifier les frais et la TVA. Une valeur absente reste null : rien n'est inventé.
 */
export interface MouvementBoutique {
  instant: string | null;
  /** Le type donné par la plateforme, tel quel (par exemple « charge » ou « stripe_fee »). */
  type: string;
  categorie: string | null;
  montantCentimes: number | null;
  fraisCentimes: number | null;
  netCentimes: number | null;
  devise: string;
  description: string | null;
  /** L'objet à l'origine du mouvement (par exemple « ch_… »), sans son contenu. */
  origine: string | null;
  detailFrais: { type: string; montantCentimes: number | null; description: string | null }[];
}

/** Un branchement à une boutique : vérifier une clé, puis lire les ventes. */
export interface Connecteur {
  nom: string;
  /** Refuse avant tout appel une clé dangereuse ou mal formée ; renvoie le message à afficher, ou null. */
  refuserCle?(cle: string): string | null;
  /** Vérifie la clé et renvoie un libellé (par exemple le nom de la boutique). */
  verifier(cle: string, recuperer: Recuperateur): Promise<string>;
  lireVentes(cle: string, recuperer: Recuperateur): Promise<VentesLues>;
  /** Les derniers mouvements d'argent, pour vérifier les frais et la TVA (seulement certaines boutiques). */
  mouvements?(cle: string, recuperer: Recuperateur): Promise<MouvementBoutique[]>;
  /** Message quand il manque une autorisation à la clé. */
  messageDroits: string;
}
