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

/**
 * Les données d'un business du compte connecté, dans la base Supabase.
 * Les règles de sécurité limitent tout au propriétaire ; chaque ligne porte le business auquel elle appartient.
 */
export class DepotSupabase implements Depot {
  constructor(
    private readonly client: SupabaseClient,
    private readonly userId: string,
    private readonly businessId: string,
  ) {}

  private async toutLire<T>(table: string): Promise<T[]> {
    const lignes: T[] = [];
    for (let debut = 0; ; debut += PAGE) {
      const { data, error } = await this.client
        .from(table)
        .select('*')
        .eq('user_id', this.userId)
        .eq('business_id', this.businessId)
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
    const bid = this.businessId;
    const avecBusiness = <T extends object>(ligne: T) => ({ ...ligne, business_id: bid });

    // D'abord les ajouts et les modifications : si la base en refuse un, rien n'a encore été supprimé.
    for (const lot of paquets(c.ventes.enregistrer.map((v) => avecBusiness(venteVersLigne(v, uid))), PAQUET)) {
      const { error } = await this.client.from('ventes').upsert(lot, { onConflict: 'user_id,business_id,plateforme,numero_commande' });
      verifier(error);
    }
    for (const lot of paquets(c.videos.enregistrer.map((v) => avecBusiness(videoVersLigne(v, uid))), PAQUET)) {
      const { error } = await this.client.from('videos').upsert(lot, { onConflict: 'user_id,business_id,id' });
      verifier(error);
    }
    for (const lot of paquets(c.etatsAlertes.enregistrer.map((e) => avecBusiness(etatVersLigne(e.id, e.etat, uid))), PAQUET)) {
      const { error } = await this.client.from('etats_alertes').upsert(lot, { onConflict: 'user_id,business_id,alerte_id' });
      verifier(error);
    }
    // … puis les suppressions (utiles pour la restauration d'une sauvegarde). Les deux listes ne se recoupent pas.
    const parPlateforme = new Map<string, string[]>();
    for (const v of c.ventes.supprimer) parPlateforme.set(v.plateforme, [...(parPlateforme.get(v.plateforme) ?? []), v.numeroCommande]);
    for (const [plateforme, numeros] of parPlateforme) {
      for (const lot of paquets(numeros, 200)) {
        const { error } = await this.client.from('ventes').delete().eq('user_id', uid).eq('business_id', bid).eq('plateforme', plateforme).in('numero_commande', lot);
        verifier(error);
      }
    }
    for (const lot of paquets(c.videos.supprimer, 200)) {
      const { error } = await this.client.from('videos').delete().eq('user_id', uid).eq('business_id', bid).in('id', lot);
      verifier(error);
    }
    for (const lot of paquets(c.etatsAlertes.supprimer, 200)) {
      const { error } = await this.client.from('etats_alertes').delete().eq('user_id', uid).eq('business_id', bid).in('alerte_id', lot);
      verifier(error);
    }

    if (c.reglages) {
      const { error } = await this.client
        .from('reglages')
        .upsert(avecBusiness(reglagesVersLigne(c.reglages, uid)), { onConflict: 'user_id,business_id' });
      verifier(error);
    }
  }
}
