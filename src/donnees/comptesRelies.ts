// Les comptes reliés de la personne connectée (boutique, puis TikTok et Instagram).
// La liste se lit directement dans la base (chacun ne voit que les siens) ;
// relier et synchroniser passent par le serveur de l'appli, qui garde les clés chiffrées.

import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Video } from '../modele';
import type { MouvementBoutique } from '../serveur/commun';
import type { Vente } from '../ventes/modele';
import { client } from './config';

export type { MouvementBoutique };

export type SourceCompte = 'stripe' | 'lemonsqueezy' | 'tiktok' | 'instagram';

/** Les boutiques que l'appli sait relier, dans l'ordre d'affichage. */
export type SourceBoutique = 'stripe' | 'lemonsqueezy';
export const BOUTIQUES: SourceBoutique[] = ['stripe', 'lemonsqueezy'];

/** Le nom de chaque compte, tel que Kévin le connaît (dans les messages : « Stripe : … »). */
export const NOMS_COMPTES: Record<SourceCompte, string> = {
  stripe: 'Stripe',
  lemonsqueezy: 'Lemon Squeezy',
  tiktok: 'TikTok',
  instagram: 'Instagram',
};

/** « Stripe : la clé est refusée. » Un message qui commence déjà par le nom du compte reste tel quel. */
export function avecNomCompte(source: SourceCompte, message: string): string {
  const nom = NOMS_COMPTES[source];
  return message.startsWith(nom) ? message : `${nom} : ${message}`;
}

/**
 * Ce que le libellé du compte apporte en plus du nom de la plateforme : « Stripe » → rien,
 * « Stripe (mode test) » → « mode test », le nom d'une boutique Lemon Squeezy → « « Ma boutique » ».
 */
export function apportLibelle(libelle: string, plateforme: string): string | null {
  if (libelle.startsWith(plateforme)) return libelle.slice(plateforme.length).replace(/[()]/g, '').trim() || null;
  return libelle.trim() ? `« ${libelle.trim()} »` : null;
}

/** « Boutique Stripe reliée (mode test). », « Boutique Lemon Squeezy reliée (« Ma boutique »). », « Boutique Stripe reliée. » */
export function messageBoutiqueReliee(source: SourceBoutique, libelle: string): string {
  const nom = NOMS_COMPTES[source];
  const apport = apportLibelle(libelle, nom);
  return `Boutique ${nom} reliée${apport ? ` (${apport})` : ''}.`;
}

export const MESSAGE_PAS_DE_CONNEXION = 'Pas de connexion, réessaie.';
export const MESSAGE_CONNEXION_EXPIREE = 'Ta connexion a expiré : reconnecte-toi.';

/** La session n'a pas pu être renouvelée : il faut se reconnecter. */
export class ConnexionExpiree extends Error {
  constructor() {
    super(MESSAGE_CONNEXION_EXPIREE);
    this.name = 'ConnexionExpiree';
  }
}

/** Une erreur de la base qui vient d'une coupure de réseau (et pas d'un refus de la base). */
function erreurReseau(error: { message?: string } | null): boolean {
  return !!error && /failed to fetch|networkerror|load failed|fetch failed/i.test(error.message ?? '');
}

export interface CompteRelie {
  source: SourceCompte;
  /** Distingue plusieurs comptes d'un même réseau dans un business (vide pour une boutique). */
  identifiant: string;
  /** Par exemple le nom de la boutique. */
  libelle: string;
  relieLe: string;
  derniereSynchro: string | null;
  derniereErreur: string | null;
}

export interface ResultatSynchro {
  ventes: Vente[];
  ignorees: { numero: string; raison: string }[];
  synchroniseLe: string;
}

function base() {
  if (!client) throw new Error('L’appli n’est pas reliée à une base en ligne.');
  return client;
}

/**
 * Le jeton de la session, pour prouver au serveur qui appelle. Avec `renouveler`, ou sans session gardée,
 * on demande une session neuve. Si c'est impossible : « Pas de connexion » (réseau), ou ConnexionExpiree.
 */
async function jeton(renouveler = false): Promise<string> {
  const auth = base().auth;
  if (!renouveler) {
    const { data } = await auth.getSession();
    if (data.session) return data.session.access_token;
  }
  const { data, error } = await auth.refreshSession();
  if (data.session) return data.session.access_token;
  if (error && isAuthRetryableFetchError(error)) throw new Error(MESSAGE_PAS_DE_CONNEXION);
  throw new ConnexionExpiree();
}

async function envoyer(chemin: string, corps: unknown, acces: string): Promise<Response> {
  try {
    return await fetch(chemin, {
      method: 'POST',
      headers: { Authorization: `Bearer ${acces}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error(MESSAGE_PAS_DE_CONNEXION);
  }
}

async function appelerServeur<T>(chemin: string, corps: unknown = {}): Promise<T> {
  let reponse = await envoyer(chemin, corps, await jeton());
  // Le serveur ne reconnaît pas la session (jeton périmé) : on la renouvelle, puis on réessaie une fois.
  if (reponse.status === 401) reponse = await envoyer(chemin, corps, await jeton(true));
  if (reponse.status === 401) throw new ConnexionExpiree();
  let contenu: { erreur?: string } & Partial<T>;
  try {
    contenu = (await reponse.json()) as typeof contenu;
  } catch {
    throw new Error('Le serveur de l’appli ne répond pas correctement. Réessaie dans un moment.');
  }
  if (!reponse.ok) throw new Error(contenu.erreur ?? `Le serveur de l’appli a eu un problème (code ${reponse.status}). Réessaie dans un moment.`);
  return contenu as T;
}

/** Les comptes reliés d'un business. */
export async function listerComptes(businessId: string): Promise<CompteRelie[]> {
  const { data, error } = await base()
    .from('comptes_relies')
    .select('source, identifiant, libelle, relie_le, derniere_synchro, derniere_erreur')
    .eq('business_id', businessId)
    .order('relie_le');
  if (error) throw new Error(erreurReseau(error) ? MESSAGE_PAS_DE_CONNEXION : 'Impossible de lire tes comptes reliés. Réessaie.');
  return (data ?? []).map((l) => ({
    source: l.source as SourceCompte,
    identifiant: (l.identifiant as string | null) ?? '',
    libelle: l.libelle as string,
    relieLe: l.relie_le as string,
    derniereSynchro: (l.derniere_synchro as string | null) ?? null,
    derniereErreur: (l.derniere_erreur as string | null) ?? null,
  }));
}

/** Relie une boutique avec sa clé d'accès. Renvoie son libellé (par exemple le nom de la boutique). */
export async function relierBoutique(business: string, source: SourceBoutique, cle: string): Promise<string> {
  const { libelle } = await appelerServeur<{ libelle: string }>(`/api/comptes/${source}/relier`, { business, cle });
  return libelle;
}

export function synchroniserBoutique(business: string, source: SourceBoutique): Promise<ResultatSynchro> {
  return appelerServeur<ResultatSynchro>(`/api/comptes/${source}/synchroniser`, { business });
}

/** Les derniers mouvements d'argent enregistrés par la boutique, pour vérifier les frais et la TVA. */
export async function mouvementsBoutique(business: string, source: SourceBoutique): Promise<MouvementBoutique[]> {
  const { mouvements } = await appelerServeur<{ mouvements: MouvementBoutique[] }>(`/api/comptes/${source}/mouvements`, {
    business,
  });
  return mouvements;
}

// ── TikTok ──

/** Demande au serveur l'adresse de la page d'accord de TikTok. */
export async function adresseConnexionTikTok(business: string): Promise<string> {
  const { url } = await appelerServeur<{ url: string }>('/api/comptes/tiktok/connexion', { business });
  return url;
}

/** Finit la liaison au retour de TikTok. Renvoie le nom du compte TikTok. */
export async function relierTikTok(code: string, etat: string): Promise<string> {
  const { libelle } = await appelerServeur<{ libelle: string }>('/api/comptes/tiktok/relier', { code, etat });
  return libelle;
}

export function synchroniserTikTok(business: string): Promise<{ videos: Video[]; synchroniseLe: string }> {
  return appelerServeur('/api/comptes/tiktok/synchroniser', { business });
}

/** Ce que TikTok a renvoyé dans l'adresse de l'appli, après l'accord ou le refus. */
export type RetourTikTok = { code: string; etat: string } | { erreur: string };

export function lireRetourTikTok(recherche: string): RetourTikTok | null {
  const p = new URLSearchParams(recherche);
  if (p.get('tiktok') !== 'retour') return null;
  const code = p.get('code_tiktok');
  const etat = p.get('etat');
  return code && etat ? { code, etat } : { erreur: p.get('erreur') ?? 'inconnue' };
}

/** Efface le compte relié et sa clé. Les ventes déjà chargées restent. */
export async function deconnecterCompte(business: string, source: SourceCompte, identifiant = ''): Promise<void> {
  const { error } = await base()
    .from('comptes_relies')
    .delete()
    .eq('business_id', business)
    .eq('source', source)
    .eq('identifiant', identifiant);
  if (error) throw new Error('Impossible de déconnecter ce compte. Réessaie.');
}
