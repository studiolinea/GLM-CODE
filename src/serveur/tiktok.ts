// Lecture des vidéos d'un compte TikTok (Login Kit + Display API), avec l'accord de son propriétaire.
// Pilotage ne fait que lire : la liste des vidéos publiques, leur date, leur lien et leurs vues.

import type { Video } from '../modele';
import { CleRefusee, DroitsInsuffisants, type Recuperateur } from './commun';

const AUTORISATION = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
export const AUTORISATIONS = 'user.info.basic,video.list';
const PAR_PAGE = 20;
const PAGES_MAX = 10;
/** Le lien d'autorisation reste valable 10 minutes. */
const DUREE_ETAT_MS = 10 * 60_000;

export interface ClesTikTok {
  clientKey: string;
  clientSecret: string;
}

/** Ce que le serveur garde, chiffré, pour lire les vidéos sans redemander l'accord. */
export interface JetonsTikTok {
  acces: string;
  renouvellement: string;
  /** Instants ISO de fin de validité. */
  accesExpire: string;
  renouvellementExpire: string;
}

// ── L'« état » : prouve que le retour de TikTok vient bien d'une demande de cette personne ──

const encodeur = new TextEncoder();

function base64url(octets: Uint8Array): string {
  let texte = '';
  for (const o of octets) texte += String.fromCharCode(o);
  return btoa(texte).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function signature(contenu: string, secret: string): Promise<string> {
  const cle = await crypto.subtle.importKey(
    'raw',
    encodeur.encode(`etat-tiktok:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return base64url(new Uint8Array(await crypto.subtle.sign('HMAC', cle, encodeur.encode(contenu))));
}

export async function creerEtat(userId: string, secret: string, maintenant = Date.now()): Promise<string> {
  const contenu = base64url(encodeur.encode(JSON.stringify({ u: userId, e: maintenant + DUREE_ETAT_MS })));
  return `${contenu}.${await signature(contenu, secret)}`;
}

/** Vrai si l'état est intact, pas expiré, et fait pour cette personne. */
export async function verifierEtat(etat: string, userId: string, secret: string, maintenant = Date.now()): Promise<boolean> {
  const [contenu, signe] = etat.split('.');
  if (!contenu || !signe || signe !== (await signature(contenu, secret))) return false;
  try {
    const brut = atob(contenu.replace(/-/g, '+').replace(/_/g, '/'));
    const { u, e } = JSON.parse(brut) as { u?: unknown; e?: unknown };
    return u === userId && typeof e === 'number' && e > maintenant;
  } catch {
    return false;
  }
}

export function urlAutorisation(clientKey: string, adresseRetour: string, etat: string): string {
  const parametres = new URLSearchParams({
    client_key: clientKey,
    response_type: 'code',
    scope: AUTORISATIONS,
    redirect_uri: adresseRetour,
    state: etat,
  });
  return `${AUTORISATION}?${parametres}`;
}

// ── Les jetons d'accès ──

interface ReponseJetons {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function demanderJetons(champs: Record<string, string>, recuperer: Recuperateur, maintenant: number): Promise<JetonsTikTok> {
  const reponse = await recuperer(`${API}/oauth/token/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache' },
    body: new URLSearchParams(champs).toString(),
  });
  const corps = (await reponse.json().catch(() => ({}))) as ReponseJetons;
  if (corps.error === 'invalid_grant' || corps.error === 'invalid_request' || reponse.status === 401) {
    throw new CleRefusee(`TikTok refuse : ${corps.error ?? reponse.status}`);
  }
  if (!reponse.ok || corps.error || !corps.access_token || !corps.refresh_token) {
    throw new Error(`TikTok a répondu ${reponse.status} ${corps.error ?? ''}`);
  }
  if (corps.scope !== undefined && !corps.scope.split(',').includes('video.list')) {
    throw new DroitsInsuffisants('Accès aux vidéos refusé');
  }
  return {
    acces: corps.access_token,
    renouvellement: corps.refresh_token,
    accesExpire: new Date(maintenant + (corps.expires_in ?? 0) * 1000).toISOString(),
    renouvellementExpire: new Date(maintenant + (corps.refresh_expires_in ?? 0) * 1000).toISOString(),
  };
}

/** Échange le code reçu au retour de TikTok contre des jetons d'accès. */
export function echangerCode(
  code: string,
  cles: ClesTikTok,
  adresseRetour: string,
  recuperer: Recuperateur,
  maintenant = Date.now(),
): Promise<JetonsTikTok> {
  return demanderJetons(
    {
      client_key: cles.clientKey,
      client_secret: cles.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: adresseRetour,
    },
    recuperer,
    maintenant,
  );
}

/** Renvoie des jetons valables : les mêmes, ou des nouveaux si l'accès expire bientôt. */
export async function jetonsValables(
  jetons: JetonsTikTok,
  cles: ClesTikTok,
  recuperer: Recuperateur,
  maintenant = Date.now(),
): Promise<{ jetons: JetonsTikTok; renouveles: boolean }> {
  if (Date.parse(jetons.accesExpire) - maintenant > 5 * 60_000) return { jetons, renouveles: false };
  if (Date.parse(jetons.renouvellementExpire) <= maintenant) throw new CleRefusee('Accès TikTok expiré');
  const nouveaux = await demanderJetons(
    {
      client_key: cles.clientKey,
      client_secret: cles.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: jetons.renouvellement,
    },
    recuperer,
    maintenant,
  );
  return { jetons: nouveaux, renouveles: true };
}

// ── Lecture ──

interface ReponseApi<T> {
  data?: T;
  error?: { code?: string; message?: string };
}

async function appeler<T>(acces: string, chemin: string, init: RequestInit, recuperer: Recuperateur): Promise<T> {
  const reponse = await recuperer(`${API}${chemin}`, {
    ...init,
    headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const corps = (await reponse.json().catch(() => ({}))) as ReponseApi<T>;
  const code = corps.error?.code ?? (reponse.ok ? 'ok' : String(reponse.status));
  if (code === 'access_token_invalid' || reponse.status === 401) throw new CleRefusee('Jeton TikTok refusé');
  if (code === 'scope_not_authorized' || code === 'scope_permission_missed' || reponse.status === 403) {
    throw new DroitsInsuffisants('Autorisation TikTok manquante');
  }
  if (code !== 'ok' || !corps.data) throw new Error(`TikTok a répondu ${reponse.status} ${code}`);
  return corps.data;
}

/** Le nom affiché du compte relié. */
export async function nomTikTok(acces: string, recuperer: Recuperateur): Promise<string> {
  const data = await appeler<{ user?: { display_name?: string } }>(
    acces,
    '/user/info/?fields=open_id,display_name',
    { method: 'GET' },
    recuperer,
  );
  return data.user?.display_name || 'Compte TikTok';
}

export interface VideoTikTok {
  id: string;
  create_time?: number;
  view_count?: number;
  share_url?: string;
}

/** Les vidéos du compte, les plus récentes d'abord, page par page. */
export async function toutesLesVideos(acces: string, recuperer: Recuperateur): Promise<VideoTikTok[]> {
  const videos: VideoTikTok[] = [];
  let curseur: number | undefined;
  for (let page = 0; page < PAGES_MAX; page++) {
    const data = await appeler<{ videos?: VideoTikTok[]; cursor?: number; has_more?: boolean }>(
      acces,
      '/video/list/?fields=id,create_time,view_count,share_url',
      { method: 'POST', body: JSON.stringify(curseur === undefined ? { max_count: PAR_PAGE } : { max_count: PAR_PAGE, cursor: curseur }) },
      recuperer,
    );
    const lot = data.videos ?? [];
    videos.push(...lot);
    if (!data.has_more || lot.length === 0 || data.cursor === undefined) break;
    curseur = data.cursor;
  }
  return videos;
}

/** Transforme les vidéos TikTok en vidéos de l'appli. Une valeur absente reste absente. */
export function videosVersVideos(videos: VideoTikTok[]): Video[] {
  return videos
    .filter((v) => v.id && typeof v.create_time === 'number')
    .map((v) => ({
      id: `tiktok-${v.id}`,
      instant: new Date(v.create_time! * 1000).toISOString(),
      reseau: 'tiktok' as const,
      ...(v.share_url ? { lien: v.share_url } : {}),
      ...(typeof v.view_count === 'number' ? { vues: v.view_count } : {}),
    }));
}
