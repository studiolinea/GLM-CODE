import type { SupabaseClient } from '@supabase/supabase-js';
import type { Changements, DonneesCompte, Depot } from './depot';
import {
  etatVersLigne,
  ligneVersReglages,
  ligneVersVente,
  ligneVersVideo,
  lignesVersEtats,
  reglagesVersLigne,
  venteVersLigne,
  videoVersLigne,
  type LigneEtatAlerte,
  type LigneReglages,
  type LigneVente,
  type LigneVideo,
} from './lignes';

const PAGE = 1000; // la base renvoie au plus 1 000 lignes par demande
const PAQUET = 500;

function paquets<T>(liste: T[], taille: number): T[][] {
  const resultat: T[][] = [];
  for (let i = 0; i < liste.length; i += taille) resultat.push(liste.slice(i, i + taille));
  return resultat;
}

function verifier(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Les données du compte connecté, dans la base Supabase. Les règles de sécurité limitent tout au propriétaire. */
export class DepotSupabase implements Depot {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
  ) {}

  private async toutLire<T>(table: string): Promise<T[]> {
    const lignes: T[] = [];
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .eq('user_id', this.userId)
        .range(debut, debut + PAGE - 1);
      verifier(error);
      lignes.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) return lignes;
    }
  }

  async charger(): Promise<DonneesCompte> {
    const [ventes, videos, etats, reglages] = await Promise.all([
      this.toutLire<LigneVente>('ventes'),
      this.toutLire<LigneVideo>('videos'),
      this.toutLire<LigneEtatAlerte>('etats_alertes'),
      this.toutLire<LigneReglages>('reglages'),
    ]);
    return {
      ventes: ventes.map(ligneVersVente),
      videos: videos.map(ligneVersVideo),
      etatsAlertes: lignesVersEtats(etats),
      reglages: reglages[0] ? ligneVersReglages(reglages[0]) : null,
    };
  }

  async appliquer(c: Changements): Promise<void> {
    const uid = this.userId;

    // D'abord les suppressions (utile pour la restauration d'une sauvegarde)…
    const parPlateforme = new Map<string, string[]>();
    for (const v of c.ventes.supprimer) parPlateforme.set(v.plateforme, [...(parPlateforme.get(v.plateforme) ?? []), v.numeroCommande]);
    for (const [plateforme, numeros] of parPlateforme) {
      for (const lot of paquets(numeros, 200)) {
        const { error } = await this.client.from('ventes').delete().eq('user_id', uid).eq('plateforme', plateforme).in('numero_commande', lot);
        verifier(error);
      }
    }
    for (const lot of paquets(c.videos.supprimer, 200)) {
      const { error } = await this.client.from('videos').delete().eq('user_id', uid).in('id', lot);
      verifier(error);
    }
    for (const lot of paquets(c.etatsAlertes.supprimer, 200)) {
      const { error } = await this.client.from('etats_alertes').delete().eq('user_id', uid).in('alerte_id', lot);
      verifier(error);
    }

    // … puis les ajouts et les modifications.
    for (const lot of paquets(c.ventes.enregistrer.map((v) => venteVersLigne(v, uid)), PAQUET)) {
      const { error } = await this.client.from('ventes').upsert(lot, { onConflict: 'user_id,plateforme,numero_commande' });
      verifier(error);
    }
    for (const lot of paquets(c.videos.enregistrer.map((v) => videoVersLigne(v, uid)), PAQUET)) {
      const { error } = await this.client.from('videos').upsert(lot, { onConflict: 'user_id,id' });
      verifier(error);
    }
    for (const lot of paquets(c.etatsAlertes.enregistrer.map((e) => etatVersLigne(e.id, e.etat, uid)), PAQUET)) {
      const { error } = await this.client.from('etats_alertes').upsert(lot, { onConflict: 'user_id,alerte_id' });
      verifier(error);
    }
    if (c.reglages) {
      const { error } = await this.client.from('reglages').upsert(reglagesVersLigne(c.reglages, uid), { onConflict: 'user_id' });
      verifier(error);
    }
  }
}
