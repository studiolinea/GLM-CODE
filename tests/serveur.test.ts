import { describe, expect, it, vi } from 'vitest';
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

import { chargesVersVentes, transactionsVersMouvements, type ChargeStripe } from '../src/serveur/stripe';

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

  it('mouvements d’argent : garde seulement ce qui sert à vérifier les frais et la TVA', () => {
    const brut = {
      type: 'charge',
      reporting_category: 'charge',
      created: Date.parse('2026-10-05T22:40:00Z') / 1000,
      amount: 1990,
      fee: 125,
      net: 1865,
      currency: 'EUR',
      description: null,
      source: { id: 'ch_1', billing_details: { name: 'Client' } },
      fee_details: [{ type: 'stripe_fee', amount: 125, description: 'Stripe processing fees' }],
      autre_champ: 'pas gardé',
    };
    expect(transactionsVersMouvements([brut])).toEqual([
      {
        instant: '2026-10-05T22:40:00.000Z',
        type: 'charge',
        categorie: 'charge',
        montantCentimes: 1990,
        fraisCentimes: 125,
        netCentimes: 1865,
        devise: 'eur',
        description: null,
        origine: 'ch_1',
        detailFrais: [{ type: 'stripe_fee', montantCentimes: 125, description: 'Stripe processing fees' }],
      },
    ]);
  });

  it('mouvements d’argent : un nombre absent reste inconnu, jamais 0', () => {
    const [m] = transactionsVersMouvements([{ type: 'stripe_fee' }]);
    expect([m!.instant, m!.montantCentimes, m!.fraisCentimes, m!.netCentimes, m!.origine]).toEqual([null, null, null, null, null]);
  });

  it('Managed Payments : la TVA retenue par Stripe n’est ni une vente ni un frais', () => {
    // Le vrai paiement test du 6 octobre : 19,90 € + 1,09 € de TVA (5,5 %), frais de paiement 0,56 €.
    const solde = {
      amount: 2099,
      fee: 165,
      net: 1934,
      currency: 'eur',
      fee_details: [
        { type: 'withheld_tax', amount: 109 },
        { type: 'stripe_fee', amount: 56 },
      ],
    };
    const { ventes } = chargesVersVentes([
      charge('ch_mp', { amount: 2099, balance_transaction: solde }),
      charge('ch_mp_rembourse', { amount: 2099, refunded: true, amount_refunded: 2099, balance_transaction: solde }),
      charge('ch_mp_moitie', { amount: 2099, amount_refunded: 1050, balance_transaction: solde }),
    ]);
    expect(ventes.map((v) => [v.numeroCommande, v.montantCentimes, v.fraisCentimes, v.tvaCentimes])).toEqual([
      ['ch_mp', 1990, null, 109],
      ['ch_mp_rembourse', 1990, null, 109],
      ['ch_mp_moitie', 995, null, 54],
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
      if (url.pathname === '/v1/balance_transactions') {
        return repondre(200, {
          data: [
            { id: 'txn_1', type: 'charge', reporting_category: 'charge', created: 1759700000, amount: 1990, fee: 125, net: 1865,
              currency: 'eur', description: null, source: 'ch_a', status: 'pending',
              fee_details: [{ amount: 125, currency: 'eur', description: 'Stripe processing fees', type: 'stripe_fee', application: null }] },
            { id: 'txn_2', type: 'stripe_fee', reporting_category: 'fee', created: 1759700100, amount: -70, fee: 0, net: -70,
              currency: 'eur', description: 'Frais', source: null, fee_details: [] },
          ],
        });
      }
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

  it('montre les derniers mouvements d’argent de la boutique, sans rien enregistrer', async () => {
    const f = fauxStripe();
    await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env, f.recuperer);
    const avant = { ...f.ligne };
    const r = await traiterApi(appel('/api/comptes/stripe/mouvements'), env, f.recuperer);
    expect(r.status).toBe(200);
    const { mouvements } = (await r.json()) as { mouvements: { type: string; netCentimes: number; origine: string | null }[] };
    expect(mouvements.map((m) => [m.type, m.netCentimes, m.origine])).toEqual([
      ['charge', 1865, 'ch_a'],
      ['stripe_fee', -70, null],
    ]);
    expect(f.ligne).toEqual(avant);
  });

  it('mouvements : boutique pas reliée, autorisation manquante, boutique qui ne sait pas les montrer', async () => {
    const f = fauxStripe();
    const sansBoutique = await traiterApi(appel('/api/comptes/stripe/mouvements'), env, f.recuperer);
    expect(sansBoutique.status).toBe(404);
    expect(((await sansBoutique.json()) as { erreur: string }).erreur).toContain('Aucun compte Stripe');

    await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env, f.recuperer);
    const sansDroits = (async (entree: RequestInfo | URL, init?: RequestInit) =>
      new URL(String(entree)).pathname === '/v1/balance_transactions'
        ? new Response('{}', { status: 403 })
        : f.recuperer(entree, init)) as typeof fetch;
    const r = await traiterApi(appel('/api/comptes/stripe/mouvements'), env, sansDroits);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erreur: string }).erreur).toContain('Balance');

    const ls = await traiterApi(appel('/api/comptes/lemonsqueezy/mouvements'), env, faux().recuperer);
    expect(ls.status).toBe(404);
  });

  it('marche dans le vrai serveur : fetch est toujours appelé seul, comme l’exige Cloudflare', async () => {
    const f = fauxStripe();
    // Comme sur Cloudflare : fetch appelé depuis un autre objet (objet.fetch(…)) lève « Illegal invocation ».
    vi.stubGlobal('fetch', function (this: unknown, entree: RequestInfo | URL, init?: RequestInit) {
      if (this !== undefined && this !== globalThis) throw new TypeError('Illegal invocation');
      return f.recuperer(entree, init);
    });
    try {
      const worker = (await import('../src/serveur/worker')).default;
      const r = await worker.fetch(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env);
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ libelle: 'Stripe (mode test)' });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('base pas à jour (Stripe pas encore permis) : dit quel texte SQL lancer', async () => {
    const f = fauxStripe();
    const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(entree)).pathname === '/rest/v1/comptes_relies' && init?.method === 'POST') {
        return new Response(JSON.stringify({ code: '23514', message: 'violates check constraint "comptes_relies_source_check"' }), { status: 400 });
      }
      return f.recuperer(entree, init);
    }) as typeof fetch;
    const r = await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env, recuperer);
    expect(r.status).toBe(502);
    expect(((await r.json()) as { erreur: string }).erreur).toContain('03-boutique-stripe.sql');
  });

  it('une panne pendant l’enregistrement donne un message clair, sans faire tomber le serveur', async () => {
    const f = fauxStripe();
    const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
      if (new URL(String(entree)).pathname === '/rest/v1/comptes_relies') throw new TypeError('fetch failed');
      return f.recuperer(entree, init);
    }) as typeof fetch;
    const journal = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const r = await traiterApi(appel('/api/comptes/stripe/relier', { cle: 'rk_test_bonne_cle_0123456789' }), env, recuperer);
      expect(r.status).toBe(500);
      expect(((await r.json()) as { erreur: string }).erreur).toContain('Réessaie');
      expect(journal).toHaveBeenCalled();
    } finally {
      journal.mockRestore();
    }
  });
});
