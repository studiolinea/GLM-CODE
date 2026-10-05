// Lecture des commandes d'une boutique Lemon Squeezy (API v1, format JSON:API).
// Aucun nom ni e-mail de client n'est gardé.

import type { Vente } from '../ventes/modele';

const API = 'https://api.lemonsqueezy.com/v1';
const PAR_PAGE = 100;
const PAGES_MAX = 50;

export type Recuperateur = typeof fetch;

/** Lemon Squeezy refuse la clé (mauvaise, effacée ou incomplète). */
export class CleRefusee extends Error {}

export interface CommandeLemonSqueezy {
  id: string;
  attributes: {
    order_number?: number;
    currency?: string;
    total?: number;
    refunded_amount?: number;
    status?: string;
    created_at?: string;
    test_mode?: boolean;
    first_order_item?: { product_name?: string } | null;
  };
}

interface ReponseListe<T> {
  data?: T[];
  meta?: { page?: { currentPage?: number; lastPage?: number } };
}

async function appeler<T>(cle: string, chemin: string, recuperer: Recuperateur): Promise<T> {
  const reponse = await recuperer(`${API}${chemin}`, {
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${cle}`,
    },
  });
  if (reponse.status === 401 || reponse.status === 403) throw new CleRefusee('Clé refusée par Lemon Squeezy');
  if (!reponse.ok) throw new Error(`Lemon Squeezy a répondu ${reponse.status}`);
  return (await reponse.json()) as T;
}

/** Vérifie la clé et renvoie le nom de la ou des boutiques. */
export async function nomBoutique(cle: string, recuperer: Recuperateur = fetch): Promise<string> {
  const reponse = await appeler<ReponseListe<{ attributes?: { name?: string } }>>(cle, '/stores', recuperer);
  const noms = (reponse.data ?? []).map((b) => b.attributes?.name).filter((n): n is string => Boolean(n));
  return noms.join(', ') || 'Boutique Lemon Squeezy';
}

/** Toutes les commandes, page par page. */
export async function toutesLesCommandes(cle: string, recuperer: Recuperateur = fetch): Promise<CommandeLemonSqueezy[]> {
  const commandes: CommandeLemonSqueezy[] = [];
  for (let page = 1; page <= PAGES_MAX; page++) {
    const reponse = await appeler<ReponseListe<CommandeLemonSqueezy>>(
      cle,
      `/orders?page%5Bnumber%5D=${page}&page%5Bsize%5D=${PAR_PAGE}`,
      recuperer,
    );
    commandes.push(...(reponse.data ?? []));
    const derniere = reponse.meta?.page?.lastPage ?? page;
    if (!reponse.data?.length || page >= derniere) break;
  }
  return commandes;
}

export interface CommandeIgnoree {
  numero: string;
  raison: string;
}

/**
 * Transforme les commandes en ventes de l'appli.
 * - Les commandes en mode test gardent la plateforme « lemonsqueezy-test » : l'appli ne les montre
 *   qu'avec les données d'exemple, jamais comme de vraies ventes.
 * - Lemon Squeezy ne donne pas ses frais commande par commande : les frais restent inconnus (null).
 */
export function commandesVersVentes(commandes: CommandeLemonSqueezy[]): {
  ventes: Vente[];
  ignorees: CommandeIgnoree[];
} {
  const ventes: Vente[] = [];
  const ignorees: CommandeIgnoree[] = [];
  for (const c of commandes) {
    const a = c.attributes ?? {};
    const numero = String(a.order_number ?? c.id);
    const ignorer = (raison: string) => ignorees.push({ numero, raison });

    if (a.status !== 'paid' && a.status !== 'refunded' && a.status !== 'partial_refund') {
      ignorer(`commande non payée (statut « ${a.status ?? 'inconnu'} »)`);
      continue;
    }
    if ((a.currency ?? '').toUpperCase() !== 'EUR') {
      ignorer(`devise ${a.currency ?? 'inconnue'} : seules les ventes en euros sont lues`);
      continue;
    }
    const instant = a.created_at ? new Date(a.created_at) : null;
    if (!instant || Number.isNaN(instant.getTime()) || typeof a.total !== 'number') {
      ignorer('date ou montant manquant');
      continue;
    }
    const montant = a.status === 'partial_refund' ? a.total - (a.refunded_amount ?? 0) : a.total;
    ventes.push({
      plateforme: a.test_mode ? 'lemonsqueezy-test' : 'lemonsqueezy',
      numeroCommande: numero,
      instant: instant.toISOString(),
      montantCentimes: Math.max(0, Math.round(montant)),
      fraisCentimes: null,
      rembourse: a.status === 'refunded',
      produit: a.first_order_item?.product_name ?? '',
    });
  }
  return { ventes, ignorees };
}
