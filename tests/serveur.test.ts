import { describe, expect, it } from 'vitest';
import { chiffrer, dechiffrer } from '../src/serveur/chiffrement';
import { commandesVersVentes, type CommandeLemonSqueezy } from '../src/serveur/lemonsqueezy';
import { traiterApi, type Env } from '../src/serveur/worker';

const SECRET = 'un-long-secret-de-test-pour-le-chiffrement-0123456789';

describe('chiffrement des clés d’accès', () => {
  it('fait l’aller-retour, et deux chiffrements du même texte diffèrent', async () => {
    const a = await chiffrer('cle-secrete', SECRET);
    const b = await chiffrer('cle-secrete', SECRET);
    expect(a).not.toBe(b);
    expect(a).not.toContain('cle-secrete');
    expect(await dechiffrer(a, SECRET)).toBe('cle-secrete');
  });

  it('refuse de déchiffrer avec un autre secret', async () => {
    await expect(dechiffrer(await chiffrer('cle', SECRET), 'autre-secret')).rejects.toThrow();
  });
});

const commande = (id: string, attributes: CommandeLemonSqueezy['attributes']): CommandeLemonSqueezy => ({ id, attributes });

describe('commandes Lemon Squeezy → ventes', () => {
  it('garde les ventes payées en euros, sans nom ni e-mail de client', () => {
    const { ventes, ignorees } = commandesVersVentes([
      commande('1', {
        order_number: 101,
        currency: 'EUR',
        total: 1990,
        status: 'paid',
        created_at: '2026-10-05T08:15:00.000000Z',
        test_mode: false,
        first_order_item: { product_name: 'Guide detailing' },
        // @ts-expect-error champs présents dans la vraie réponse, volontairement ignorés
        user_name: 'Jean Client',
        user_email: 'jean@example.com',
      }),
    ]);
    expect(ignorees).toEqual([]);
    expect(ventes).toEqual([
      {
        plateforme: 'lemonsqueezy',
        numeroCommande: '101',
        instant: '2026-10-05T08:15:00.000Z',
        montantCentimes: 1990,
        fraisCentimes: null,
        rembourse: false,
        produit: 'Guide detailing',
      },
    ]);
  });

  it('remboursement total, remboursement partiel, mode test', () => {
    const { ventes } = commandesVersVentes([
      commande('2', { order_number: 102, currency: 'EUR', total: 1990, status: 'refunded', created_at: '2026-10-04T10:00:00Z' }),
      commande('3', { order_number: 103, currency: 'eur', total: 2990, refunded_amount: 1000, status: 'partial_refund', created_at: '2026-10-04T11:00:00Z' }),
      commande('4', { order_number: 104, currency: 'EUR', total: 1990, status: 'paid', created_at: '2026-10-04T12:00:00Z', test_mode: true }),
    ]);
    expect(ventes.map((v) => [v.numeroCommande, v.montantCentimes, v.rembourse, v.plateforme])).toEqual([
      ['102', 1990, true, 'lemonsqueezy'],
      ['103', 1990, false, 'lemonsqueezy'],
      ['104', 1990, false, 'lemonsqueezy-test'],
    ]);
  });

  it('écarte les commandes non payées et les autres devises, en disant pourquoi', () => {
    const { ventes, ignorees } = commandesVersVentes([
      commande('5', { order_number: 105, currency: 'EUR', total: 1990, status: 'pending', created_at: '2026-10-04T12:00:00Z' }),
      commande('6', { order_number: 106, currency: 'USD', total: 1990, status: 'paid', created_at: '2026-10-04T12:00:00Z' }),
    ]);
    expect(ventes).toEqual([]);
    expect(ignorees.map((i) => i.numero)).toEqual(['105', '106']);
    expect(ignorees[1]!.raison).toContain('euros');
  });
});

// ── Le serveur, avec une fausse base et un faux Lemon Squeezy ──

const env: Env = {
  ASSETS: { fetch: async () => new Response('page') },
  SUPABASE_URL: 'https://base.test',
  SUPABASE_CLE_PUBLIQUE: 'cle-publique',
  CLE_CHIFFREMENT: SECRET,
};
const CLE_LS = 'cle-lemonsqueezy-de-test-0123456789';

function faux() {
  const ligne: { cle_chiffree?: string; libelle?: string; derniere_synchro?: string | null; derniere_erreur?: string | null } = {};
  const appels: string[] = [];
  const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entree));
    const methode = init?.method ?? 'GET';
    const entetes = new Headers(init?.headers);
    appels.push(`${methode} ${url.host}${url.pathname}`);
    const repondre = (statut: number, corps?: unknown) =>
      new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut });

    if (url.host === 'base.test' && url.pathname === '/auth/v1/user') {
      return entetes.get('Authorization') === 'Bearer jeton-ok' ? repondre(200, { id: 'u1' }) : repondre(401, {});
    }
    if (url.host === 'base.test' && url.pathname === '/rest/v1/comptes_relies') {
      if (methode === 'POST') Object.assign(ligne, JSON.parse(String(init?.body)));
      if (methode === 'PATCH') Object.assign(ligne, JSON.parse(String(init?.body)));
      if (methode === 'GET') return repondre(200, ligne.cle_chiffree ? [{ cle_chiffree: ligne.cle_chiffree }] : []);
      return repondre(201);
    }
    if (url.host === 'api.lemonsqueezy.com') {
      if (entetes.get('Authorization') !== `Bearer ${CLE_LS}`) return repondre(401, {});
      if (url.pathname === '/v1/stores') return repondre(200, { data: [{ attributes: { name: 'Detailing Pro' } }] });
      if (url.pathname === '/v1/orders') {
        const page = Number(url.searchParams.get('page[number]'));
        const data = [
          commande(String(page), { order_number: 100 + page, currency: 'EUR', total: 1990, status: 'paid', created_at: '2026-10-04T12:00:00Z' }),
        ];
        return repondre(200, { data, meta: { page: { currentPage: page, lastPage: 2 } } });
      }
    }
    return repondre(404, {});
  }) as typeof fetch;
  return { recuperer, ligne, appels };
}

const appel = (chemin: string, corps?: unknown, jeton = 'jeton-ok') =>
  new Request(`https://pilotage.test${chemin}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corps ?? {}),
  });

describe('serveur : comptes reliés Lemon Squeezy', () => {
  it('refuse sans connexion', async () => {
    const f = faux();
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/relier', { cle: CLE_LS }, 'mauvais'), env, f.recuperer);
    expect(r.status).toBe(401);
  });

  it('refuse de travailler sans clé de chiffrement configurée', async () => {
    const f = faux();
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/relier', { cle: CLE_LS }), { ...env, CLE_CHIFFREMENT: undefined }, f.recuperer);
    expect(r.status).toBe(503);
  });

  it('refuse une clé que Lemon Squeezy n’accepte pas', async () => {
    const f = faux();
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/relier', { cle: 'mauvaise-cle-mais-assez-longue-pour-passer' }), env, f.recuperer);
    expect(r.status).toBe(400);
    expect(f.ligne.cle_chiffree).toBeUndefined();
  });

  it('relie la boutique : la clé est enregistrée chiffrée, jamais en clair', async () => {
    const f = faux();
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/relier', { cle: CLE_LS }), env, f.recuperer);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ libelle: 'Detailing Pro' });
    expect(f.ligne.libelle).toBe('Detailing Pro');
    expect(f.ligne.cle_chiffree).toMatch(/^v1:/);
    expect(f.ligne.cle_chiffree).not.toContain(CLE_LS);
  });

  it('synchronise : lit toutes les pages et renvoie les ventes', async () => {
    const f = faux();
    await traiterApi(appel('/api/comptes/lemonsqueezy/relier', { cle: CLE_LS }), env, f.recuperer);
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/synchroniser'), env, f.recuperer);
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { ventes: { numeroCommande: string }[]; synchroniseLe: string };
    expect(corps.ventes.map((v) => v.numeroCommande)).toEqual(['101', '102']);
    expect(f.ligne.derniere_synchro).toBe(corps.synchroniseLe);
    expect(f.ligne.derniere_erreur).toBeNull();
  });

  it('synchroniser sans boutique reliée : message clair', async () => {
    const f = faux();
    const r = await traiterApi(appel('/api/comptes/lemonsqueezy/synchroniser'), env, f.recuperer);
    expect(r.status).toBe(404);
  });

  it('les autres adresses servent les pages de l’appli', async () => {
    const worker = (await import('../src/serveur/worker')).default;
    const r = await worker.fetch(new Request('https://pilotage.test/'), env);
    expect(await r.text()).toBe('page');
  });
});

// ── Stripe ──

import { chargesVersVentes, type ChargeStripe } from '../src/serveur/stripe';

const charge = (id: string, autres: Partial<ChargeStripe> = {}): ChargeStripe => ({
  id,
  amount: 1990,
  amount_refunded: 0,
  currency: 'eur',
  created: Date.parse('2026-10-05T08:15:00Z') / 1000,
  status: 'succeeded',
  paid: true,
  refunded: false,
  livemode: true,
  description: 'Guide detailing',
  balance_transaction: { amount: 1990, fee: 125, net: 1865, currency: 'eur' },
  ...autres,
});

describe('paiements Stripe → ventes', () => {
  it('garde le montant et les vrais frais donnés par Stripe', () => {
    const { ventes } = chargesVersVentes([charge('ch_1')]);
    expect(ventes).toEqual([
      {
        plateforme: 'stripe',
        numeroCommande: 'ch_1',
        instant: '2026-10-05T08:15:00.000Z',
        montantCentimes: 1990,
        fraisCentimes: 125,
        rembourse: false,
        produit: 'Guide detailing',
      },
    ]);
  });

  it('remboursement total, partiel, mode test, frais absents', () => {
    const { ventes } = chargesVersVentes([
      charge('ch_2', { refunded: true, amount_refunded: 1990 }),
      charge('ch_3', { amount: 2990, amount_refunded: 1000 }),
      charge('ch_4', { livemode: false }),
      charge('ch_5', { balance_transaction: 'txn_123' }),
    ]);
    expect(ventes.map((v) => [v.numeroCommande, v.montantCentimes, v.rembourse, v.plateforme, v.fraisCentimes])).toEqual([
      ['ch_2', 1990, true, 'stripe', 125],
      ['ch_3', 1990, false, 'stripe', 125],
      ['ch_4', 1990, false, 'stripe-test', 125],
      ['ch_5', 1990, false, 'stripe', null],
    ]);
  });

  it('écarte les paiements échoués et les autres devises', () => {
    const { ventes, ignorees } = chargesVersVentes([charge('ch_6', { status: 'failed', paid: false }), charge('ch_7', { currency: 'usd' })]);
    expect(ventes).toEqual([]);
    expect(ignorees.map((i) => i.numero)).toEqual(['ch_6', 'ch_7']);
  });
});

function fauxStripe() {
  const ligne: { cle_chiffree?: string; libelle?: string; derniere_synchro?: string | null; derniere_erreur?: string | null } = {};
  const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entree));
    const methode = init?.method ?? 'GET';
    const entetes = new Headers(init?.headers);
    const repondre = (statut: number, corps?: unknown) => new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut });
    if (url.pathname === '/auth/v1/user') return repondre(200, { id: 'u1' });
    if (url.pathname === '/rest/v1/comptes_relies') {
      if (methode === 'POST' || methode === 'PATCH') Object.assign(ligne, JSON.parse(String(init?.body)));
      if (methode === 'GET') return repondre(200, ligne.cle_chiffree ? [{ cle_chiffree: ligne.cle_chiffree }] : []);
      return repondre(201);
    }
    if (url.host === 'api.stripe.com') {
      const cle = entetes.get('Authorization');
      if (cle === 'Bearer rk_test_sans_droits_0123456789') return repondre(403, { error: { type: 'invalid_request_error' } });
      if (cle !== 'Bearer rk_test_bonne_cle_0123456789') return repondre(401, {});
      const apres = url.searchParams.get('starting_after');
      if (!apres) return repondre(200, { data: [charge('ch_a', { livemode: false }), charge('ch_b', { livemode: false })], has_more: true });
      return repondre(200, { data: [charge('ch_c', { livemode: false })], has_more: false });
    }
    return repondre(404, {});
  }) as typeof fetch;
  return { recuperer, ligne };
}

describe('serveur : boutique Stripe', () => {
  it('refuse une clé secrète complète (sk_), sans même l’essayer', async () => {
    const f = fauxStripe();
    const r = await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'sk_test_cle_complete_0123456789' }), env, f.recuperer);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erreur: string }).erreur).toContain('rk_');
    expect(f.ligne.cle_chiffree).toBeUndefined();
  });

  it('dit quelle autorisation manque', async () => {
    const f = fauxStripe();
    const r = await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_sans_droits_0123456789' }), env, f.recuperer);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erreur: string }).erreur).toContain('Lecture');
  });

  it('relie, puis lit toutes les pages de paiements', async () => {
    const f = fauxStripe();
    const relie = await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env, f.recuperer);
    expect(await relie.json()).toEqual({ libelle: 'Stripe (mode test)' });
    expect(f.ligne.cle_chiffree).not.toContain('rk_test');
    const r = await traiterApi(appel('/api/comptes/stripe/synchroniser'), env, f.recuperer);
    const corps = (await r.json()) as { ventes: { numeroCommande: string; plateforme: string }[] };
    expect(corps.ventes.map((v) => v.numeroCommande)).toEqual(['ch_a', 'ch_b', 'ch_c']);
    expect(corps.ventes.every((v) => v.plateforme === 'stripe-test')).toBe(true);
  });

  it('refuse une boutique inconnue', async () => {
    const f = fauxStripe();
    const r = await traiterApi(appel('/api/comptes/inconnue/relier', { cle: 'x'.repeat(30) }), env, f.recuperer);
    expect(r.status).toBe(404);
  });
});
