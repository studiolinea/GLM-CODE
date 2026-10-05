// Lecture des ventes d'un compte Stripe (y compris Stripe Managed Payments), avec une clé limitée en lecture.
// Aucun nom ni e-mail de client n'est gardé.

import type { Vente } from '../ventes/modele';
import {
  CleRefusee,
  DroitsInsuffisants,
  type Connecteur,
  type MouvementBoutique,
  type Recuperateur,
  type VenteIgnoree,
} from './commun';

const API = 'https://api.stripe.com/v1';
const PAR_PAGE = 100;
const PAGES_MAX = 30;

interface TransactionSolde {
  amount: number;
  fee: number;
  net: number;
  currency: string;
  fee_details?: { type?: string; amount?: number }[];
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
 * - Le montant est la part du vendeur : sans la TVA que Stripe retient avec Managed Payments.
 * - Les frais viennent de Stripe, paiement par paiement. Avec Managed Payments, ses 3,5 % sont comptés à part :
 *   les frais restent inconnus (null) tant que l'appli ne les lit pas.
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
    const solde =
      typeof c.balance_transaction === 'object' && c.balance_transaction && c.balance_transaction.currency.toLowerCase() === 'eur'
        ? c.balance_transaction
        : null;
    // Managed Payments : Stripe retient la TVA du client (« withheld_tax ») ; elle n'est ni à Kévin, ni un frais.
    const tva = somme((solde?.fee_details ?? []).filter((f) => f.type === 'withheld_tax').map((f) => f.amount ?? 0));
    // Remboursement partiel : on garde la part non remboursée, et la TVA qui va avec.
    const paye = c.refunded ? c.amount : Math.max(0, c.amount - (c.amount_refunded ?? 0));
    const tvaGardee = c.refunded || c.amount === 0 ? tva : Math.round((tva * paye) / c.amount);
    ventes.push({
      plateforme: c.livemode ? 'stripe' : 'stripe-test',
      numeroCommande: c.id,
      instant: new Date(c.created * 1000).toISOString(),
      montantCentimes: Math.max(0, paye - tvaGardee),
      // Avec Managed Payments, ses frais de 3,5 % ne sont pas dans ce paiement : Stripe les compte à part.
      // Tant que l'appli ne les lit pas, les frais restent inconnus plutôt que faux.
      fraisCentimes: solde && tva === 0 ? solde.fee : null,
      ...(tvaGardee > 0 ? { tvaCentimes: tvaGardee } : {}),
      rembourse: c.refunded,
      produit: c.description ?? '',
    });
  }
  return { ventes, ignorees };
}

function somme(nombres: number[]): number {
  return nombres.reduce((a, b) => a + b, 0);
}

/** Un mouvement du solde Stripe, tel que l'API le renvoie (seuls ces champs sont lus). */
export interface TransactionStripe {
  type?: string;
  reporting_category?: string;
  created?: number;
  amount?: number;
  fee?: number;
  net?: number;
  currency?: string;
  description?: string | null;
  source?: string | { id?: string } | null;
  fee_details?: { type?: string; amount?: number; description?: string | null }[];
}

/** Garde seulement ce qui sert à vérifier l'argent : aucun autre champ ne passe. */
export function transactionsVersMouvements(transactions: TransactionStripe[]): MouvementBoutique[] {
  const nombre = (n: unknown) => (typeof n === 'number' ? n : null);
  return transactions.map((t) => ({
    instant: typeof t.created === 'number' ? new Date(t.created * 1000).toISOString() : null,
    type: t.type ?? '',
    categorie: t.reporting_category ?? null,
    montantCentimes: nombre(t.amount),
    fraisCentimes: nombre(t.fee),
    netCentimes: nombre(t.net),
    devise: (t.currency ?? '').toLowerCase(),
    description: t.description ?? null,
    origine: typeof t.source === 'string' ? t.source : (t.source?.id ?? null),
    detailFrais: (t.fee_details ?? []).map((f) => ({
      type: f.type ?? '',
      montantCentimes: nombre(f.amount),
      description: f.description ?? null,
    })),
  }));
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
  async mouvements(cle, recuperer) {
    const reponse = await appeler<{ data?: TransactionStripe[] }>(cle, '/balance_transactions?limit=25', recuperer);
    return transactionsVersMouvements(reponse.data ?? []);
  },
  messageDroits:
    'Il manque une autorisation à cette clé Stripe : mets « Lecture » pour « Charges » et pour « Balance », puis recrée la clé.',
};
