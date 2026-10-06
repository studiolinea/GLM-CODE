import { recupererSansRedirection } from './redirections';
// Le petit serveur de l'appli, sur Cloudflare.
// Il sert les pages de l'appli, et répond aux adresses /api/… pour les comptes reliés.
// Chaque appel est fait au nom de la personne connectée : la base n'accepte que ses propres lignes.

import { chiffrer, dechiffrer } from './chiffrement';
import { analyserBusiness, etatAssistantGratuit, ErreurAssistant, QUESTIONS_IA, limiteurAssistant, type ConfigurationIA, type LimiteurAssistant, type QuestionIA } from './assistant';
import type { Periode } from '../calculs/resume';
import type { Video } from '../modele';
import { CleRefusee, DroitsInsuffisants, type Connecteur, type Recuperateur } from './commun';
import { connecteurLemonSqueezy } from './lemonsqueezy';
import { connecteurStripe } from './stripe';
import { executerVeille } from './veille';
import {
  creerEtat,
  echangerCode,
  jetonsValables,
  nomTikTok,
  toutesLesVideos,
  urlAutorisation,
  verifierEtat,
  videosVersVideos,
  type ClesTikTok,
  type JetonsTikTok,
} from './tiktok';

export interface Env extends ConfigurationIA {
  VEILLE_ACTIVEE?: string;
  ASSETS: { fetch(requete: Request): Promise<Response> };
  SUPABASE_URL: string;
  SUPABASE_CLE_PUBLIQUE: string;
  /** Secret posé dans les réglages Cloudflare : chiffre les clés d'accès des comptes reliés. */
  CLE_CHIFFREMENT?: string;
  /** Appli développeur TikTok : la clé est publique (wrangler.jsonc), le secret est posé dans Cloudflare. */
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
  /** Endpoint HTTPS compatible chat completions et modèle choisis dans Cloudflare. IA_CLE est un secret. */
  IA_URL?: string;
  IA_MODELE?: string;
  IA_CLE?: string;
  /** Absent par défaut : aucune requête IA distante tant que l’activation explicite ne vaut pas « oui ». */
  IA_ACTIVEE?: string;
  IA_ESSAIS_ACTIVES?: string;
}

/** Les boutiques que l'appli sait relier. */
const BOUTIQUES: Record<string, Connecteur> = {
  stripe: connecteurStripe,
  lemonsqueezy: connecteurLemonSqueezy,
};

export default {
  async scheduled(_evenement: unknown, env: Env): Promise<void> {
    await executerVeille(env, (entree, init) => fetch(entree, init));
  },
  async fetch(requete: Request, env: Env): Promise<Response> {
    // Sur Cloudflare, fetch refuse d'être appelé depuis un autre objet (ctx.recuperer(…)) :
    // on l'enveloppe pour qu'il soit toujours appelé seul.
    if (new URL(requete.url).pathname.startsWith('/api/')) {
      return traiterApi(requete, env, (entree, init) => fetch(entree, init));
    }
    return env.ASSETS.fetch(requete);
  },
};

/** En-têtes de toutes les réponses du serveur : jamais gardées en cache, jamais affichées dans une autre page. */
const ENTETES_API = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

function json(statut: number, corps: unknown): Response {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...ENTETES_API },
  });
}

interface Contexte {
  env: Env;
  jeton: string;
  recuperer: Recuperateur;
  userId: string;
  /** Le business concerné : chaque compte relié appartient à un business du compte connecté. */
  businessId: string;
}

/** Appel à la base, au nom de la personne connectée (les règles de sécurité s'appliquent). */
function base(ctx: Pick<Contexte, 'env' | 'jeton' | 'recuperer'>, chemin: string, init: RequestInit = {}): Promise<Response> {
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

async function utilisateurConnecte(ctx: Pick<Contexte, 'env' | 'jeton' | 'recuperer'>): Promise<string | null> {
  const reponse = await ctx.recuperer(`${ctx.env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: ctx.env.SUPABASE_CLE_PUBLIQUE, Authorization: `Bearer ${ctx.jeton}` },
  });
  // Supabase en panne ou surchargé : ce n'est pas la connexion de la personne qui a expiré.
  if (reponse.status >= 500 || reponse.status === 429) throw new Error(`Supabase Auth a répondu ${reponse.status}`);
  if (!reponse.ok) return null;
  const utilisateur = (await reponse.json()) as { id?: string };
  return utilisateur.id ?? null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORPS_MAX_OCTETS = 16 * 1024;
const CLE_MAX_CARACTERES = 4096;
class CorpsTropGrand extends Error {}

/** Compte les octets réellement reçus : Content-Length peut manquer ou mentir. */
async function lireCorps(requete: Request): Promise<Record<string, unknown>> {
  const lecteur = requete.body?.getReader();
  if (!lecteur) throw new SyntaxError('Corps manquant');
  const decodeur = new TextDecoder();
  let taille = 0;
  let texte = '';
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > CORPS_MAX_OCTETS) {
        await lecteur.cancel().catch(() => undefined);
        throw new CorpsTropGrand();
      }
      texte += decodeur.decode(value, { stream: true });
    }
    texte += decodeur.decode();
  } finally {
    lecteur.releaseLock();
  }
  const corps: unknown = JSON.parse(texte);
  if (!corps || typeof corps !== 'object' || Array.isArray(corps)) throw new SyntaxError('Objet attendu');
  return corps as Record<string, unknown>;
}

/** Les lignes d'un compte relié dans la base : ce business, cette plateforme, ce compte (vide pour une boutique). */
function filtreCompte(ctx: Contexte, source: string, identifiant?: string): string {
  const filtre = `business_id=eq.${ctx.businessId}&source=eq.${source}`;
  return identifiant === undefined ? filtre : `${filtre}&identifiant=eq.${encodeURIComponent(identifiant)}`;
}

/** Lie chaque clé chiffrée à sa ligne : copiée dans une autre ligne (ou un autre compte), elle devient illisible. */
function contexteLigne(ctx: Contexte, source: string, identifiant: string): string {
  return `${ctx.userId}|${ctx.businessId}|${source}|${identifiant}`;
}

export async function traiterApi(requete: Request, env: Env, recuperer: Recuperateur, limiter: LimiteurAssistant = limiteurAssistant): Promise<Response> {
  try {
    const adresse = new URL(requete.url);
    const assistant = adresse.pathname === '/api/assistant/analyser';
    const etatAssistant = adresse.pathname === '/api/assistant/etat';
    // Retour de TikTok après l'accord : simple renvoi vers l'appli, qui finit la liaison au nom de la personne.
    if (requete.method === 'GET' && adresse.pathname === '/api/tiktok/retour') return retourTikTok(adresse);
    if (!assistant && !etatAssistant && !env.CLE_CHIFFREMENT) {
      return json(503, { erreur: 'Réglage du serveur à faire : ajoute le secret « CLE_CHIFFREMENT » dans Cloudflare.' });
    }
    const secret = env.CLE_CHIFFREMENT!;
    const jeton = (requete.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    let userId: string | null = null;
    try {
      const verifierConnexion: Recuperateur = assistant || etatAssistant
        ? (entree, init) => recupererSansRedirection(entree, { ...init, signal: AbortSignal.timeout(10_000) }, recuperer)
        : recuperer;
      userId = jeton ? await utilisateurConnecte({ env, jeton, recuperer: verifierConnexion }) : null;
    } catch (e) {
      console.error('Vérification de la connexion impossible', e);
      return json(503, { erreur: 'La vérification de ta connexion ne répond pas. Réessaie dans un moment.' });
    }
    if (!userId) return json(401, { erreur: 'Connecte-toi d’abord.' });
    if (etatAssistant && (requete.method === 'GET' || requete.method === 'POST')) return json(200, etatAssistantGratuit(env));

    const tiktok = /^\/api\/comptes\/tiktok\/(connexion|relier|synchroniser)$/.exec(adresse.pathname);
    const chemin = /^\/api\/comptes\/([a-z]+)\/(relier|synchroniser|mouvements)$/.exec(adresse.pathname);
    const connecteur = chemin && Object.hasOwn(BOUTIQUES, chemin[1]!) ? BOUTIQUES[chemin[1]!] : undefined;
    if (requete.method !== 'POST' || !(assistant || tiktok || (chemin && connecteur))) return json(404, { erreur: 'Adresse inconnue.' });

    let corps: Record<string, unknown>;
    try {
      corps = await lireCorps(requete);
    } catch (e) {
      if (e instanceof CorpsTropGrand) return json(413, { erreur: 'La demande est trop volumineuse.' });
      return json(400, { erreur: 'La demande est illisible. Réessaie depuis les réglages.' });
    }

    // La liaison TikTok retrouve son business dans l'« état » signé ; les autres adresses le reçoivent.
    if (tiktok?.[1] === 'relier') return await relierTikTok(corps, { env, jeton, recuperer, userId }, secret, adresse.origin);
    const businessId = typeof corps.business === 'string' && UUID.test(corps.business) ? corps.business : null;
    if (!businessId) return json(400, { erreur: 'Choisis d’abord un business.' });
    if (assistant) {
      const periode = corps.periode ?? '7j';
      const question = corps.question ?? 'priorites';
      if (typeof periode !== 'string' || !['7j', '1m', '3m'].includes(periode)
        || typeof question !== 'string' || !QUESTIONS_IA.includes(question)) {
        return json(400, { erreur: 'Choisis une période et une question proposées par l’assistant.' });
      }
      try {
        return json(200, await analyserBusiness(env, jeton, userId, businessId, periode as Periode, question as QuestionIA, recuperer, new Date(), limiter));
      } catch (e) {
        if (e instanceof ErreurAssistant) return json(e.statut, { erreur: e.message });
        return json(503, { erreur: 'L’assistant ne répond pas. Réessaie dans un moment.' });
      }
    }
    const ctx: Contexte = { env, jeton, recuperer, userId, businessId };

    // « await » : une erreur pendant la liaison ou la synchro reste attrapée juste en dessous.
    if (tiktok) return await routeTikTok(tiktok[1]!, ctx, secret, adresse.origin);
    const source = chemin![1]!;
    if (chemin![2] === 'relier') return await relier(corps, ctx, source, connecteur!, secret);
    if (chemin![2] === 'synchroniser') return await synchroniser(ctx, source, connecteur!, secret);
    return await mouvements(ctx, source, connecteur!, secret);
  } catch (e) {
    // Le détail va dans les journaux Cloudflare ; la personne voit un message simple.
    console.error('Erreur du serveur', e);
    return json(500, { erreur: 'Le serveur a eu un problème. Réessaie dans un moment.' });
  }
}

async function relier(
  corps: Record<string, unknown>,
  ctx: Contexte,
  source: string,
  connecteur: Connecteur,
  secret: string,
): Promise<Response> {
  if (typeof corps.cle !== 'string' || corps.cle.length > CLE_MAX_CARACTERES) {
    return json(400, { erreur: 'La clé d’accès n’a pas le bon format. Vérifie la clé copiée.' });
  }
  const cle = corps.cle.trim();
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

  const echec = await enregistrerCompte(ctx, source, '', await chiffrer(cle, secret, contexteLigne(ctx, source, '')), libelle);
  return echec ?? json(200, { libelle });
}

/** Enregistre (ou remplace) le compte relié. Renvoie la réponse d'erreur, ou null si tout va bien. */
async function enregistrerCompte(
  ctx: Contexte,
  source: string,
  identifiant: string,
  cleChiffree: string,
  libelle: string,
): Promise<Response | null> {
  const enregistrement = await base(ctx, 'comptes_relies?on_conflict=user_id,business_id,source,identifiant', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({
      user_id: ctx.userId,
      business_id: ctx.businessId,
      source,
      identifiant,
      cle_chiffree: cleChiffree,
      libelle,
      relie_le: new Date().toISOString(),
      derniere_synchro: null,
      derniere_erreur: null,
    }),
  });
  if (enregistrement.ok) return null;
  // 23514 : la base refuse ce nom de boutique, elle date d'avant son arrivée dans l'appli.
  const detail = (await enregistrement.json().catch(() => null)) as { code?: string } | null;
  if (detail?.code === '23514') {
    return json(502, {
      erreur: 'Réglage du serveur à faire : la base n’accepte pas encore cette boutique. Dans Supabase, lance le texte SQL « 03-boutique-stripe.sql », puis réessaie.',
    });
  }
  return json(502, { erreur: 'Impossible d’enregistrer le compte relié. Réessaie.' });
}

/** Note sur le compte relié la date de synchro, l'erreur ou une nouvelle clé chiffrée. */
function noter(
  ctx: Contexte,
  source: string,
  identifiant: string,
  champs: { derniere_synchro?: string; derniere_erreur?: string | null; cle_chiffree?: string },
) {
  return base(ctx, `comptes_relies?${filtreCompte(ctx, source, identifiant)}`, {
    method: 'PATCH',
    body: JSON.stringify(champs),
  });
}

/** Les clés enregistrées de ce business pour cette plateforme (une par compte relié). */
async function clesEnregistrees(
  ctx: Contexte,
  source: string,
  identifiant?: string,
): Promise<{ lignes: { identifiant: string; cle_chiffree: string }[] } | { reponse: Response }> {
  const lecture = await base(ctx, `comptes_relies?${filtreCompte(ctx, source, identifiant)}&select=identifiant,cle_chiffree`);
  if (!lecture.ok) return { reponse: json(502, { erreur: 'Impossible de lire le compte relié. Réessaie.' }) };
  return { lignes: (await lecture.json()) as { identifiant: string; cle_chiffree: string }[] };
}

/** La clé enregistrée de la boutique, déchiffrée ; sinon la réponse d'erreur à renvoyer. */
async function cleEnregistree(
  ctx: Contexte,
  source: string,
  nom: string,
  secret: string,
): Promise<{ cle: string } | { reponse: Response }> {
  const lues = await clesEnregistrees(ctx, source, '');
  if ('reponse' in lues) return lues;
  const ligne = lues.lignes[0];
  if (!ligne) return { reponse: json(404, { erreur: `Aucun compte ${nom} relié.` }) };
  try {
    return { cle: await dechiffrer(ligne.cle_chiffree, secret, contexteLigne(ctx, source, '')) };
  } catch {
    await noter(ctx, source, '', { derniere_erreur: 'Clé illisible : relie la boutique à nouveau.' });
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
  const lue = await cleEnregistree(ctx, source, connecteur.nom, secret);
  if ('reponse' in lue) return lue.reponse;
  try {
    const { ventes, ignorees } = await connecteur.lireVentes(lue.cle, ctx.recuperer);
    const synchroniseLe = new Date().toISOString();
    await noter(ctx, source, '', { derniere_synchro: synchroniseLe, derniere_erreur: null });
    return json(200, { ventes, ignorees, synchroniseLe });
  } catch (e) {
    if (e instanceof CleRefusee || e instanceof DroitsInsuffisants) {
      const message = messageCleEnregistree(e, connecteur);
      await noter(ctx, source, '', { derniere_erreur: message });
      return json(400, { erreur: message });
    }
    return json(502, { erreur: `${connecteur.nom} ne répond pas. Réessaie dans un moment.` });
  }
}

/** Les derniers mouvements d'argent de la boutique, pour vérifier les frais et la TVA. Rien n'est enregistré. */
async function mouvements(ctx: Contexte, source: string, connecteur: Connecteur, secret: string): Promise<Response> {
  if (!connecteur.mouvements) return json(404, { erreur: 'Adresse inconnue.' });
  const lue = await cleEnregistree(ctx, source, connecteur.nom, secret);
  if ('reponse' in lue) return lue.reponse;
  try {
    return json(200, { mouvements: await connecteur.mouvements(lue.cle, ctx.recuperer) });
  } catch (e) {
    if (e instanceof CleRefusee || e instanceof DroitsInsuffisants) return json(400, { erreur: messageCleEnregistree(e, connecteur) });
    return json(502, { erreur: `${connecteur.nom} ne répond pas. Réessaie dans un moment.` });
  }
}

// ── TikTok : liaison par accord sur le site de TikTok, puis lecture des vidéos ──
// Un business peut relier plusieurs comptes TikTok : chacun est repéré par son « open_id ».

const MESSAGE_DROITS_TIKTOK =
  'TikTok n’a pas donné l’accès à tes vidéos : relie ton compte à nouveau et accepte l’accès à tes vidéos publiques.';
const MESSAGE_TIKTOK_PAS_CONFIGURE =
  'Réglage du serveur à faire : ajoute les secrets « TIKTOK_CLIENT_KEY » et « TIKTOK_CLIENT_SECRET » dans Cloudflare.';

function clesTikTok(env: Env): ClesTikTok | null {
  return env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET
    ? { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET }
    : null;
}

/** TikTok renvoie ici après l'accord (ou le refus) : on repasse le code à l'appli, qui finit la liaison. */
function retourTikTok(adresse: URL): Response {
  const vers = new URL('/', adresse.origin);
  vers.searchParams.set('tiktok', 'retour');
  const code = adresse.searchParams.get('code');
  const etat = adresse.searchParams.get('state');
  if (code && etat) {
    vers.searchParams.set('code_tiktok', code);
    vers.searchParams.set('etat', etat);
  } else {
    vers.searchParams.set('erreur', adresse.searchParams.get('error') ?? 'inconnue');
  }
  return new Response(null, { status: 302, headers: { Location: vers.toString(), ...ENTETES_API } });
}

async function routeTikTok(action: string, ctx: Contexte, secret: string, origine: string): Promise<Response> {
  const cles = clesTikTok(ctx.env);
  if (!cles) return json(503, { erreur: MESSAGE_TIKTOK_PAS_CONFIGURE });
  if (action === 'connexion') {
    const etat = await creerEtat(ctx.userId, ctx.businessId, secret);
    return json(200, { url: urlAutorisation(cles.clientKey, `${origine}/api/tiktok/retour`, etat) });
  }
  return synchroniserTikTok(ctx, secret, cles);
}

async function relierTikTok(
  corps: Record<string, unknown>,
  sansBusiness: Omit<Contexte, 'businessId'>,
  secret: string,
  origine: string,
): Promise<Response> {
  const cles = clesTikTok(sansBusiness.env);
  if (!cles) return json(503, { erreur: MESSAGE_TIKTOK_PAS_CONFIGURE });
  const code = String(corps.code ?? '');
  const businessId = code ? await verifierEtat(String(corps.etat ?? ''), sansBusiness.userId, secret) : null;
  if (!businessId) {
    return json(400, { erreur: 'Ce lien TikTok n’est plus valable. Recommence depuis la carte TikTok des réglages.' });
  }
  const ctx: Contexte = { ...sansBusiness, businessId };
  let jetons: JetonsTikTok;
  let libelle: string;
  try {
    jetons = await echangerCode(code, cles, `${origine}/api/tiktok/retour`, ctx.recuperer);
    libelle = await nomTikTok(jetons.acces, ctx.recuperer);
  } catch (e) {
    if (e instanceof DroitsInsuffisants) return json(400, { erreur: MESSAGE_DROITS_TIKTOK });
    if (e instanceof CleRefusee) {
      return json(400, { erreur: 'TikTok a refusé la liaison. Recommence depuis la carte TikTok des réglages.' });
    }
    return json(502, { erreur: 'TikTok ne répond pas. Réessaie dans un moment.' });
  }
  const contexte = contexteLigne(ctx, 'tiktok', jetons.openId);
  const echec = await enregistrerCompte(ctx, 'tiktok', jetons.openId, await chiffrer(JSON.stringify(jetons), secret, contexte), libelle);
  return echec ?? json(200, { libelle });
}

/** Lit les vidéos de chaque compte TikTok du business. Un compte en erreur n'empêche pas les autres. */
async function synchroniserTikTok(ctx: Contexte, secret: string, cles: ClesTikTok): Promise<Response> {
  const lues = await clesEnregistrees(ctx, 'tiktok');
  if ('reponse' in lues) return lues.reponse;
  if (lues.lignes.length === 0) return json(404, { erreur: 'Aucun compte TikTok relié.' });

  const videos: Video[] = [];
  const erreurs: string[] = [];
  let injoignables = 0;
  for (const ligne of lues.lignes) {
    const noterCe = (champs: Parameters<typeof noter>[3]) => noter(ctx, 'tiktok', ligne.identifiant, champs);
    const contexte = contexteLigne(ctx, 'tiktok', ligne.identifiant);
    try {
      const jetons = JSON.parse(await dechiffrer(ligne.cle_chiffree, secret, contexte)) as JetonsTikTok;
      const valables = await jetonsValables(jetons, cles, ctx.recuperer);
      if (valables.renouveles) {
        // TikTok vient de donner un nouvel accès : s'il n'est pas enregistré, la liaison casserait au prochain renouvellement.
        const enregistre = await noterCe({ cle_chiffree: await chiffrer(JSON.stringify(valables.jetons), secret, contexte) });
        if (!enregistre.ok) {
          erreurs.push('Impossible d’enregistrer l’accès TikTok renouvelé. Réessaie dans un moment.');
          continue;
        }
      }
      videos.push(...videosVersVideos(await toutesLesVideos(valables.jetons.acces, ctx.recuperer)));
      await noterCe({ derniere_synchro: new Date().toISOString(), derniere_erreur: null });
    } catch (e) {
      if (e instanceof CleRefusee || e instanceof DroitsInsuffisants || e instanceof SyntaxError) {
        const message =
          e instanceof DroitsInsuffisants
            ? MESSAGE_DROITS_TIKTOK
            : 'TikTok ne reconnaît plus la liaison : déconnecte ce compte TikTok, puis relie-le à nouveau.';
        await noterCe({ derniere_erreur: message });
        erreurs.push(message);
      } else {
        injoignables++;
      }
    }
  }
  if (videos.length === 0 && erreurs.length + injoignables === lues.lignes.length) {
    if (erreurs[0]) return json(400, { erreur: erreurs[0] });
    return json(502, { erreur: 'TikTok ne répond pas. Réessaie dans un moment.' });
  }
  return json(200, { videos, synchroniseLe: new Date().toISOString() });
}
