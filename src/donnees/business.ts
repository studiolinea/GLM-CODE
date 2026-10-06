// Les business du compte connecté : chacun a ses ventes, ses vidéos, ses voyants et ses comptes reliés.

import type { SupabaseClient } from '@supabase/supabase-js';

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
  if (error) throw new Error('Impossible de lire tes business. Réessaie.');
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
    await client
      .from('reglages')
      .upsert(
        { user_id: userId, business_id: data.id, objectif_par_jour: 1, couverture: null, exemple_termine: true },
        { onConflict: 'user_id,business_id' },
      );
  }
  return data as Business;
}

export async function renommerBusiness(client: SupabaseClient, id: string, nom: string): Promise<void> {
  const propre = nomValide(nom);
  if (!propre) throw new Error(`Donne un nom à ton business (${NOM_MAX} caractères au plus).`);
  const { error } = await client.from('business').update({ nom: propre }).eq('id', id);
  if (error) throw new Error('Impossible de renommer ce business. Réessaie.');
}

// Le business ouvert en dernier, retenu sur l'appareil.
const cleChoix = (userId: string) => `pilotage:business:${userId}`;

export function businessRetenu(userId: string): string | null {
  try {
    return localStorage.getItem(cleChoix(userId));
  } catch {
    return null;
  }
}

export function retenirBusiness(userId: string, id: string): void {
  try {
    localStorage.setItem(cleChoix(userId), id);
  } catch {
    // Pas grave : on rouvrira le premier business.
  }
}

/** Le business à ouvrir : celui retenu s'il existe encore, sinon le premier. */
export function businessAOuvrir(liste: Business[], retenu: string | null): Business | null {
  return liste.find((b) => b.id === retenu) ?? liste[0] ?? null;
}
