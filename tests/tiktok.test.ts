import { describe, expect, it } from 'vitest';
import { donneesVides } from '../src/donnees/actions';
import { lireRetourTikTok } from '../src/donnees/comptesRelies';
import { donneesExemple } from '../src/donnees/exemple';
import { appliquerVideos } from '../src/donnees/useSynchroBoutique';
import { dechiffrer } from '../src/serveur/chiffrement';
import { creerEtat, urlAutorisation, verifierEtat, videosVersVideos } from '../src/serveur/tiktok';
import { traiterApi, type Env } from '../src/serveur/worker';

const SECRET = 'secret-de-test-pour-les-cles';

describe('TikTok : le lien d’accord', () => {
  it('l’« état » prouve que le retour vient de la bonne personne, et expire', async () => {
    const maintenant = Date.parse('2026-10-06T02:30:00Z');
    const etat = await creerEtat('u1', 'business-1', SECRET, maintenant);
    // L'état rend le business à relier : le retour de TikTok va dans le bon business.
    expect(await verifierEtat(etat, 'u1', SECRET, maintenant + 60_000)).toBe('business-1');
    expect(await verifierEtat(etat, 'u2', SECRET, maintenant + 60_000)).toBeNull();
    expect(await verifierEtat(etat, 'u1', SECRET, maintenant + 11 * 60_000)).toBeNull();
    expect(await verifierEtat(etat, 'u1', 'autre-secret', maintenant + 60_000)).toBeNull();
    const [contenu, signe] = etat.split('.');
    expect(await verifierEtat(`${contenu}x.${signe}`, 'u1', SECRET, maintenant)).toBeNull();
    expect(await verifierEtat('nimportequoi', 'u1', SECRET, maintenant)).toBeNull();
  });

  it('la page d’accord demande seulement le profil de base et la liste des vidéos', () => {
    const url = new URL(urlAutorisation('cle-client', 'https://pilotage.test/api/tiktok/retour', 'etat-1'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_key: 'cle-client',
      response_type: 'code',
      scope: 'user.info.basic,video.list',
      redirect_uri: 'https://pilotage.test/api/tiktok/retour',
      state: 'etat-1',
    });
  });

  it('l’appli lit le retour de TikTok dans son adresse', () => {
    expect(lireRetourTikTok('?tiktok=retour&code_tiktok=abc&etat=xyz')).toEqual({ code: 'abc', etat: 'xyz' });
    expect(lireRetourTikTok('?tiktok=retour&erreur=access_denied')).toEqual({ erreur: 'access_denied' });
    expect(lireRetourTikTok('?autre=1')).toBeNull();
  });
});

describe('TikTok : vidéos → vidéos de l’appli', () => {
  it('garde la date, le lien et les vues ; une valeur absente reste absente', () => {
    expect(
      videosVersVideos([
        { id: '111', create_time: Date.parse('2026-10-05T18:00:00Z') / 1000, view_count: 1840, share_url: 'https://www.tiktok.com/@x/video/111' },
        { id: '222', create_time: Date.parse('2026-10-04T18:00:00Z') / 1000 },
        { id: '333' },
      ]),
    ).toEqual([
      { id: 'tiktok-111', instant: '2026-10-05T18:00:00.000Z', reseau: 'tiktok', lien: 'https://www.tiktok.com/@x/video/111', vues: 1840 },
      { id: 'tiktok-222', instant: '2026-10-04T18:00:00.000Z', reseau: 'tiktok' },
    ]);
  });

  it('les vidéos lues font disparaître l’exemple, et leurs vues se mettent à jour', () => {
    const exemple = donneesExemple(new Date('2026-10-06T08:00:00Z'));
    const v1 = { id: 'tiktok-1', instant: '2026-10-05T18:00:00.000Z', reseau: 'tiktok' as const, vues: 10 };
    const apres = appliquerVideos(exemple, [v1]);
    expect(apres.exemple).toBe(false);
    expect(apres.videos).toEqual([v1]);
    const plusTard = appliquerVideos(apres, [{ ...v1, vues: 250 }]);
    expect(plusTard.videos).toEqual([{ ...v1, vues: 250 }]);
    // Sans vidéo, rien ne change (l'exemple reste).
    expect(appliquerVideos(exemple, [])).toBe(exemple);
    expect(appliquerVideos(donneesVides(), []).videos).toEqual([]);
  });
});

// ── Le serveur, avec une fausse base et un faux TikTok ──

const env: Env = {
  ASSETS: { fetch: async () => new Response('page') },
  SUPABASE_URL: 'https://base.test',
  SUPABASE_CLE_PUBLIQUE: 'cle-publique',
  CLE_CHIFFREMENT: SECRET,
  TIKTOK_CLIENT_KEY: 'cle-client',
  TIKTOK_CLIENT_SECRET: 'secret-client',
};

const BUSINESS = '0b0e5a4e-1f2c-4d3b-9a8e-123456789abc';

interface Ligne {
  business_id?: string;
  identifiant: string;
  cle_chiffree: string;
  libelle?: string;
  derniere_synchro?: string | null;
  derniere_erreur?: string | null;
}

/** Faux TikTok avec deux comptes possibles : « bon-code » relie le compte 1, « code-2 » le compte 2. */
function fauxTikTok(options: { jetonExpire?: boolean; videosRefusees?: boolean } = {}) {
  const lignes = new Map<string, Ligne>();
  const appels: string[] = [];
  const formulaires: Record<string, string>[] = [];
  let numeroJeton = 0;
  const recuperer = (async (entree: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(entree));
    const methode = init?.method ?? 'GET';
    const entetes = new Headers(init?.headers);
    appels.push(`${methode} ${url.host}${url.pathname}`);
    const repondre = (statut: number, corps?: unknown) => new Response(corps === undefined ? null : JSON.stringify(corps), { status: statut });

    if (url.host === 'base.test' && url.pathname === '/auth/v1/user') return repondre(200, { id: 'u1' });
    if (url.host === 'base.test' && url.pathname === '/rest/v1/comptes_relies') {
      const corps = init?.body ? (JSON.parse(String(init.body)) as Partial<Ligne>) : {};
      if (methode === 'POST') lignes.set(corps.identifiant!, corps as Ligne);
      if (methode === 'PATCH') {
        const identifiant = (url.searchParams.get('identifiant') ?? '').replace(/^eq\./, '');
        Object.assign(lignes.get(identifiant)!, corps);
      }
      if (methode === 'GET') return repondre(200, [...lignes.values()].map((l) => ({ identifiant: l.identifiant, cle_chiffree: l.cle_chiffree })));
      return repondre(201);
    }
    if (url.host === 'open.tiktokapis.com' && url.pathname === '/v2/oauth/token/') {
      const champs = Object.fromEntries(new URLSearchParams(String(init?.body)));
      formulaires.push(champs);
      if (champs.client_secret !== 'secret-client') return repondre(401, { error: 'invalid_client' });
      const compte =
        champs.grant_type === 'authorization_code'
          ? { 'bon-code': '1', 'code-2': '2' }[champs.code!]
          : champs.refresh_token!.split('-')[1];
      if (!compte) return repondre(400, { error: 'invalid_grant' });
      numeroJeton++;
      return repondre(200, {
        access_token: `acces-${compte}-${numeroJeton}`,
        // Le premier jeton expire tout de suite si on le demande, pour tester le renouvellement.
        expires_in: options.jetonExpire && numeroJeton === 1 ? 0 : 86400,
        refresh_token: `renouvellement-${compte}-${numeroJeton}`,
        refresh_expires_in: 31536000,
        open_id: `open-${compte}`,
        scope: 'user.info.basic,video.list',
        token_type: 'Bearer',
      });
    }
    const compte = (entetes.get('Authorization') ?? '').split('-')[1];
    if (url.host === 'open.tiktokapis.com' && url.pathname === '/v2/user/info/') {
      const nom = compte === '1' ? 'Detailing Pro' : 'Second compte';
      return repondre(200, { data: { user: { open_id: `open-${compte}`, display_name: nom } }, error: { code: 'ok' } });
    }
    if (url.host === 'open.tiktokapis.com' && url.pathname === '/v2/video/list/') {
      if (options.videosRefusees) return repondre(401, { error: { code: 'access_token_invalid' } });
      appels.push(`jeton ${entetes.get('Authorization')}`);
      const { cursor } = JSON.parse(String(init?.body)) as { cursor?: number };
      const video = (id: string, jours: number) => ({
        id,
        create_time: Date.parse('2026-10-05T18:00:00Z') / 1000 - jours * 86400,
        view_count: 100 * Number(id),
        share_url: `https://www.tiktok.com/@detailing/video/${id}`,
      });
      if (compte === '2') return repondre(200, { data: { videos: [video('9', 0)], cursor: 1, has_more: false }, error: { code: 'ok' } });
      if (cursor === undefined) return repondre(200, { data: { videos: [video('3', 0), video('2', 1)], cursor: 42, has_more: true }, error: { code: 'ok' } });
      return repondre(200, { data: { videos: [video('1', 2)], cursor: 43, has_more: false }, error: { code: 'ok' } });
    }
    return repondre(404, {});
  }) as typeof fetch;
  return { recuperer, lignes, appels, formulaires };
}

const appel = (chemin: string, corps: Record<string, unknown> = {}) =>
  new Request(`https://pilotage.test${chemin}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer jeton-ok', 'Content-Type': 'application/json' },
    body: JSON.stringify(corps),
  });

async function relier(f: ReturnType<typeof fauxTikTok>, code = 'bon-code') {
  const connexion = await traiterApi(appel('/api/comptes/tiktok/connexion', { business: BUSINESS }), env, f.recuperer);
  const { url } = (await connexion.json()) as { url: string };
  const etat = new URL(url).searchParams.get('state')!;
  // Au retour, l'appli n'envoie que le code et l'état : le business est dans l'état.
  return traiterApi(appel('/api/comptes/tiktok/relier', { code, etat }), env, f.recuperer);
}

describe('serveur : TikTok', () => {
  it('le retour de TikTok renvoie vers l’appli avec le code, sans rien demander d’autre', async () => {
    const f = fauxTikTok();
    const ok = await traiterApi(new Request('https://pilotage.test/api/tiktok/retour?code=abc*1!&state=xyz&scopes=video.list'), env, f.recuperer);
    expect(ok.status).toBe(302);
    expect(Object.fromEntries(new URL(ok.headers.get('Location')!).searchParams)).toEqual({ tiktok: 'retour', code_tiktok: 'abc*1!', etat: 'xyz' });
    const refus = await traiterApi(new Request('https://pilotage.test/api/tiktok/retour?error=access_denied&state=xyz'), env, f.recuperer);
    expect(new URL(refus.headers.get('Location')!).searchParams.get('erreur')).toBe('access_denied');
    expect(f.appels).toEqual([]);
  });

  it('sans le secret TikTok dans Cloudflare : message clair', async () => {
    const f = fauxTikTok();
    const r = await traiterApi(appel('/api/comptes/tiktok/connexion', { business: BUSINESS }), { ...env, TIKTOK_CLIENT_SECRET: undefined }, f.recuperer);
    expect(r.status).toBe(503);
    const { erreur } = (await r.json()) as { erreur: string };
    expect(erreur).toContain('Cloudflare');
    expect(erreur).toMatch(/^Réglage du serveur à faire/);
    expect(erreur).toContain('TIKTOK_CLIENT_SECRET');
  });

  it('relie le compte dans le bon business : les jetons sont enregistrés chiffrés, jamais en clair', async () => {
    const f = fauxTikTok();
    const r = await relier(f);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ libelle: 'Detailing Pro' });
    expect(f.formulaires[0]).toMatchObject({
      client_key: 'cle-client',
      client_secret: 'secret-client',
      code: 'bon-code',
      grant_type: 'authorization_code',
      redirect_uri: 'https://pilotage.test/api/tiktok/retour',
    });
    const ligne = f.lignes.get('open-1')!;
    expect(ligne).toMatchObject({ business_id: BUSINESS, identifiant: 'open-1', libelle: 'Detailing Pro' });
    expect(ligne.cle_chiffree).toMatch(/^v2:/);
    expect(ligne.cle_chiffree).not.toContain('acces-1');
    expect(JSON.parse(await dechiffrer(ligne.cle_chiffree, SECRET, `u1|${BUSINESS}|tiktok|open-1`))).toMatchObject({ openId: 'open-1', acces: 'acces-1-1' });
  });

  it('refuse un lien périmé ou fait pour quelqu’un d’autre', async () => {
    const f = fauxTikTok();
    const autre = await creerEtat('u2', BUSINESS, SECRET);
    const r = await traiterApi(appel('/api/comptes/tiktok/relier', { code: 'bon-code', etat: autre }), env, f.recuperer);
    expect(r.status).toBe(400);
    expect(f.lignes.size).toBe(0);
    expect(f.formulaires).toEqual([]);
  });

  it('synchronise : renouvelle l’accès expiré, puis lit toutes les pages de vidéos', async () => {
    const f = fauxTikTok({ jetonExpire: true });
    await relier(f);
    const r = await traiterApi(appel('/api/comptes/tiktok/synchroniser', { business: BUSINESS }), env, f.recuperer);
    expect(r.status).toBe(200);
    const corps = (await r.json()) as { videos: { id: string; vues?: number }[]; synchroniseLe: string };
    expect(corps.videos.map((v) => [v.id, v.vues])).toEqual([
      ['tiktok-3', 300],
      ['tiktok-2', 200],
      ['tiktok-1', 100],
    ]);
    expect(f.formulaires[1]).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'renouvellement-1-1' });
    expect(f.appels).toContain('jeton Bearer acces-1-2');
    const ligne = f.lignes.get('open-1')!;
    expect(JSON.parse(await dechiffrer(ligne.cle_chiffree, SECRET, `u1|${BUSINESS}|tiktok|open-1`))).toMatchObject({ openId: 'open-1', acces: 'acces-1-2' });
    expect(ligne.derniere_synchro).toBeTruthy();
  });

  it('plusieurs comptes TikTok dans un business : leurs vidéos s’additionnent', async () => {
    const f = fauxTikTok();
    await relier(f, 'bon-code');
    await relier(f, 'code-2');
    expect([...f.lignes.keys()]).toEqual(['open-1', 'open-2']);
    const r = await traiterApi(appel('/api/comptes/tiktok/synchroniser', { business: BUSINESS }), env, f.recuperer);
    const corps = (await r.json()) as { videos: { id: string }[] };
    expect(corps.videos.map((v) => v.id).sort()).toEqual(['tiktok-1', 'tiktok-2', 'tiktok-3', 'tiktok-9']);
  });

  it('accès retiré sur TikTok : message clair, noté sur le compte relié', async () => {
    const f = fauxTikTok({ videosRefusees: true });
    await relier(f);
    const r = await traiterApi(appel('/api/comptes/tiktok/synchroniser', { business: BUSINESS }), env, f.recuperer);
    expect(r.status).toBe(400);
    expect(f.lignes.get('open-1')!.derniere_erreur).toContain('relie-le à nouveau');
  });
});
