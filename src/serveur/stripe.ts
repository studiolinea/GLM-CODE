// Lecture des ventes d'un compte Stripe (y compris Stripe Managed Payments), avec une clé limitée en lecture.
// Aucun nom ni e-mail de client n'est gardé.

import type { Vente } from '../ventes/modele';
import {
  CleRefusee,
  DroitsInsuffisants,
  raisonAutreDevise,
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
    if (!reponse.has_more) return charges;
    if (lot.length === 0) throw new Error('Historique Stripe incomplet : page suivante manquante.');
    apres = lot[lot.length - 1]!.id;
  }
  throw new Error('Historique Stripe incomplet : la limite de lecture est atteinte. Aucune vente n’a été actualisée.');
}

/**
 * Les frais Managed Payments, par jour : Stripe les facture une fois par jour, la nuit suivante, dans un mouvement
 * à part (« Managed Payments Transaction Fee (2026-10-05) »), pour tous les paiements de ce jour (date UTC).
 * Renvoie, pour chaque jour facturé, le total des frais en centimes. Les remboursements de frais ne sont pas comptés.
 */
export function fraisGeresParJour(transactions: TransactionStripe[]): Map<string, number> {
  const parJour = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'stripe_fee' || (t.currency ?? '').toLowerCase() !== 'eur' || typeof t.amount !== 'number' || t.amount >= 0) continue;
    const jour = /managed payments/i.test(t.description ?? '') ? /\((\d{4}-\d{2}-\d{2})\)/.exec(t.description ?? '')?.[1] : undefined;
    if (jour) parJour.set(jour, (parJour.get(jour) ?? 0) - t.amount);
  }
  return parJour;
}

/** Les mouvements « frais Stripe » du compte, page par page. null s'ils ne peuvent pas être lus (droit « Balance » absent…). */
export async function toutesLesTransactionsFrais(cle: string, recuperer: Recuperateur = fetch): Promise<TransactionStripe[] | null> {
  const transactions: TransactionStripe[] = [];
  let apres: string | undefined;
  try {
    for (let page = 0; page < PAGES_MAX; page++) {
      const suite = apres ? `&starting_after=${encodeURIComponent(apres)}` : '';
      const reponse = await appeler<{ data?: (TransactionStripe & { id?: string })[]; has_more?: boolean }>(
        cle,
        `/balance_transactions?type=stripe_fee&limit=${PAR_PAGE}${suite}`,
        recuperer,
      );
      const lot = reponse.data ?? [];
      transactions.push(...lot);
      const dernier = lot[lot.length - 1]?.id;
      if (!reponse.has_more) return transactions;
      if (!dernier) throw new Error('Historique des frais Stripe incomplet.');
      apres = dernier;
    }
    throw new Error('Historique des frais Stripe incomplet : limite de lecture atteinte.');
  } catch (e) {
    // Sans le droit « Balance » (ou si Stripe refuse cette lecture), les frais Managed Payments restent inconnus,
    // mais les ventes arrivent quand même. Le détail va dans les journaux Cloudflare.
    if (e instanceof CleRefusee) throw e;
    if (!(e instanceof DroitsInsuffisants)) console.error('Lecture des frais Stripe impossible', e);
    return null;
  }
}

/** Partage un total entre des parts, en proportion de leur poids, sans perdre ni ajouter un centime. */
function partager(total: number, poids: number[]): number[] {
  const somme = poids.reduce((a, b) => a + b, 0);
  if (somme <= 0) return poids.map(() => 0);
  const exactes = poids.map((p) => (total * p) / somme);
  const parts = exactes.map(Math.floor);
  let reste = total - parts.reduce((a, b) => a + b, 0);
  const ordre = exactes.map((x, i) => [x - Math.floor(x), i] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (const [, i] of ordre) {
    if (reste <= 0) break;
    parts[i]!++;
    reste--;
  }
  return parts;
}

const jourUtc = (c: ChargeStripe) => new Date(c.created * 1000).toISOString().slice(0, 10);
const aboutie = (c: ChargeStripe) => c.status === 'succeeded' && c.paid && (c.currency ?? '').toLowerCase() === 'eur';

/**
 * Transforme les paiements Stripe en ventes de l'appli.
 * - Le montant est la part du vendeur : sans la TVA que Stripe retient avec Managed Payments.
 * - Les frais viennent de Stripe. Avec Managed Payments, il y en a deux : les frais de paiement, dans chaque paiement,
 *   et les frais Managed Payments, facturés à part la nuit suivante (`fraisParJour`). Tant que ceux d'un jour ne sont
 *   pas facturés (ou pas lisibles : `fraisParJour` à null), les frais des ventes de ce jour restent inconnus (null).
 * - Les paiements du mode test gardent la plateforme « stripe-test » : jamais dans les vraies données.
 */
export function chargesVersVentes(
  charges: ChargeStripe[],
  fraisParJour: Map<string, number> | null = null,
  managedPaymentsPossible = false,
): { ventes: Vente[]; ignorees: VenteIgnoree[] } {
  const ventes: Vente[] = [];
  const ignorees: VenteIgnoree[] = [];
  // Le compte est en Managed Payments dès qu'un paiement porte de la TVA retenue, ou que Stripe a facturé des frais
  // Managed Payments : ces frais concernent alors tous ses paiements, même ceux sans TVA.
  const geresParStripe =
    managedPaymentsPossible || (fraisParJour?.size ?? 0) > 0 ||
    charges.some((c) => typeof c.balance_transaction === 'object' && c.balance_transaction?.fee_details?.some((f) => f.type === 'withheld_tax'));
  // Les frais Managed Payments d'un jour, partagés entre les paiements de ce jour selon leur montant payé.
  const fraisGeres = new Map<string, number>();
  for (const [jour, total] of fraisParJour ?? []) {
    const duJour = charges.filter((c) => aboutie(c) && jourUtc(c) === jour);
    partager(total, duJour.map((c) => c.amount)).forEach((part, i) => fraisGeres.set(duJour[i]!.id, part));
  }
  for (const c of charges) {
    if (c.status !== 'succeeded' || !c.paid) {
      ignorees.push({ numero: c.id, raison: 'paiement non abouti' });
      continue;
    }
    if ((c.currency ?? '').toLowerCase() !== 'eur') {
      ignorees.push({ numero: c.id, raison: raisonAutreDevise(c.currency) });
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
      fraisCentimes: !solde ? null : !geresParStripe ? solde.fee : fraisAvecGeres(solde.fee - tva, fraisGeres.get(c.id)),
      ...(tvaGardee > 0 ? { tvaCentimes: tvaGardee } : {}),
      rembourse: c.refunded,
      produit: '',
    });
  }
  return { ventes, ignorees };
}

/** Frais de paiement + frais Managed Payments ; inconnus tant que Stripe n'a pas facturé les seconds. */
function fraisAvecGeres(paiement: number, geres: number | undefined): number | null {
  return geres === undefined ? null : paiement + geres;
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
    description: null,
    origine: typeof t.source === 'string' ? t.source : (t.source?.id ?? null),
    detailFrais: (t.fee_details ?? []).map((f) => ({
      type: f.type ?? '',
      montantCentimes: nombre(f.amount),
      description: null,
    })),
  }));
}

export const connecteurStripe: Connecteur = {
  nom: 'Stripe',
  refuserCle(cle) {
    if (cle.startsWith('sk_')) {
      return 'Cette clé donne tous les droits sur ton compte Stripe. Crée plutôt une clé limitée en lecture : elle commence par « rk_ ».';
    }
    if (!cle.startsWith('rk_')) return 'Ce n’est pas une clé limitée Stripe : elle doit commencer par « rk_ ».';
    return null;
  },
  async verifier(cle, recuperer) {
    await appeler(cle, '/charges?limit=1&expand%5B%5D=data.balance_transaction', recuperer);
    return cle.startsWith('rk_test_') ? 'Stripe (mode test)' : 'Stripe';
  },
  async lireVentes(cle, recuperer) {
    const [charges, frais] = await Promise.all([toutesLesCharges(cle, recuperer), toutesLesTransactionsFrais(cle, recuperer)]);
    // L’API ne prouve pas qu’un compte sans TVA est hors Managed Payments.
    return chargesVersVentes(charges, frais && fraisGeresParJour(frais), true);
  },
  async mouvements(cle, recuperer) {
    const reponse = await appeler<{ data?: TransactionStripe[] }>(cle, '/balance_transactions?limit=25', recuperer);
    return transactionsVersMouvements(reponse.data ?? []);
  },
  messageDroits:
    'Il manque une autorisation à cette clé Stripe : mets « Lecture » pour « Charges » et pour « Balance », puis recrée la clé.',
};
