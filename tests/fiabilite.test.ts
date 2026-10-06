import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { calculerEnsemble } from '../src/calculs/ensemble';
import { creerBusiness } from '../src/donnees/business';
import { versDonnees } from '../src/donnees/depot';
import { chargesVersVentes, type ChargeStripe } from '../src/serveur/stripe';
import { dechiffrer } from '../src/serveur/chiffrement';
import { traiterApi, type Env } from '../src/serveur/worker';
import { instantParis } from '../src/temps';
import type { Vente } from '../src/ventes/modele';

// ── B1 : un nouveau business dont les réglages n'ont pas pu être écrits montre l'exemple ──
describe('B1 creerBusiness', () => {
  it('ne doit pas réussir en silence si les réglages « exemple terminé » ne sont pas écrits', async () => {
    const ecrits: string[] = [];
    const faux = {
      from(table: string) {
        if (table === 'business') {
          return {
            insert: () => ({
              select: () => ({ single: async () => ({ data: { id: 'b2', nom: 'Deuxième' }, error: null }) }),
            }),
          };
        }
        // reglages : la base refuse (coupure, règle de sécurité…)
        return {
          upsert: async () => {
            ecrits.push(table);
            return { data: null, error: { message: 'network error' } };
          },
        };
      },
    } as unknown as SupabaseClient;

    // Aujourd'hui : la création « réussit »…
    const promesse = creerBusiness(faux, 'u1', 'Deuxième', false);
    // … et le business n'a pas de réglages : l'appli lui montre les données d'exemple.
    const affiche = versDonnees({ ventes: [], videos: [], etatsAlertes: {}, reglages: null }, new Date('2026-10-06T10:00:00Z'));
    expect(affiche.exemple).toBe(true);
    await expect(promesse).rejects.toThrow();
  });
});

// ── B2 : TikTok injoignable avec deux comptes : le serveur répond « tout va bien » ──
const SECRET = 'un-long-secret-de-test-pour-le-chiffrement-0123456789';
const env: Env = {
  ASSETS: { fetch: async () => new Response('page') },
  SUPABASE_URL: 'https://base.test',
  SUPABASE_CLE_PUBLIQUE: 'cle-publique',
  CLE_CHIFFREMENT: SECRET,
  TIKTOK_CLIENT_KEY: 'cle-client',
  TIKTOK_CLIENT_SECRET: 'secret-client',
};
const BUSINESS = '0b0e5a4e-1f2c-4d3b-9a8e-123456789abc';
const appel = (chemin: string, corps: Record<string, unknown> = {}) =>
  new Request(`https://pilotage.test${chemin}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer jeton-ok', 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

function fauxTikTok(options: { tiktokEnPanne?: () => boolean; patchEnPanne?: () => boolean; expireTout?: boolean } = {}) {
  const lignes = new Map<string, { identifiant: string; cle_chiffree: string; derniere_erreur?: string | null }>();
  let n = 0;
  const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entree));
    const methode = init?.method ?? 'GET';
    const repondre = (statut: number, corps?: unknown) => new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut });
    if (url.host === 'base.test' && url.pathname === '/auth/v1/user') return repondre(200, { id: 'u1' });
    if (url.host === 'base.test' && url.pathname === '/rest/v1/comptes_relies') {
      const corps = init?.body ? JSON.parse(String(init.body)) : {};
      if (methode === 'POST') lignes.set(corps.identifiant, corps);
      if (methode === 'PATCH') {
        if (options.patchEnPanne?.()) return repondre(503, { message: 'indisponible' });
        const id = (url.searchParams.get('identifiant') ?? '').replace(/^eq\./, '');
        Object.assign(lignes.get(id)!, corps);
      }
      if (methode === 'GET') return repondre(200, [...lignes.values()].map((l) => ({ identifiant: l.identifiant, cle_chiffree: l.cle_chiffree })));
      return repondre(201);
    }
    if (url.host === 'open.tiktokapis.com') {
      if (options.tiktokEnPanne?.()) throw new TypeError('fetch failed');
      if (url.pathname === '/v2/oauth/token/') {
        const champs = Object.fromEntries(new URLSearchParams(String(init?.body)));
        const compte = champs.grant_type === 'authorization_code' ? { a: '1', b: '2' }[champs.code!] : champs.refresh_token!.split('-')[1];
        n++;
        return repondre(200, {
          access_token: `acces-${compte}-${n}`,
          expires_in: options.expireTout ? 0 : 86400,
          refresh_token: `renouvellement-${compte}-${n}`,
          refresh_expires_in: 31536000,
          open_id: `open-${compte}`,
          scope: 'user.info.basic,video.list',
        });
      }
      if (url.pathname === '/v2/user/info/') return repondre(200, { data: { user: { display_name: 'Compte' } }, error: { code: 'ok' } });
      if (url.pathname === '/v2/video/list/') return repondre(200, { data: { videos: [], has_more: false }, error: { code: 'ok' } });
    }
    return repondre(404, {});
  }) as typeof fetch;
  return { recuperer, lignes };
}

async function relier(f: ReturnType<typeof fauxTikTok>, code: string) {
  const c = await traiterApi(appel('/api/comptes/tiktok/connexion', { business: BUSINESS }), env, f.recuperer);
  const etat = new URL(((await c.json()) as { url: string }).url).searchParams.get('state')!;
  return traiterApi(appel('/api/comptes/tiktok/relier', { code, etat }), env, f.recuperer);
}

describe('B2 TikTok injoignable avec deux comptes reliés', () => {
  it('doit dire que TikTok ne répond pas (pas 200 « à jour »)', async () => {
    let panne = false;
    const f = fauxTikTok({ tiktokEnPanne: () => panne });
    expect((await relier(f, 'a')).status).toBe(200);
    expect((await relier(f, 'b')).status).toBe(200);
    panne = true;
    const r = await traiterApi(appel('/api/comptes/tiktok/synchroniser', { business: BUSINESS }), env, f.recuperer);
    expect(r.status).toBe(502);
  });
});

describe('B2bis jetons TikTok renouvelés mais pas enregistrés', () => {
  it('signale l’échec au lieu de répondre 200 en gardant l’ancien jeton', async () => {
    let patchKo = false;
    const f = fauxTikTok({ patchEnPanne: () => patchKo, expireTout: true });
    await relier(f, 'a');
    patchKo = true;
    const r = await traiterApi(appel('/api/comptes/tiktok/synchroniser', { business: BUSINESS }), env, f.recuperer);
    const garde = JSON.parse(await dechiffrer(f.lignes.get('open-1')!.cle_chiffree, SECRET, `u1|${BUSINESS}|tiktok|open-1`));
    // Le nouveau jeton de renouvellement est perdu : la base garde le premier.
    expect(garde.renouvellement).toBe('renouvellement-1-1');
    expect(r.status).not.toBe(200);
  });
});

// ── B3 : passage à l'heure d'hiver (25/10/2026) : « J'ai publié » refuse l'heure actuelle ──
describe('B3 instantParis pendant l’heure répétée', () => {
  it('02:30 lu à 02:30 (heure d’été, première fois) ne doit pas être dans le futur', () => {
    const maintenant = new Date('2026-10-25T00:30:00Z'); // 02:30 à Paris, heure d'été
    const instant = instantParis('2026-10-25', '02:30');
    // SaisieVideo refuse si instant > maintenant + 5 min : « Cette date est dans le futur. »
    expect(instant.getTime()).toBeLessThanOrEqual(maintenant.getTime() + 5 * 60_000);
  });
});

// ── B4 : vue d'ensemble : même compte Stripe / TikTok relié dans deux business → total compté deux fois ──
const venteStripe: Vente = {
  plateforme: 'stripe',
  numeroCommande: 'ch_1',
  instant: '2026-10-05T10:00:00.000Z',
  montantCentimes: 1990,
  fraisCentimes: 60,
  rembourse: false,
  produit: 'Guide',
};
describe('B4 vue d’ensemble et doublons entre business', () => {
  it('une même vente Stripe et une même vidéo TikTok ne comptent qu’une fois dans le total', () => {
    const video = { id: 'tiktok-9', instant: '2026-10-05T08:00:00.000Z', reseau: 'tiktok' as const };
    const e = calculerEnsemble(
      [
        { id: 'a', nom: 'A', ventes: [venteStripe], videos: [video] },
        { id: 'b', nom: 'B', ventes: [venteStripe], videos: [video] },
      ],
      '7j',
      new Date('2026-10-06T10:00:00Z'),
    );
    expect(e.total.ventesCentimes).toBe(1990);
    expect(e.total.videos).toBe(1);
  });
});

// ── B5 : vue d'ensemble : un business sans boutique (vidéos seulement) affiche 0,00 € de ventes et de gains ──
describe('B5 vue d’ensemble : ventes inconnues montrées comme 0 €', () => {
  it('business avec vidéos mais sans aucune vente lue : ventes et gains inconnus, pas 0', () => {
    const e = calculerEnsemble(
      [
        { id: 'a', nom: 'TikTok seulement', couverture: null, ventes: [], videos: [{ id: 'v', instant: '2026-10-05T08:00:00.000Z', reseau: 'tiktok' }] },
        { id: 'b', nom: 'Boutique lue, rien vendu', couverture: '2026-10-06T09:00:00.000Z', ventes: [], videos: [] },
      ],
      '7j',
      new Date('2026-10-06T10:00:00Z'),
    );
    expect(e.lignes[0]!.vide).toBe(false);
    // VueEnsemble affiche « — » (et pas « 0,00 € ») quand aucune vente n'a jamais été lue.
    expect(e.lignes[0]!.ventesInconnues).toBe(true);
    expect(e.lignes[1]!.ventesInconnues).toBe(false); // boutique lue : 0 € est un vrai zéro
  });
});

// ── B6 : vente dans une autre devise : écartée sans que l'appli le dise ──
describe('B6 ventes écartées', () => {
  it('le serveur écarte la vente en dollars et renvoie la raison…', () => {
    const c: ChargeStripe = {
      id: 'ch_usd',
      amount: 2500,
      amount_refunded: 0,
      currency: 'usd',
      created: 1_791_000_000,
      status: 'succeeded',
      paid: true,
      refunded: false,
      livemode: true,
      description: 'Guide',
      balance_transaction: null,
    };
    const r = chargesVersVentes([c]);
    expect(r.ventes).toEqual([]);
    expect(r.ignorees[0]!.raison).toContain('euros');
    // … mais useSynchroBoutique n'utilise que r.ventes et r.synchroniseLe : r.ignorees n'est affiché nulle part.
  });
});

// ── B7 : Managed Payments, vente sans TVA (client hors UE, entreprise…) : frais « connus » mais incomplets ──
describe('B7 Stripe Managed Payments sans TVA retenue', () => {
  it('les frais restent inconnus pour tout le compte dès qu’il est en Managed Payments', () => {
    const base = { amount_refunded: 0, currency: 'eur', created: 1_791_000_000, status: 'succeeded', paid: true, refunded: false, livemode: true, description: 'Guide' };
    const avecTva: ChargeStripe = {
      ...base, id: 'ch_fr', amount: 2099,
      balance_transaction: { amount: 2099, fee: 165, net: 1934, currency: 'eur', fee_details: [{ type: 'withheld_tax', amount: 109 }, { type: 'stripe_fee', amount: 56 }] },
    };
    // Même boutique, client sans TVA : Stripe ne retient rien, seuls les frais de paiement sont dans ce paiement.
    const sansTva: ChargeStripe = {
      ...base, id: 'ch_us', amount: 1990,
      balance_transaction: { amount: 1990, fee: 56, net: 1934, currency: 'eur', fee_details: [{ type: 'stripe_fee', amount: 56 }] },
    };
    const { ventes } = chargesVersVentes([avecTva, sansTva]);
    expect(ventes.find((v) => v.numeroCommande === 'ch_fr')!.fraisCentimes).toBeNull();
    expect(ventes.find((v) => v.numeroCommande === 'ch_us')!.fraisCentimes).toBeNull();
  });
});

// ── B8 : Lemon Squeezy, une clé pour deux boutiques : même numéro de commande → une vente écrase l'autre ──
import { commandesVersVentes } from '../src/serveur/lemonsqueezy';
import { fusionnerVentes } from '../src/ventes/lire';
describe('B8 Lemon Squeezy, deux boutiques', () => {
  it('deux commandes n°1 de deux boutiques restent deux ventes', () => {
    const c = (id: string, store: number) => ({
      id,
      attributes: { store_id: store, order_number: 1, currency: 'EUR', total: 1990, status: 'paid', created_at: '2026-10-05T08:00:00Z' } as never,
    });
    const { ventes } = commandesVersVentes([c('9001', 11), c('9002', 22)]);
    expect(fusionnerVentes([], ventes).ventes).toHaveLength(2);
  });
});

// ── S1 (forme testable) : un compte relié en erreur n'empêche pas les autres ──
import { lireComptesRelies } from '../src/donnees/useSynchroBoutique';
import { donneesVides } from '../src/donnees/actions';
import type { Donnees } from '../src/modele';
describe('S1 lireComptesRelies', () => {
  it('Stripe refuse sa clé : les vidéos TikTok arrivent quand même, et le message de Stripe est gardé', async () => {
    let d: Donnees = donneesVides();
    const liste = [
      { source: 'stripe' as const, identifiant: '', libelle: 'Stripe', relieLe: '', derniereSynchro: null, derniereErreur: null },
      { source: 'tiktok' as const, identifiant: 'open-1', libelle: 'Detailing Pro', relieLe: '', derniereSynchro: null, derniereErreur: null },
    ];
    const bilan = await lireComptesRelies(
      'b1',
      liste,
      {
        boutique: async () => {
          throw new Error('Stripe refuse la clé enregistrée.');
        },
        tiktok: async () => ({ videos: [{ id: 'tiktok-1', instant: '2026-10-05T18:00:00.000Z', reseau: 'tiktok' as const }] }),
      },
      (f) => (d = f(d)),
    );
    expect(d.videos.map((v) => v.id)).toEqual(['tiktok-1']);
    expect(bilan.erreurs).toEqual(['Stripe refuse la clé enregistrée.']);
  });

  it('garde les ventes écartées à signaler (autre devise), pas les paiements non aboutis', async () => {
    let d: Donnees = donneesVides();
    const bilan = await lireComptesRelies(
      'b1',
      [{ source: 'stripe', identifiant: '', libelle: 'Stripe', relieLe: '', derniereSynchro: null, derniereErreur: null }],
      {
        boutique: async () => ({
          ventes: [],
          ignorees: [
            { numero: 'ch_1', raison: 'paiement non abouti' },
            { numero: 'ch_2', raison: 'devise usd : seules les ventes en euros sont lues' },
          ],
          synchroniseLe: '2026-10-06T08:00:00.000Z',
        }),
        tiktok: async () => ({ videos: [] }),
      },
      (f) => (d = f(d)),
    );
    expect(bilan.ignorees.map((i) => i.numero)).toEqual(['ch_2']);
  });
});

// ── B9 : en ligne, l'exemple gardé sur l'appareil n'est jamais refait : au bout de quelques jours il est vide ──
import { donneesExemple } from '../src/donnees/exemple';
import { calculerResume } from '../src/calculs/resume';
import { calculerAlertes } from '../src/alertes/alertes';
describe('B9 exemple figé', () => {
  it('l’exemple du 6/10 relu le 20/10 ne montre plus de vente sur 7 jours ni de voyant vidéo', () => {
    const premierJour = new Date('2026-10-06T08:00:00Z');
    const plusTard = new Date('2026-10-20T08:00:00Z');
    const garde = donneesExemple(premierJour); // ce que useDonnees.recharger garde (« d = actuelles.current »)
    const frais = donneesExemple(plusTard); // ce que versDonnees vient de calculer, et qui est jeté
    expect(calculerResume(frais.ventes, '7j', plusTard).commandes).toBeGreaterThan(0);
    expect(calculerResume(garde.ventes, '7j', plusTard).commandes).toBe(0);
    expect(calculerAlertes({ ...garde, maintenant: plusTard }).filter((a) => a.type === 'video')).toEqual([]);
  });
});

import { exempleAAfficher } from '../src/donnees/depot';
describe('B9 (forme testable) exempleAAfficher', () => {
  it('garde l’exemple du jour (avec ses essais), refait celui d’un autre jour', () => {
    const premierJour = new Date('2026-10-06T08:00:00Z');
    const plusTard = new Date('2026-10-20T08:00:00Z');
    const vieux = donneesExemple(premierJour);
    const frais = donneesExemple(plusTard);
    expect(exempleAAfficher(vieux, frais, plusTard)).toBe(frais);
    const duJour = { ...donneesExemple(plusTard), ventes: [] };
    expect(exempleAAfficher(duJour, frais, plusTard).ventes).toEqual([]);
  });
});
