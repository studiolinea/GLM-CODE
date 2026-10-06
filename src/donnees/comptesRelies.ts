// Les comptes reliés de la personne connectée (boutique, puis TikTok et Instagram).
// La liste se lit directement dans la base (chacun ne voit que les siens) ;
// relier et synchroniser passent par le serveur de l'appli, qui garde les clés chiffrées.

import type { Video } from '../modele';
import type { MouvementBoutique } from '../serveur/commun';
import type { Vente } from '../ventes/modele';
import { client } from './config';

export type { MouvementBoutique };

export type SourceCompte = 'stripe' | 'lemonsqueezy' | 'tiktok' | 'instagram';

/** Les boutiques que l'appli sait relier, dans l'ordre d'affichage. */
export type SourceBoutique = 'stripe' | 'lemonsqueezy';
export const BOUTIQUES: SourceBoutique[] = ['stripe', 'lemonsqueezy'];

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

async function appelerServeur<T>(chemin: string, corps: unknown = {}): Promise<T> {
  const { data } = await base().auth.getSession();
  if (!data.session) throw new Error('Connecte-toi d’abord.');
  let reponse: Response;
  try {
    reponse = await fetch(chemin, {
      method: 'POST',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    });
  } catch {
    throw new Error('Pas de connexion, réessaie.');
  }
  let contenu: { erreur?: string } & Partial<T>;
  try {
    contenu = (await reponse.json()) as typeof contenu;
  } catch {
    throw new Error('Le serveur de l’appli ne répond pas correctement. Réessaie dans un moment.');
  }
  if (!reponse.ok) throw new Error(contenu.erreur ?? `Erreur du serveur (${reponse.status}).`);
  return contenu as T;
}

/** Les comptes reliés d'un business. */
export async function listerComptes(businessId: string): Promise<CompteRelie[]> {
  const { data, error } = await base()
    .from('comptes_relies')
    .select('source, identifiant, libelle, relie_le, derniere_synchro, derniere_erreur')
    .eq('business_id', businessId)
    .order('relie_le');
  if (error) throw new Error('Impossible de lire tes comptes reliés. Réessaie.');
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
