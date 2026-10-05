// Le petit serveur de l'appli, sur Cloudflare.
// Il sert les pages de l'appli, et répond aux adresses /api/… pour les comptes reliés.
// Chaque appel est fait au nom de la personne connectée : la base n'accepte que ses propres lignes.

import { chiffrer, dechiffrer } from './chiffrement';
import { CleRefusee, commandesVersVentes, nomBoutique, toutesLesCommandes, type Recuperateur } from './lemonsqueezy';

export interface Env {
  ASSETS: { fetch(requete: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_CLE_PUBLIQUE: string;
  /** Secret posé dans les réglages Cloudflare : chiffre les clés d'accès des comptes reliés. */
  CLE_CHIFFREMENT?: string;
}

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    if (new URL(requete.url).pathname.startsWith('/api/')) return traiterApi(requete, env, fetch);
    return env.ASSETS.fetch(requete);
  },
};

function json(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

interface Contexte {
  env: Env;
  jeton: string;
  recuperer: Recuperateur;
}

/** Appel à la base, au nom de la personne connectée (les règles de sécurité s'appliquent). */
function base(ctx: Contexte, chemin: string, init: RequestInit = {}): Promise<Response> {
  return ctx.recuperer(`${ctx.env.SUPABASE_URL}/rest/v1/${chemin}`, {
    ...init,
    headers: {
      apikey: ctx.env.SUPABASE_CLE_PUBLIQUE,
      Authorization: `Bearer ${ctx.jeton}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

async function utilisateurConnecte(ctx: Contexte): Promise<string | null> {
  const reponse = await ctx.recuperer(`${ctx.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ctx.env.SUPABASE_CLE_PUBLIQUE, Authorization: `Bearer ${ctx.jeton}` },
  });
  if (!reponse.ok) return null;
  const utilisateur = (await reponse.json()) as { id?: string };
  return utilisateur.id ?? null;
}

export async function traiterApi(requete: Request, env: Env, recuperer: Recuperateur): Promise<Response> {
  try {
    if (!env.CLE_CHIFFREMENT) {
      return json(503, { erreur: 'Le serveur n’est pas encore configuré : il manque la clé de chiffrement dans Cloudflare.' });
    }
    const jeton = (requete.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const ctx: Contexte = { env, jeton, recuperer };
    const userId = jeton ? await utilisateurConnecte(ctx) : null;
    if (!userId) return json(401, { erreur: 'Connecte-toi d’abord.' });

    const route = `${requete.method} ${new URL(requete.url).pathname}`;
    if (route === 'POST /api/comptes/lemonsqueezy/relier') return relierLemonSqueezy(requete, ctx, userId, env.CLE_CHIFFREMENT);
    if (route === 'POST /api/comptes/lemonsqueezy/synchroniser') return synchroniserLemonSqueezy(ctx, env.CLE_CHIFFREMENT);
    return json(404, { erreur: 'Adresse inconnue.' });
  } catch {
    return json(500, { erreur: 'Le serveur a eu un problème. Réessaie dans un moment.' });
  }
}

async function relierLemonSqueezy(requete: Request, ctx: Contexte, userId: string, secret: string): Promise<Response> {
  let cle = '';
  try {
    cle = String(((await requete.json()) as { cle?: unknown }).cle ?? '').trim();
  } catch {
    // corps illisible : traité comme une clé vide
  }
  if (cle.length < 20) return json(400, { erreur: 'Colle la clé d’accès Lemon Squeezy en entier.' });

  let libelle: string;
  try {
    libelle = await nomBoutique(cle, ctx.recuperer);
  } catch (e) {
    if (e instanceof CleRefusee) {
      return json(400, { erreur: 'Lemon Squeezy refuse cette clé. Vérifie que tu l’as copiée en entier, puis réessaie.' });
    }
    return json(502, { erreur: 'Lemon Squeezy ne répond pas. Réessaie dans un moment.' });
  }

  const enregistrement = await base(ctx, 'comptes_relies?on_conflict=user_id,source', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      source: 'lemonsqueezy',
      cle_chiffree: await chiffrer(cle, secret),
      libelle,
      relie_le: new Date().toISOString(),
      derniere_synchro: null,
      derniere_erreur: null,
    }),
  });
  if (!enregistrement.ok) return json(502, { erreur: 'Impossible d’enregistrer la boutique reliée. Réessaie.' });
  return json(200, { libelle });
}

async function noterSynchro(ctx: Contexte, champs: { derniere_synchro?: string; derniere_erreur: string | null }) {
  await base(ctx, 'comptes_relies?source=eq.lemonsqueezy', { method: 'PATCH', body: JSON.stringify(champs) });
}

async function synchroniserLemonSqueezy(ctx: Contexte, secret: string): Promise<Response> {
  const lecture = await base(ctx, 'comptes_relies?source=eq.lemonsqueezy&select=cle_chiffree');
  if (!lecture.ok) return json(502, { erreur: 'Impossible de lire la boutique reliée. Réessaie.' });
  const lignes = (await lecture.json()) as { cle_chiffree: string }[];
  if (!lignes[0]) return json(404, { erreur: 'Aucune boutique Lemon Squeezy reliée.' });

  let cle: string;
  try {
    cle = await dechiffrer(lignes[0].cle_chiffree, secret);
  } catch {
    await noterSynchro(ctx, { derniere_erreur: 'Clé illisible : relie la boutique à nouveau.' });
    return json(409, { erreur: 'La clé enregistrée est illisible. Déconnecte la boutique, puis relie-la à nouveau.' });
  }

  try {
    const { ventes, ignorees } = commandesVersVentes(await toutesLesCommandes(cle, ctx.recuperer));
    const synchroniseLe = new Date().toISOString();
    await noterSynchro(ctx, { derniere_synchro: synchroniseLe, derniere_erreur: null });
    return json(200, { ventes, ignorees, synchroniseLe });
  } catch (e) {
    if (e instanceof CleRefusee) {
      await noterSynchro(ctx, { derniere_erreur: 'Clé refusée par Lemon Squeezy : relie la boutique à nouveau.' });
      return json(400, { erreur: 'Lemon Squeezy refuse la clé enregistrée. Déconnecte la boutique, puis relie-la avec une nouvelle clé.' });
    }
    return json(502, { erreur: 'Lemon Squeezy ne répond pas. Réessaie dans un moment.' });
  }
}
