import { beforeEach, describe, expect, it, vi } from 'vitest';
import { traiterApi as routeApi, type Env } from '../src/serveur/worker';
import { analyserBusiness, creerLimiteurAssistant } from '../src/serveur/assistant';
let limiter = creerLimiteurAssistant();
beforeEach(() => { limiter = creerLimiteurAssistant(); });
const traiterApi = (requete: Request, environnement: Env, recuperer: typeof fetch) => routeApi(requete, environnement, recuperer, limiter);

const business = '11111111-1111-1111-1111-111111111111';
const env: Env = {
  ASSETS: { fetch: async () => new Response('') },
  SUPABASE_URL: 'https://base.test', SUPABASE_CLE_PUBLIQUE: 'publique',
  IA_URL: 'https://ia.test/v1/chat/completions', IA_MODELE: 'openai/gpt-oss-120b', IA_CLE: 'cle-ia-secrete',
  IA_ACTIVEE: 'oui',
  IA_MODE: 'groq-gratuit', IA_PLAN_VERIFIE: 'free', IA_TRANSFERT_AUTORISE: 'oui', SUPABASE_CLE_SERVEUR: 'secret-serveur',
};
function appel(corps: object = { business, periode: '7j', question: 'priorites' }, connecte = true) {
  return new Request('https://pilotage.test/api/assistant/analyser', {
    method: 'POST', headers: connecte ? { Authorization: 'Bearer session' } : {}, body: JSON.stringify(corps),
  });
}
function faux(options: { possede?: boolean; texte?: unknown; statutIa?: number; ventes?: object[]; couverture?: string; derniereSynchro?: string } = {}) {
  return vi.fn(async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entree));
    const json = (corps: unknown, statut = 200) => new Response(JSON.stringify(corps), { status: statut });
    if (url.pathname === '/auth/v1/user') return json({ id: 'utilisateur' });
    if (url.pathname === '/rest/v1/business') return json(options.possede === false ? [] : [{ id: business }]);
    if (url.pathname === '/rest/v1/ventes') return json(options.ventes ?? [{
      plateforme: 'stripe', instant: new Date().toISOString(), montant_centimes: 1000,
      frais_centimes: null, tva_centimes: null, rembourse: false,
      produit: 'nom-client-secret', numero_commande: 'commande-secrete', email: 'client@secret.fr',
    }]);
    if (url.pathname === '/rest/v1/videos') return json([{ instant: new Date().toISOString(), reseau: 'tiktok', vues: 1234, id: 'video-secrete', lien: 'https://secret.fr' }]);
    if (url.pathname === '/rest/v1/reglages') return json([{ objectif_par_jour: 1, couverture: options.couverture ?? null }]);
    if (url.pathname === '/rest/v1/comptes_relies') return json([{ source: 'stripe', derniere_synchro: options.derniereSynchro ?? null, derniere_erreur: 'secret-interdit', libelle: 'secret-interdit' }]);
    if (url.pathname === '/rest/v1/rpc/reserver_analyse_assistant') return json(true);
    if (url.host === 'api.groq.com') {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer cle-ia-secrete');
      return json({ choices: [{ message: { content: options.texte ?? 'Les frais manquent : vérifie la boutique.' } }] }, options.statutIa ?? 200);
    }
    throw new Error('Adresse inattendue');
  });
}

describe('Assistant distant et données isolées', () => {
  it.each([undefined, 'non', 'true'])('budget zéro sans activation explicite (%s), même avec les clés présentes', async (IA_ACTIVEE) => {
    const recuperer = faux();
    const reponse = await traiterApi(appel(), { ...env, IA_ACTIVEE }, recuperer);
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toMatchObject({ erreur: expect.stringContaining('budget d’appels payants est fixé à zéro') });
    expect(recuperer).toHaveBeenCalledTimes(1);
    expect(recuperer.mock.calls.some(([adresse]) => new URL(String(adresse)).host === 'api.groq.com')).toBe(false);
  });
  it('fonctionne sans secret de chiffrement et ne transmet que des agrégats', async () => {
    const recuperer = faux();
    const reponse = await traiterApi(appel(), env, recuperer);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ texte: 'Les frais manquent : vérifie la boutique.', modele: 'openai/gpt-oss-120b' });
    const ia = recuperer.mock.calls.find(([adresse]) => new URL(String(adresse)).host === 'api.groq.com');
    const texte = String(ia?.[1]?.body);
    expect(texte).toContain('ventesSansFrais');
    expect(texte).toContain('1000');
    for (const interdit of ['nom-client-secret', 'commande-secrete', 'client@secret.fr', 'video-secrete', 'cle-ia-secrete', business, 'utilisateur', 'secret-interdit']) {
      expect(texte).not.toContain(interdit);
    }
    for (const [adresse] of recuperer.mock.calls) {
      const url = new URL(String(adresse));
      if (!url.pathname.startsWith('/rest/') || url.pathname.includes('/rpc/')) continue;
      expect(url.searchParams.get('user_id')).toBe('eq.utilisateur');
      expect(url.searchParams.get(url.pathname.endsWith('/business') ? 'id' : 'business_id')).toBe(`eq.${business}`);
    }
  });

  it('refuse un visiteur avant toute lecture ou dépense IA', async () => {
    const recuperer = faux();
    expect((await traiterApi(appel(undefined, false), env, recuperer)).status).toBe(401);
    expect(recuperer).not.toHaveBeenCalled();
  });

  it('refuse un business non possédé avant de lire les ventes', async () => {
    const recuperer = faux({ possede: false });
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(403);
    expect(recuperer).toHaveBeenCalledTimes(2);
  });

  it.each([{ business, periode: '2ans' }, { business, periode: '7j', question: 'client@secret.fr' }])('refuse une entrée hors contrat', async (corps) => {
    const recuperer = faux();
    expect((await traiterApi(appel(corps), env, recuperer)).status).toBe(400);
    expect(recuperer).toHaveBeenCalledTimes(1);
  });

  it.each([{ IA_MODE: undefined }, { IA_PLAN_VERIFIE: undefined }, { IA_CLE: undefined }, { IA_MODELE: 'interdit' }])('configuration manquante ou non sûre : 503', async (modification) => {
    const recuperer = faux();
    expect((await traiterApi(appel(), { ...env, ...modification }, recuperer)).status).toBe(503);
    expect(recuperer.mock.calls.some(([adresse]) => new URL(String(adresse)).host === 'api.groq.com')).toBe(false);
  });

  it.each([{ texte: { outil: 'payer' } }, { texte: 'x'.repeat(12001) }, { statutIa: 429 }])('sortie IA invalide ou refusée : erreur claire', async (options) => {
    expect((await traiterApi(appel(), env, faux(options))).status).toBe(options.statutIa === 429 ? 429 : 503);
  });

  it('prépare un business sans activité et ne transforme pas les ventes test en chiffre réel', async () => {
    const recuperer = faux({ ventes: [{ plateforme: 'stripe-test', instant: new Date().toISOString(), montant_centimes: 1000, frais_centimes: 0, rembourse: false }] });
    expect((await traiterApi(appel({ business, periode: '7j', question: 'preparation' }), env, recuperer)).status).toBe(200);
    const ia = recuperer.mock.calls.find(([adresse]) => new URL(String(adresse)).host === 'api.groq.com');
    const contenu = JSON.parse(String(ia?.[1]?.body)) as { messages: { content: string }[] };
    const donnees = JSON.parse(contenu.messages[1]!.content) as { sujet: string; donnees: { resume: { commandes: number }; coutsPublicitairesEtAutresDepenses: null } };
    expect(donnees.sujet).toBe('preparation');
    expect(donnees.donnees.resume.commandes).toBe(0);
    expect(donnees.donnees.coutsPublicitairesEtAutresDepenses).toBeNull();
  });

  it('pagine avec ordre stable puis refuse de dépasser le plafond au lieu de fournir un total partiel', async () => {
    const normal = faux();
    const offsets: string[] = [];
    const recuperer: typeof fetch = async (adresse, init) => {
      const url = new URL(String(adresse));
      if (url.pathname === '/rest/v1/ventes') {
        expect(url.searchParams.get('order')).toBe('instant.asc,plateforme.asc,numero_commande.asc');
        offsets.push(url.searchParams.get('offset')!);
        return new Response(JSON.stringify(Array.from({ length: 500 }, () => ({ plateforme: 'stripe', instant: new Date().toISOString(), montant_centimes: 1, frais_centimes: 0, rembourse: false }))));
      }
      return normal(adresse, init);
    };
    const reponse = await traiterApi(appel(), env, recuperer);
    expect(reponse.status).toBe(503);
    expect(await reponse.json()).toMatchObject({ erreur: expect.stringContaining('10 000') });
    expect(offsets).toHaveLength(21);
    expect(offsets.at(-1)).toBe('10000');
    expect(normal.mock.calls.some(([adresse]) => new URL(String(adresse)).host === 'api.groq.com')).toBe(false);
  });

  it('annule l’appel IA quand le délai maximal est dépassé', async () => {
    vi.useFakeTimers();
    try {
      const normal = faux();
      const recuperer: typeof fetch = (adresse, init) => {
        if (new URL(String(adresse)).host !== 'api.groq.com') return normal(adresse, init);
        return new Promise((_fin, refuser) => {
          init?.signal?.addEventListener('abort', () => refuser(new Error('délai dépassé')));
        });
      };
      const analyse = analyserBusiness(env, 'session', 'utilisateur', business, '7j', 'ventes', recuperer);
      const verifier = expect(analyse).rejects.toMatchObject({ statut: 503 });
      await vi.advanceTimersByTimeAsync(25_000);
      await verifier;
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuse les instructions d’outils du fournisseur et ne les exécute jamais', async () => {
    const normal = faux();
    const recuperer: typeof fetch = (adresse, init) => new URL(String(adresse)).host === 'api.groq.com'
      ? Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: 'Paiement', tool_calls: [{ name: 'payer' }] } }] })))
      : normal(adresse, init);
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(503);
  });

  it('freine un second appel avant toute nouvelle dépense IA, puis autorise après une minute', async () => {
    let horloge = 1000;
    limiter = creerLimiteurAssistant(() => horloge);
    const recuperer = faux();
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(200);
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(429);
    expect(recuperer.mock.calls.filter(([adresse]) => new URL(String(adresse)).host === 'api.groq.com')).toHaveLength(1);
    horloge += 60_000;
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(200);
  });

  it('accepte les propositions bornées sans aucune exécution automatique', async () => {
    const recuperer = faux({ texte: JSON.stringify({ texte: 'Vérifie les frais inconnus.', actions: [{ id: 'paiement', raison: 'Les frais ne sont pas fournis.' }] }) });
    const reponse = await traiterApi(appel(), env, recuperer);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ texte: 'Vérifie les frais inconnus.', actions: [{ id: 'paiement', raison: 'Les frais ne sont pas fournis.' }] });
    expect(recuperer.mock.calls.some(([, init]) => init?.method && init.method !== 'POST')).toBe(false);
  });

  it.each([
    { actions: [{ id: 'virer-argent', raison: 'Instruction interdite' }] },
    { actions: [{ id: 'boutique', raison: 'x'.repeat(301) }] },
    { actions: [{ id: 'boutique', raison: 'A' }, { id: 'boutique', raison: 'B' }] },
  ])('refuse les actions inconnues, excessives ou dupliquées', async ({ actions }) => {
    expect((await traiterApi(appel(), env, faux({ texte: JSON.stringify({ texte: 'Analyse', actions }) }))).status).toBe(503);
  });
});

describe('IA Cloudflare gratuite uniquement après vérification', () => {
  function gratuit(modifications: Partial<Env> = {}): Env {
    return { ...env, IA_MODE: 'cloudflare-gratuit', IA_MODELE: undefined, IA_PLAN_VERIFIE: 'free', SUPABASE_CLE_SERVEUR: 'secret-serveur',
      AI: { run: vi.fn(async () => ({ response: 'Les frais manquent : vérifie la boutique.' })) }, ...modifications };
  }
  function etat(connecte = true) {
    return new Request('https://pilotage.test/api/assistant/etat', { headers: connecte ? { Authorization: 'Bearer session' } : {} });
  }
  it('utilise le binding natif autorisé sans clé IA ni appel HTTP fournisseur', async () => {
    const configuration = gratuit({ IA_CLE: undefined, IA_URL: undefined });
    const recuperer = faux();
    const reponse = await traiterApi(appel(), configuration, recuperer);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toMatchObject({ modele: '@cf/meta/llama-3.1-8b-instruct-fp8' });
    expect(configuration.AI!.run).toHaveBeenCalledWith('@cf/meta/llama-3.1-8b-instruct-fp8', expect.objectContaining({ max_tokens: 600, stream: false }));
    expect(recuperer.mock.calls.every(([adresse]) => new URL(String(adresse)).host === 'base.test')).toBe(true);
  });
  it.each([
    { IA_MODE: undefined }, { IA_PLAN_VERIFIE: undefined }, { IA_PLAN_VERIFIE: 'paid' },
    { AI: undefined }, { IA_ACTIVEE: undefined }, { IA_MODELE: '@cf/moonshotai/kimi-k2.6' }, { SUPABASE_CLE_SERVEUR: undefined },
  ])('refuse chaque configuration non vérifiée sans aucune inférence : %j', async (modifications) => {
    const configuration = gratuit(modifications);
    expect((await traiterApi(appel(), configuration, faux())).status).toBe(503);
    if (configuration.AI) expect(configuration.AI.run).not.toHaveBeenCalled();
  });
  it('état authentifié affiche la disponibilité configurée sans exposer les secrets', async () => {
    const recuperer = faux();
    const reponse = await traiterApi(etat(), gratuit(), recuperer);
    expect(reponse.status).toBe(200);
    expect(await reponse.json()).toEqual({ disponible: true, mode: 'cloudflare-gratuit', raison: 'IA Cloudflare gratuite configurée. La disponibilité reste soumise au quota quotidien.' });
    expect(recuperer).toHaveBeenCalledTimes(1);
  });
  it('état refuse le visiteur sans connexion', async () => {
    const recuperer = faux();
    expect((await traiterApi(etat(false), gratuit(), recuperer)).status).toBe(401);
    expect(recuperer).not.toHaveBeenCalled();
  });
  it('quota épuisé : erreur sans fallback payant', async () => {
    const configuration = gratuit({ AI: { run: vi.fn(async () => { throw Object.assign(new Error('quota'), { status: 429, code: 3036 }); }) } });
    const recuperer = faux();
    const reponse = await traiterApi(appel(), configuration, recuperer);
    expect(reponse.status).toBe(429);
    expect(await reponse.json()).toMatchObject({ erreur: expect.stringContaining('quota gratuit') });
    expect(recuperer.mock.calls.every(([adresse]) => new URL(String(adresse)).host === 'base.test')).toBe(true);
  });

  it.each([false, 'echec'])('sans réservation durable validée (%s), aucune inférence', async (resultat) => {
    const configuration = gratuit();
    const normal = faux();
    const recuperer: typeof fetch = (adresse, init) => {
      if (String(adresse).includes('/rpc/reserver_analyse_assistant')) {
        expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret-serveur');
        expect(JSON.parse(String(init?.body))).toMatchObject({ p_user_id: 'utilisateur', p_business_id: business });
        return Promise.resolve(resultat === false ? new Response('false') : new Response('{}', { status: 500 }));
      }
      return normal(adresse, init);
    };
    expect((await traiterApi(appel(), configuration, recuperer)).status).toBe(resultat === false ? 429 : 503);
    expect(configuration.AI!.run).not.toHaveBeenCalled();
  });

  it('une empreinte inchangée saute la réservation et l’IA, même dans une tâche de fond', async () => {
    const configuration = gratuit();
    const recuperer = faux();
    const maintenant = new Date();
    const premiere = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', recuperer, maintenant, () => true);
    const seconde = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', recuperer, maintenant, () => true, premiere.empreinte);
    expect(premiere.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(seconde).toMatchObject({ inchange: true, texte: '', actions: [], empreinte: premiere.empreinte });
    expect(configuration.AI!.run).toHaveBeenCalledTimes(1);
    expect(recuperer.mock.calls.filter(([adresse]) => String(adresse).includes('/rpc/reserver_analyse_assistant'))).toHaveLength(1);
  });

  it('les instructions d’outils et sorties excessives du binding sont refusées', async () => {
    const configuration = gratuit({ AI: { run: vi.fn(async () => ({ response: 'Analyse', tool_calls: [{ name: 'payer' }] })) } });
    expect((await traiterApi(appel(), configuration, faux())).status).toBe(503);
  });

  it('une nouvelle synchro et couverture de même fraîcheur ne consomment pas un nouvel appel', async () => {
    const configuration = gratuit();
    const maintenant = new Date();
    const ilYATroisHeures = new Date(maintenant.getTime() - 3 * 60 * 60_000).toISOString();
    const ilYAUneHeure = new Date(maintenant.getTime() - 60 * 60_000).toISOString();
    const premierFetch = faux({ couverture: ilYATroisHeures, derniereSynchro: ilYATroisHeures });
    const secondFetch = faux({ couverture: ilYAUneHeure, derniereSynchro: ilYAUneHeure });
    const premiere = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', premierFetch, maintenant, () => true);
    const seconde = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', secondFetch, maintenant, () => true, premiere.empreinte);
    expect(seconde).toMatchObject({ inchange: true, empreinte: premiere.empreinte });
    expect(configuration.AI!.run).toHaveBeenCalledTimes(1);
    expect(secondFetch.mock.calls.some(([adresse]) => String(adresse).includes('/rpc/reserver_analyse_assistant'))).toBe(false);
  });

  it('le passage de données récentes à anciennes conserve un signal utile et relance l’analyse', async () => {
    const configuration = gratuit();
    const maintenant = new Date();
    const ilYATroisHeures = new Date(maintenant.getTime() - 3 * 60 * 60_000).toISOString();
    const ilYATroisJours = new Date(maintenant.getTime() - 72 * 60 * 60_000).toISOString();
    const premiere = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', faux({ couverture: ilYATroisHeures, derniereSynchro: ilYATroisHeures }), maintenant, () => true);
    const seconde = await analyserBusiness(configuration, 'session', 'utilisateur', business, '7j', 'priorites', faux({ couverture: ilYATroisJours, derniereSynchro: ilYATroisJours }), maintenant, () => true, premiere.empreinte);
    expect(seconde.inchange).toBeUndefined();
    expect(seconde.empreinte).not.toBe(premiere.empreinte);
    expect(configuration.AI!.run).toHaveBeenCalledTimes(2);
  });
});

describe('Groq gratuit proposé sans activation implicite', () => {
  it.each([{ IA_TRANSFERT_AUTORISE: undefined }, { IA_PLAN_VERIFIE: 'paid' }, { IA_CLE: undefined }, { IA_MODE: 'distant' }])('refuse les réglages manquants et le mode payant historique : %j', async (modifications) => {
    const recuperer = faux();
    expect((await traiterApi(appel(), { ...env, ...modifications }, recuperer)).status).toBe(503);
    expect(recuperer).toHaveBeenCalledTimes(1);
  });

  it('force l’URL et le modèle autorisés, même si une ancienne URL serveur existe', async () => {
    const recuperer = faux();
    expect((await traiterApi(appel(), { ...env, IA_URL: 'https://site-interdit.test/voler-cle' }, recuperer)).status).toBe(200);
    const fournisseur = recuperer.mock.calls.find(([adresse]) => new URL(String(adresse)).host === 'api.groq.com');
    expect(String(fournisseur?.[0])).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(String(fournisseur?.[1]?.body))).toMatchObject({ model: 'openai/gpt-oss-120b', max_tokens: 600 });
    expect(recuperer.mock.calls.some(([adresse]) => new URL(String(adresse)).host === 'site-interdit.test')).toBe(false);
  });

  it('un quota partagé refusé bloque Groq avant l’envoi d’agrégats', async () => {
    const normal = faux();
    const recuperer: typeof fetch = (adresse, init) => String(adresse).includes('/rpc/reserver_analyse_assistant')
      ? Promise.resolve(new Response('false')) : normal(adresse, init);
    expect((await traiterApi(appel(), env, recuperer)).status).toBe(429);
    expect(normal.mock.calls.some(([adresse]) => new URL(String(adresse)).host === 'api.groq.com')).toBe(false);
  });

  it('état annonce seulement le mode Groq configuré et reste authentifié', async () => {
    const reponse = await traiterApi(new Request('https://pilotage.test/api/assistant/etat', { headers: { Authorization: 'Bearer session' } }), env, faux());
    expect(await reponse.json()).toMatchObject({ disponible: true, mode: 'groq-gratuit' });
  });
});
