// Les business du compte connecté : chacun a ses ventes, ses vidéos, ses voyants et ses comptes reliés.

import type { SupabaseClient } from '@supabase/supabase-js';
import { memeNom } from '../texte';

export interface Business {
  id: string;
  nom: string;
}

export const NOM_MAX = 60;

/** Un nom propre : sans espaces autour, entre 1 et 60 caractères. Renvoie null s'il ne va pas. */
export function nomValide(nom: string): string | null {
  const propre = nom.trim().replace(/\s+/g, ' ');
  return propre.length >= 1 && propre.length <= NOM_MAX ? propre : null;
}

export async function listerBusiness(client: SupabaseClient): Promise<Business[]> {
  const { data, error } = await client.from('business').select('id, nom').order('cree_le').order('id');
  // Le détail technique (cause) sert à l'écran d'erreur, qui l'écrit dans la console.
  if (error) throw new Error('Impossible de lire tes business. Réessaie.', { cause: error });
  return (data ?? []) as Business[];
}

/**
 * Crée un business. Le premier du compte montre les données d'exemple ;
 * les suivants commencent vides (« pas encore de données »), pour ne pas mélanger exemple et vrais chiffres.
 */
export async function creerBusiness(client: SupabaseClient, userId: string, nom: string, premier: boolean): Promise<Business> {
  const propre = nomValide(nom);
  if (!propre) throw new Error(`Donne un nom à ton business (${NOM_MAX} caractères au plus).`);
  const { data, error } = await client.from('business').insert({ user_id: userId, nom: propre }).select('id, nom').single();
  if (error || !data) throw new Error('Impossible de créer ce business. Réessaie.');
  if (!premier) {
    const { error: erreurReglages } = await client
      .from('reglages')
      .upsert(
        { user_id: userId, business_id: data.id, objectif_par_jour: 1, couverture: null, exemple_termine: true },
        { onConflict: 'user_id,business_id' },
      );
    if (erreurReglages) {
      // Sans ces réglages, le nouveau business montrerait les données d'exemple : on annule sa création.
      await client.from('business').delete().eq('id', data.id);
      throw new Error('Impossible de créer ce business. Réessaie.');
    }
  }
  return data as Business;
}

export async function renommerBusiness(client: SupabaseClient, id: string, nom: string): Promise<void> {
  const propre = nomValide(nom);
  if (!propre) throw new Error(`Donne un nom à ton business (${NOM_MAX} caractères au plus).`);
  const { error } = await client.from('business').update({ nom: propre }).eq('id', id);
  if (error) throw new Error('Impossible de renommer ce business. Réessaie.');
}

/** Supprime un business et tout ce qu'il contient (ventes, vidéos, voyants, comptes reliés et leurs clés). */
export async function supprimerBusiness(client: SupabaseClient, id: string): Promise<void> {
  const { error } = await client.from('business').delete().eq('id', id);
  if (error) throw new Error('Impossible de supprimer ce business. Réessaie.');
}

// La liste des business et le dernier ouvert, retenus sur l'appareil : sans réseau, l'appli s'ouvre quand même.
const cleChoix = (userId: string) => `pilotage:business:${userId}`;

export interface MemoireBusiness {
  /** Le business ouvert en dernier. */
  actuel: string | null;
  /** La dernière liste lue en ligne (vide si elle n'a jamais été lue sur cet appareil). */
  liste: Business[];
}

const estBusiness = (b: unknown): b is Business =>
  typeof b === 'object' && b !== null && typeof (b as Business).id === 'string' && typeof (b as Business).nom === 'string';

/** Relit ce qui est gardé : l'objet { actuel, liste }, ou l'ancien format (l'identifiant du business, seul). */
export function lireMemoireBusiness(texte: string | null): MemoireBusiness {
  if (!texte) return { actuel: null, liste: [] };
  let brut: unknown;
  try {
    brut = JSON.parse(texte);
  } catch {
    return { actuel: texte, liste: [] };
  }
  if (typeof brut !== 'object' || brut === null) return { actuel: null, liste: [] };
  const { actuel, liste } = brut as { actuel?: unknown; liste?: unknown };
  return {
    actuel: typeof actuel === 'string' ? actuel : null,
    liste: Array.isArray(liste) ? liste.filter(estBusiness).map(({ id, nom }) => ({ id, nom })) : [],
  };
}

export function memoireBusiness(userId: string): MemoireBusiness {
  try {
    return lireMemoireBusiness(localStorage.getItem(cleChoix(userId)));
  } catch {
    return { actuel: null, liste: [] };
  }
}

function ecrireMemoire(userId: string, changement: Partial<MemoireBusiness>): void {
  try {
    localStorage.setItem(cleChoix(userId), JSON.stringify({ ...memoireBusiness(userId), ...changement }));
  } catch {
    // Pas grave : on rouvrira le premier business, et sans réseau l'appli attendra la connexion.
  }
}

export function businessRetenu(userId: string): string | null {
  return memoireBusiness(userId).actuel;
}

export function retenirBusiness(userId: string, id: string): void {
  ecrireMemoire(userId, { actuel: id });
}

/** Garde la liste lue en ligne, pour ouvrir l'appli sans réseau. */
export function retenirListe(userId: string, liste: Business[]): void {
  ecrireMemoire(userId, { liste: liste.map(({ id, nom }) => ({ id, nom })) });
}

/** Efface la liste et le choix gardés sur l'appareil (à la déconnexion). */
export function oublierBusiness(userId: string): void {
  try {
    localStorage.removeItem(cleChoix(userId));
  } catch {
    // Rien à faire.
  }
}

// Le dernier compte connecté sur cet appareil : sans réseau, sa session ne peut pas être renouvelée,
// mais l'appli peut quand même montrer la copie de ses données.
const CLE_COMPTE = 'pilotage:dernier-compte';

export interface CompteRetenu {
  userId: string;
  email: string;
}

export function compteRetenu(): CompteRetenu | null {
  try {
    const brut = JSON.parse(localStorage.getItem(CLE_COMPTE) ?? 'null') as Partial<CompteRetenu> | null;
    return brut && typeof brut.userId === 'string' && brut.userId ? { userId: brut.userId, email: String(brut.email ?? '') } : null;
  } catch {
    return null;
  }
}

export function retenirCompte(compte: CompteRetenu): void {
  try {
    localStorage.setItem(CLE_COMPTE, JSON.stringify(compte));
  } catch {
    // Pas grave : sans réseau, il faudra attendre la connexion.
  }
}

export function oublierCompte(): void {
  try {
    localStorage.removeItem(CLE_COMPTE);
  } catch {
    // Rien à faire.
  }
}

/** Le nom du business créé pour un nouveau compte, avec les données d'exemple. */
export const NOM_PREMIER_BUSINESS = 'Mon premier business';

/** Le business du compte qui porte déjà ce nom (sauf celui qu'on renomme), ou null. */
export function nomDejaPris(nom: string, liste: Business[], sauf?: string): Business | null {
  return liste.find((b) => b.id !== sauf && memeNom(b.nom, nom)) ?? null;
}

export function messageNomPris(b: Business): string {
  return `Tu as déjà un business qui s’appelle « ${b.nom} ».`;
}

/** Le compte n'a que son premier business, qui montre encore l'exemple : on l'invite à lui donner son vrai nom. */
export function premierBusinessARenommer(liste: Business[], exemple: boolean): boolean {
  return exemple && liste.length === 1 && liste[0]?.nom === NOM_PREMIER_BUSINESS;
}

/** Le business à ouvrir : celui retenu s'il existe encore, sinon le premier. */
export function businessAOuvrir(liste: Business[], retenu: string | null): Business | null {
  return liste.find((b) => b.id === retenu) ?? liste[0] ?? null;
}
