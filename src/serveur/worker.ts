// Le petit serveur de l'appli, sur Cloudflare.
// Il sert les pages de l'appli, et répond aux adresses /api/… pour les comptes reliés.
// Chaque appel est fait au nom de la personne connectée : la base n'accepte que ses propres lignes.

import { chiffrer, dechiffrer } from './chiffrement';
import { CleRefusee, DroitsInsuffisants, type Connecteur, type Recuperateur } from './commun';
import { connecteurLemonSqueezy } from './lemonsqueezy';
import { connecteurStripe } from './stripe';

export interface Env {
  ASSETS: { fetch(requete: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_CLE_PUBLIQUE: string;
  /** Secret posé dans les réglages Cloudflare : chiffre les clés d'accès des comptes reliés. */
  CLE_CHIFFREMENT?: string;
}

/** Les boutiques que l'appli sait relier. */
const BOUTIQUES: Record<string, Connecteur> = {
  stripe: connecteurStripe,
  lemonsqueezy: connecteurLemonSqueezy,
};

export default {
  async fetch(requete: Request, env: Env): Promise<Response> {
    // Sur Cloudflare, fetch refuse d'être appelé depuis un autre objet (ctx.recuperer(…)) :
    // on l'enveloppe pour qu'il soit toujours appelé seul.
    if (new URL(requete.url).pathname.startsWith('/api/')) {
      return traiterApi(requete, env, (entree, init) => fetch(entree, init));
    }
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

    const chemin = /^\/api\/comptes\/([a-z]+)\/(relier|synchroniser|mouvements)$/.exec(new URL(requete.url).pathname);
    const connecteur = chemin ? BOUTIQUES[chemin[1]!] : undefined;
    if (requete.method !== 'POST' || !chemin || !connecteur) return json(404, { erreur: 'Adresse inconnue.' });
    const source = chemin[1]!;
    // « await » : une erreur pendant la liaison ou la synchro reste attrapée juste en dessous.
    if (chemin[2] === 'relier') return await relier(requete, ctx, userId, source, connecteur, env.CLE_CHIFFREMENT);
    if (chemin[2] === 'synchroniser') return await synchroniser(ctx, source, connecteur, env.CLE_CHIFFREMENT);
    return await mouvements(ctx, source, connecteur, env.CLE_CHIFFREMENT);
  } catch (e) {
    // Le détail va dans les journaux Cloudflare ; la personne voit un message simple.
    console.error('Erreur du serveur', e);
    return json(500, { erreur: 'Le serveur a eu un problème. Réessaie dans un moment.' });
  }
}

async function relier(
  requete: Request,
  ctx: Contexte,
  userId: string,
  source: string,
  connecteur: Connecteur,
  secret: string,
): Promise<Response> {
  let cle = '';
  try {
    cle = String(((await requete.json()) as { cle?: unknown }).cle ?? '').trim();
  } catch {
    // corps illisible : traité comme une clé vide
  }
  if (cle.length < 20) return json(400, { erreur: `Colle la clé d’accès ${connecteur.nom} en entier.` });
  const refus = connecteur.refuserCle?.(cle);
  if (refus) return json(400, { erreur: refus });

  let libelle: string;
  try {
    libelle = await connecteur.verifier(cle, ctx.recuperer);
  } catch (e) {
    if (e instanceof CleRefusee) {
      return json(400, { erreur: `${connecteur.nom} refuse cette clé. Vérifie que tu l’as copiée en entier, puis réessaie.` });
    }
    if (e instanceof DroitsInsuffisants) return json(400, { erreur: connecteur.messageDroits });
    return json(502, { erreur: `${connecteur.nom} ne répond pas. Réessaie dans un moment.` });
  }

  const enregistrement = await base(ctx, 'comptes_relies?on_conflict=user_id,source', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: userId,
      source,
      cle_chiffree: await chiffrer(cle, secret),
      libelle,
      relie_le: new Date().toISOString(),
      derniere_synchro: null,
      derniere_erreur: null,
    }),
  });
  if (!enregistrement.ok) {
    // 23514 : la base refuse ce nom de boutique, elle date d'avant son arrivée dans l'appli.
    const detail = (await enregistrement.json().catch(() => null)) as { code?: string } | null;
    if (detail?.code === '23514') {
      return json(502, {
        erreur: 'La base de l’appli n’accepte pas encore cette boutique : dans Supabase, lance le texte SQL « 03-boutique-stripe.sql », puis réessaie.',
      });
    }
    return json(502, { erreur: 'Impossible d’enregistrer la boutique reliée. Réessaie.' });
  }
  return json(200, { libelle });
}

/** Note sur le compte relié la date de synchro ou l'erreur, pour l'afficher dans les réglages. */
function noter(ctx: Contexte, source: string, champs: { derniere_synchro?: string; derniere_erreur: string | null }) {
  return base(ctx, `comptes_relies?source=eq.${source}`, { method: 'PATCH', body: JSON.stringify(champs) });
}

/** La clé enregistrée de la boutique, déchiffrée ; sinon la réponse d'erreur à renvoyer. */
async function cleEnregistree(
  ctx: Contexte,
  source: string,
  connecteur: Connecteur,
  secret: string,
): Promise<{ cle: string } | { reponse: Response }> {
  const lecture = await base(ctx, `comptes_relies?source=eq.${source}&select=cle_chiffree`);
  if (!lecture.ok) return { reponse: json(502, { erreur: 'Impossible de lire la boutique reliée. Réessaie.' }) };
  const lignes = (await lecture.json()) as { cle_chiffree: string }[];
  if (!lignes[0]) return { reponse: json(404, { erreur: `Aucune boutique ${connecteur.nom} reliée.` }) };
  try {
    return { cle: await dechiffrer(lignes[0].cle_chiffree, secret) };
  } catch {
    await noter(ctx, source, { derniere_erreur: 'Clé illisible : relie la boutique à nouveau.' });
    return {
      reponse: json(409, { erreur: 'La clé enregistrée est illisible. Déconnecte la boutique, puis relie-la à nouveau.' }),
    };
  }
}

/** Le message quand la boutique refuse la clé enregistrée, ou qu'il lui manque une autorisation. */
function messageCleEnregistree(e: CleRefusee | DroitsInsuffisants, connecteur: Connecteur): string {
  return e instanceof DroitsInsuffisants
    ? connecteur.messageDroits
    : `${connecteur.nom} refuse la clé enregistrée. Déconnecte la boutique, puis relie-la avec une nouvelle clé.`;
}

async function synchroniser(ctx: Contexte, source: string, connecteur: Connecteur, secret: string): Promise<Response> {
  const lue = await cleEnregistree(ctx, source, connecteur, secret);
  if ('reponse' in lue) return lue.reponse;
  try {
    const { ventes, ignorees } = await connecteur.lireVentes(lue.cle, ctx.recuperer);
    const synchroniseLe = new Date().toISOString();
    await noter(ctx, source, { derniere_synchro: synchroniseLe, derniere_erreur: null });
    return json(200, { ventes, ignorees, synchroniseLe });
  } catch (e) {
    if (e instanceof CleRefusee || e instanceof DroitsInsuffisants) {
      const message = messageCleEnregistree(e, connecteur);
      await noter(ctx, source, { derniere_erreur: message });
      return json(400, { erreur: message });
    }
    return json(502, { erreur: `${connecteur.nom} ne répond pas. Réessaie dans un moment.` });
  }
}

/** Les derniers mouvements d'argent de la boutique, pour vérifier les frais et la TVA. Rien n'est enregistré. */
async function mouvements(ctx: Contexte, source: string, connecteur: Connecteur, secret: string): Promise<Response> {
  if (!connecteur.mouvements) return json(404, { erreur: 'Adresse inconnue.' });
  const lue = await cleEnregistree(ctx, source, connecteur, secret);
  if ('reponse' in lue) return lue.reponse;
  try {
    return json(200, { mouvements: await connecteur.mouvements(lue.cle, ctx.recuperer) });
  } catch (e) {
    if (e instanceof CleRefusee || e instanceof DroitsInsuffisants) return json(400, { erreur: messageCleEnregistree(e, connecteur) });
    return json(502, { erreur: `${connecteur.nom} ne répond pas. Réessaie dans un moment.` });
  }
}
