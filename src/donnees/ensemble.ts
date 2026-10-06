// Lecture de tous les business du compte d'un coup, pour la vue d'ensemble.
// Les règles de sécurité de la base ne renvoient que les lignes du compte connecté.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { DonneesBusiness } from '../calculs/ensemble';
import type { Business } from './business';
import { ligneVersVente, ligneVersVideo, type LigneVente, type LigneVideo } from './lignes';

const PAGE = 1000;

async function toutLire<T>(client: SupabaseClient, table: string, userId: string): Promise<T[]> {
  const lignes: T[] = [];
  for (let debut = 0; ; debut += PAGE) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .range(debut, debut + PAGE - 1);
    if (error) throw new Error('Impossible de lire tes business. Réessaie.');
    lignes.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return lignes;
  }
}

/** Les ventes et les vidéos de chaque business, dans l'ordre de la liste. */
export async function chargerEnsemble(client: SupabaseClient, userId: string, liste: Business[]): Promise<DonneesBusiness[]> {
  const [ventes, videos, reglages] = await Promise.all([
    toutLire<LigneVente & { business_id: string }>(client, 'ventes', userId),
    toutLire<LigneVideo & { business_id: string }>(client, 'videos', userId),
    toutLire<{ business_id: string; couverture: string | null }>(client, 'reglages', userId),
  ]);
  return liste.map((b) => ({
    id: b.id,
    nom: b.nom,
    ventes: ventes.filter((l) => l.business_id === b.id).map(ligneVersVente),
    videos: videos.filter((l) => l.business_id === b.id).map(ligneVersVideo),
    couverture: reglages.find((r) => r.business_id === b.id)?.couverture ?? null,
  }));
}
