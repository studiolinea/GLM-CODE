// Lecture de tous les business du compte d'un coup, pour la vue d'ensemble.
// Les règles de sécurité de la base ne renvoient que les lignes du compte connecté.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DonneesBusiness } from '../calculs/ensemble';
import type { Business } from './business';
import { BOUTIQUES } from './comptesRelies';
import { ligneVersVente, ligneVersVideo, type LigneVente, type LigneVideo } from './lignes';

const PAGE = 1000;

async function toutLire<T>(client: SupabaseClient, table: string, userId: string, colonnes = '*'): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await client
      .from(table)
      .select(colonnes)
      .eq('user_id', userId)
      .range(debut, debut + PAGE - 1);
    if (error) throw new Error('Impossible de lire tes business. Réessaie.');
    lignes.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return lignes;
  }
}

type LigneCompte = { business_id: string; source: string; derniere_synchro: string | null };
const estBoutique = (source: string) => (BOUTIQUES as string[]).includes(source);

/** Ce qui est relié à un business, et la plus récente des actualisations de ses comptes. */
function relies(comptes: LigneCompte[]): NonNullable<DonneesBusiness['relies']> {
  const derniere = comptes.reduce<string | null>(
    (plus, c) => (c.derniere_synchro && (!plus || Date.parse(c.derniere_synchro) > Date.parse(plus)) ? c.derniere_synchro : plus),
    null,
  );
  return {
    boutique: comptes.some((c) => estBoutique(c.source)),
    reseau: comptes.some((c) => c.source === 'tiktok' || c.source === 'instagram'),
    derniereSynchro: derniere,
  };
}

/** Les ventes et les vidéos de chaque business, dans l'ordre de la liste, avec ce qui y est relié. */
export async function chargerEnsemble(client: SupabaseClient, userId: string, liste: Business[]): Promise<DonneesBusiness[]> {
  const [ventes, videos, reglages, comptes] = await Promise.all([
    toutLire<LigneVente & { business_id: string }>(client, 'ventes', userId),
    toutLire<LigneVideo & { business_id: string }>(client, 'videos', userId),
    toutLire<{ business_id: string; couverture: string | null; exemple_termine: boolean | null }>(client, 'reglages', userId),
    // Seulement ces colonnes : la clé chiffrée n'a rien à faire dans le navigateur.
    toutLire<LigneCompte>(client, 'comptes_relies', userId, 'business_id, source, derniere_synchro'),
  ]);
  return liste.map((b) => {
    const reglage = reglages.find((r) => r.business_id === b.id);
    return {
      id: b.id,
      nom: b.nom,
      ventes: ventes.filter((l) => l.business_id === b.id).map(ligneVersVente),
      videos: videos.filter((l) => l.business_id === b.id).map(ligneVersVideo),
      couverture: reglage?.couverture ?? null,
      relies: relies(comptes.filter((c) => c.business_id === b.id)),
      exempleTermine: reglage?.exemple_termine ?? false,
    };
  });
}
