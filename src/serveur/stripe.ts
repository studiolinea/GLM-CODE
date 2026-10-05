// Lecture des ventes d'un compte Stripe (y compris Stripe Managed Payments), avec une clé limitée en lecture.
// Aucun nom ni e-mail de client n'est gardé.

import type { Vente } from '../ventes/modele';
import { CleRefusee, DroitsInsuffisants, type Connecteur, type Recuperateur, type VenteIgnoree } from './commun';

const API = 'https://api.stripe.com/v1';
const PAR_PAGE = 100;
const PAGES_MAX = 30;

interface TransactionSolde {
  amount: number;
  fee: number;
  net: number;
  currency: string;
}

export interface ChargeStripe {
  id: string;
  amount: number;
  amount_refunded: number;
  currency: string;
  created: number;
  status: string;
  paid: boolean;
  refunded: boolean;
  livemode: boolean;
  description: string | null;
  balance_transaction: string | TransactionSolde | null;
}

async function appeler<T>(cle: string, chemin: string, recuperer: Recuperateur): Promise<T> {
  const reponse = await recuperer(`${API}${chemin}`, { headers: { Authorization: `Bearer ${cle}` } });
  if (reponse.status === 401) throw new CleRefusee('Clé refusée par Stripe');
  if (reponse.status === 403) throw new DroitsInsuffisants('Autorisation manquante');
  if (!reponse.ok) throw new Error(`Stripe a répondu ${reponse.status}`);
  return (await reponse.json()) as T;
}

/** Les paiements, avec le détail des frais de chacun, page par page. */
export async function toutesLesCharges(cle: string, recuperer: Recuperateur = fetch): Promise<ChargeStripe[]> {
  const charges: ChargeStripe[] = [];
  let apres: string | undefined;
  for (let page = 0; page < PAGES_MAX; page++) {
    const suite = apres ? `&starting_after=${encodeURIComponent(apres)}` : '';
    const reponse = await appeler<{ data?: ChargeStripe[]; has_more?: boolean }>(
      cle,
      `/charges?limit=${PAR_PAGE}&expand%5B%5D=data.balance_transaction${suite}`,
      recuperer,
    );
    const lot = reponse.data ?? [];
    charges.push(...lot);
    if (!reponse.has_more || lot.length === 0) break;
    apres = lot[lot.length - 1]!.id;
  }
  return charges;
}

/**
 * Transforme les paiements Stripe en ventes de l'appli.
 * - Les frais viennent de Stripe, paiement par paiement (y compris ceux de Managed Payments).
 * - Les paiements du mode test gardent la plateforme « stripe-test » : jamais dans les vraies données.
 */
export function chargesVersVentes(charges: ChargeStripe[]): { ventes: Vente[]; ignorees: VenteIgnoree[] } {
  const ventes: Vente[] = [];
  const ignorees: VenteIgnoree[] = [];
  for (const c of charges) {
    if (c.status !== 'succeeded' || !c.paid) {
      ignorees.push({ numero: c.id, raison: 'paiement non abouti' });
      continue;
    }
    if ((c.currency ?? '').toLowerCase() !== 'eur') {
      ignorees.push({ numero: c.id, raison: `devise ${c.currency} : seules les ventes en euros sont lues` });
      continue;
    }
    const solde = typeof c.balance_transaction === 'object' && c.balance_transaction ? c.balance_transaction : null;
    ventes.push({
      plateforme: c.livemode ? 'stripe' : 'stripe-test',
      numeroCommande: c.id,
      instant: new Date(c.created * 1000).toISOString(),
      // Remboursement partiel : on garde la part non remboursée.
      montantCentimes: c.refunded ? c.amount : Math.max(0, c.amount - (c.amount_refunded ?? 0)),
      fraisCentimes: solde && solde.currency.toLowerCase() === 'eur' ? solde.fee : null,
      rembourse: c.refunded,
      produit: c.description ?? '',
    });
  }
  return { ventes, ignorees };
}

export const connecteurStripe: Connecteur = {
  nom: 'Stripe',
  refuserCle(cle) {
    if (cle.startsWith('sk_')) {
      return 'Cette clé donne tous les droits sur ton compte Stripe. Crée plutôt une clé limitée en lecture : elle commence par « rk_ ».';
    }
    if (!cle.startsWith('rk_')) return 'Ce n’est pas une clé limitée Stripe : elle doit commencer par « rk_ ».';
    return null;
  },
  async verifier(cle, recuperer) {
    await appeler(cle, '/charges?limit=1&expand%5B%5D=data.balance_transaction', recuperer);
    return cle.startsWith('rk_test_') ? 'Stripe (mode test)' : 'Stripe';
  },
  async lireVentes(cle, recuperer) {
    return chargesVersVentes(await toutesLesCharges(cle, recuperer));
  },
  messageDroits:
    'Il manque une autorisation à cette clé Stripe : mets « Lecture » pour « Charges » et pour « Balance », puis recrée la clé.',
};
