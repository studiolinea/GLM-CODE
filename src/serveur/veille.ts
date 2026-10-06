import { recupererSansRedirection } from './redirections';
import { analyserBusiness, etatAssistantGratuit, type ConfigurationIA } from './assistant';
import { entetesSupabaseServeur } from './authSupabase';
import { chiffrer, dechiffrer } from './chiffrement';
import type { Recuperateur } from './commun';
import { connecteurStripe } from './stripe';
import { connecteurLemonSqueezy } from './lemonsqueezy';
import { jetonsValables, toutesLesVideos, videosVersVideos, type JetonsTikTok } from './tiktok';
import { venteVersLigne, videoVersLigne } from '../donnees/lignes';
import { identifiantPublicationTikTok } from '../calculs/publication';

export interface ConfigurationVeille extends ConfigurationIA {
  VEILLE_ACTIVEE?: string;
  CLE_CHIFFREMENT?: string;
  TIKTOK_CLIENT_KEY?: string;
  TIKTOK_CLIENT_SECRET?: string;
}
interface AutorisationVeille {
  user_id: string;
  business_id: string;
  prochain_scan: string;
  empreinte: string | null;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Cette clé privilégiée ne passe que dans le Worker planifié, jamais dans les réponses ou le navigateur. */
function base(env: ConfigurationVeille, recuperer: Recuperateur, table: string, parametres: Record<string, string>, init: RequestInit = {}) {
  return recuperer(`${env.SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(parametres)}`, {
    ...init, headers: { ...entetesSupabaseServeur(env.SUPABASE_CLE_SERVEUR!),
      'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}
async function verifier(reponse: Response): Promise<void> {
  if (!reponse.ok) throw new Error('La base n’a pas confirmé l’enregistrement de la veille.');
}

/** Relève seulement les comptes du business ayant autorisé la veille. Les ventes test sont exclues. */
export async function synchroniserSourcesVeille(env: ConfigurationVeille, job: AutorisationVeille, recuperer: Recuperateur, maintenant: Date): Promise<void> {
  const filtre = { user_id: `eq.${job.user_id}`, business_id: `eq.${job.business_id}` };
  const lecture = await base(env, recuperer, 'comptes_relies', { ...filtre, select: 'source,identifiant,cle_chiffree', limit: '21' });
  await verifier(lecture);
  const comptes = await lecture.json() as { source: string; identifiant: string; cle_chiffree: string }[];
  if (!Array.isArray(comptes) || comptes.length > 20) throw new Error('Trop de comptes pour un passage de la veille.');
  let couverture = false;
  let donneesReelles = false;
  for (const compte of comptes) {
    if (!env.CLE_CHIFFREMENT) throw new Error('La veille ne peut pas lire les comptes : chiffrement non configuré.');
    const contexte = `${job.user_id}|${job.business_id}|${compte.source}|${compte.identifiant}`;
    const cle = await dechiffrer(compte.cle_chiffree, env.CLE_CHIFFREMENT, contexte);
    if (compte.source === 'stripe' || compte.source === 'lemonsqueezy') {
      const connecteur = compte.source === 'stripe' ? connecteurStripe : connecteurLemonSqueezy;
      const lues = await connecteur.lireVentes(cle, recuperer);
      if (lues.ignorees.some((vente) => !/non abouti|non payée/.test(vente.raison))) {
        throw new Error('Des ventes ont été écartées par la boutique. Vérifie les comptes reliés avant de conclure.');
      }
      const reelles = lues.ventes.filter((vente) => !vente.plateforme.endsWith('-test'));
      // Un compte exclusivement test ne prouve pas la couverture des ventes réelles.
      if (lues.ventes.length === 0 || reelles.length > 0) couverture = true;
      if (reelles.length > 0) donneesReelles = true;
      for (let debut = 0; debut < reelles.length; debut += 500) {
        await verifier(await base(env, recuperer, 'ventes', { on_conflict: 'user_id,business_id,plateforme,numero_commande' }, {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(reelles.slice(debut, debut + 500).map((vente) => ({ ...venteVersLigne(vente, job.user_id), business_id: job.business_id }))),
        }));
      }
    } else if (compte.source === 'tiktok') {
      if (!env.TIKTOK_CLIENT_KEY || !env.TIKTOK_CLIENT_SECRET) throw new Error('La lecture TikTok de la veille n’est pas configurée.');
      const valables = await jetonsValables(JSON.parse(cle) as JetonsTikTok,
        { clientKey: env.TIKTOK_CLIENT_KEY, clientSecret: env.TIKTOK_CLIENT_SECRET }, recuperer);
      if (valables.renouveles) {
        await verifier(await base(env, recuperer, 'comptes_relies', { ...filtre, source: 'eq.tiktok', identifiant: `eq.${compte.identifiant}` }, {
          method: 'PATCH', body: JSON.stringify({ cle_chiffree: await chiffrer(JSON.stringify(valables.jetons), env.CLE_CHIFFREMENT, contexte) }),
        }));
      }
      const videos = videosVersVideos(await toutesLesVideos(valables.jetons.acces, recuperer));
      const existantes = await base(env, recuperer, 'videos', { ...filtre, reseau: 'eq.tiktok', select: 'id,lien,reseau', order: 'id.asc', limit: '1001' });
      await verifier(existantes);
      const anciennes = await existantes.json() as { id: string; lien?: string; reseau: 'tiktok' }[];
      if (!Array.isArray(anciennes) || anciennes.length > 1000) throw new Error('Trop de vidéos pour vérifier les doublons dans ce passage.');
      const doublons = anciennes.filter((ancienne) => {
        const identifiant = identifiantPublicationTikTok(ancienne);
        return identifiant && videos.some((video) => video.id !== ancienne.id && identifiantPublicationTikTok(video) === identifiant);
      }).map((video) => video.id);
      if (videos.length > 0) donneesReelles = true;
      if (videos.length > 0) await verifier(await base(env, recuperer, 'videos', { on_conflict: 'user_id,business_id,id' }, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify(videos.map((video) => ({ ...videoVersLigne(video, job.user_id), business_id: job.business_id }))),
      }));
      // Supprimer seulement les mêmes publications prouvées, après confirmation de l'UPSERT API.
      if (doublons.length > 0) await verifier(await base(env, recuperer, 'videos', { ...filtre, id: `in.(${doublons.map((id) => JSON.stringify(id)).join(',')})` }, { method: 'DELETE' }));
    } else throw new Error('Cette source n’est pas encore prise en charge par la veille.');
    await verifier(await base(env, recuperer, 'comptes_relies', { ...filtre, source: `eq.${compte.source}`, identifiant: `eq.${compte.identifiant}` }, {
      method: 'PATCH', body: JSON.stringify({ derniere_synchro: maintenant.toISOString(), derniere_erreur: null }),
    }));
  }
  if (couverture || donneesReelles) await verifier(await base(env, recuperer, 'reglages', filtre, {
    method: 'PATCH', body: JSON.stringify({ ...(couverture ? { couverture: maintenant.toISOString() } : {}), ...(donneesReelles ? { exemple_termine: true } : {}) }),
  }));
}

/** Un seul business par invocation : les suivants restent en file. Aucun déclenchement via une route publique. */
export async function executerVeille(env: ConfigurationVeille, recuperer: Recuperateur, maintenant = new Date(),
  services = { synchroniser: synchroniserSourcesVeille, analyser: analyserBusiness },
): Promise<{ active: boolean; traite: boolean }> {
  if (env.VEILLE_ACTIVEE !== 'oui' || !etatAssistantGratuit(env).disponible) return { active: false, traite: false };
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), 55_000);
  let appels = 0;
  const borne: Recuperateur = (input, init) => {
    if (++appels > 45) return Promise.reject(new Error('Le passage de veille dépasse sa limite de lectures.'));
    return recupererSansRedirection(input, { ...init, signal: init?.signal ? AbortSignal.any([controleur.signal, init.signal]) : controleur.signal }, recuperer);
  };
  let job: AutorisationVeille | undefined;
  try {
    const lecture = await base(env, borne, 'assistant_veille', { active: 'eq.true', prochain_scan: `lte.${maintenant.toISOString()}`,
      select: 'user_id,business_id,prochain_scan,empreinte', order: 'prochain_scan.asc,user_id.asc,business_id.asc', limit: '1' });
    await verifier(lecture);
    const lignes = await lecture.json() as AutorisationVeille[];
    if (!Array.isArray(lignes) || lignes.length > 1) throw new Error('Autorisation de veille illisible.');
    job = lignes[0];
    if (!job) return { active: true, traite: false };
    if (!UUID.test(job.user_id) || !UUID.test(job.business_id) || !Number.isFinite(Date.parse(job.prochain_scan))) throw new Error('Autorisation de veille invalide.');
    const filtre = { user_id: `eq.${job.user_id}`, business_id: `eq.${job.business_id}` };
    // Réservation compare-and-set : deux déclencheurs ne traitent pas la même ligne.
    const reservation = await base(env, borne, 'assistant_veille', { ...filtre, active: 'eq.true', prochain_scan: `eq.${job.prochain_scan}` }, {
      method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ prochain_scan: new Date(maintenant.getTime() + 15 * 60_000).toISOString() }),
    });
    await verifier(reservation);
    const retenues = await reservation.json() as unknown[];
    if (!Array.isArray(retenues) || retenues.length !== 1) return { active: true, traite: false };
    // Le service_role ne suffit pas à autoriser un business : vérifier de nouveau son propriétaire.
    const proprietaire = await base(env, borne, 'business', { user_id: filtre.user_id, id: `eq.${job.business_id}`, select: 'id', limit: '1' });
    await verifier(proprietaire);
    const business = await proprietaire.json() as { id: string }[];
    if (!Array.isArray(business) || business.length !== 1 || business[0]?.id !== job.business_id) throw new Error('Ce business n’est plus accessible.');
    await services.synchroniser(env, job, borne, maintenant);
    const analyse = await services.analyser(env, env.SUPABASE_CLE_SERVEUR!, job.user_id, job.business_id, '7j', 'priorites', borne, maintenant, () => true, job.empreinte);
    const champs = { dernier_scan: maintenant.toISOString(), derniere_erreur: null,
      ...(!analyse.inchange ? { derniere_analyse: analyse.genereLe, texte: analyse.texte, actions: analyse.actions, empreinte: analyse.empreinte } : {}) };
    await verifier(await base(env, borne, 'assistant_veille', filtre, { method: 'PATCH', body: JSON.stringify(champs) }));
    return { active: true, traite: true };
  } catch {
    // Ne jamais garder un message provenant d'une API pouvant contenir une clé ou des données client.
    if (job && UUID.test(job.user_id) && UUID.test(job.business_id)) {
      await base(env, borne, 'assistant_veille', { user_id: `eq.${job.user_id}`, business_id: `eq.${job.business_id}` }, {
        method: 'PATCH', body: JSON.stringify({ dernier_scan: maintenant.toISOString(), derniere_erreur: 'La veille n’a pas terminé ce passage : source indisponible, quota atteint ou réglage à vérifier. Le dernier résultat est conservé.' }),
      }).catch(() => undefined);
    }
    return { active: true, traite: false };
  } finally { clearTimeout(minuteur); }
}
