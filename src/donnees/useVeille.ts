import type { SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReponseAssistant } from './assistant';
import { ETAPES_PREPARATION } from './preparation';
import { client } from './config';

export interface EtatVeille {
  active: boolean;
  dernier_scan: string | null;
  derniere_analyse: string | null;
  texte: string | null;
  actions: NonNullable<ReponseAssistant['actions']>;
  derniere_erreur: string | null;
  jour_quota: string | null;
  analyses_jour: number;
}
/** Seule l’autorisation active est modifiée ; résultats et quotas restent réservés au serveur. */
export async function enregistrerAutorisationVeille(base: SupabaseClient, userId: string, businessId: string, existe: boolean, active: boolean): Promise<void> {
  const requete = existe
    ? base.from('assistant_veille').update({ active }).eq('user_id', userId).eq('business_id', businessId)
    : base.from('assistant_veille').insert({ user_id: userId, business_id: businessId, active });
  let { error } = await requete;
  // Le serveur peut créer la ligne entre sa lecture et l’activation : conserver ses résultats.
  if (!existe && error?.code === '23505') {
    ({ error } = await base.from('assistant_veille').update({ active }).eq('user_id', userId).eq('business_id', businessId));
  }
  if (error) throw new Error('Impossible de modifier la veille. Réessaie.');
}
export function useVeille(businessId?: string, exemple = false) {
  const [etat, setEtat] = useState<EtatVeille | null>(null);
  const [erreur, setErreur] = useState('');
  const [occupe, setOccupe] = useState(false);
  const generation = useRef(0);
  const lire = useCallback(async () => {
    if (!client || !businessId || exemple) return;
    const courant = generation.current;
    setOccupe(true);
    try {
      const { data: session } = await client.auth.getSession();
      if (!session.session) throw new Error('Reconnecte-toi pour lire la veille.');
      const { data, error } = await client.from('assistant_veille').select('active,dernier_scan,derniere_analyse,texte,actions,derniere_erreur,jour_quota,analyses_jour').eq('user_id', session.session.user.id).eq('business_id', businessId).maybeSingle();
      if (error) throw new Error('La veille n’est pas encore disponible. La lecture locale reste accessible.');
      if (generation.current === courant) { setEtat(data ? { ...data, actions: Array.isArray(data.actions) ? data.actions.filter((action: unknown): action is EtatVeille['actions'][number] => {
        if (!action || typeof action !== 'object') return false;
        const a = action as { id?: unknown; raison?: unknown };
        return typeof a.id === 'string' && (ETAPES_PREPARATION as readonly string[]).includes(a.id) && typeof a.raison === 'string' && a.raison.length <= 300;
      }).slice(0, 4) : [] } as EtatVeille : null); setErreur(''); }
    } catch (e) {
      if (generation.current === courant) setErreur(e instanceof Error ? e.message : 'Impossible de lire la veille.');
    } finally { if (generation.current === courant) setOccupe(false); }
  }, [businessId, exemple]);
  useEffect(() => {
    generation.current++;
    setEtat(null); setErreur(''); setOccupe(false);
    void lire();
    return () => { generation.current++; };
  }, [lire]);
  const activer = async (active: boolean) => {
    if (!client || !businessId || exemple || occupe) return;
    const courant = generation.current;
    setOccupe(true);
    try {
      const { data: session } = await client.auth.getSession();
      if (!session.session) throw new Error('Reconnecte-toi pour régler la veille.');
      const userId = session.session.user.id;
      await enregistrerAutorisationVeille(client, userId, businessId, !!etat, active);
      if (generation.current === courant) await lire();
    } catch (e) {
      if (generation.current === courant) setErreur(e instanceof Error ? e.message : 'Impossible de modifier la veille.');
    } finally { if (generation.current === courant) setOccupe(false); }
  };
  return { etat, erreur, occupe, lire, activer };
}
