import { qualifierChiffresVentes } from './qualiteChiffres';
import { contexteEssaisSynthetiques } from './essais';
import { recupererSansRedirection } from './redirections';
import { entetesSupabaseServeur } from "./authSupabase";

// L’IA reçoit uniquement des totaux calculés ici, jamais les lignes des boutiques.
import { bornesPeriode, calculerResume, type Periode } from '../calculs/resume';
import { rythmeSemaine } from '../calculs/rythme';
import { ajouterJours, dateParis } from '../temps';
import type { Video } from '../modele';
import type { Vente } from '../ventes/modele';
import type { Recuperateur } from './commun';

export interface ConfigurationIA {
  IA_ACTIVEE?: string;
  IA_ESSAIS_ACTIVES?: string;
  IA_MODE?: string;
  IA_PLAN_VERIFIE?: string;
  IA_TRANSFERT_AUTORISE?: string;
  AI?: { run(modele: string, entree: Record<string, unknown>): Promise<unknown> };
  /** Secret serveur seulement : réserve le budget partagé, jamais utilisé dans le navigateur. */
  SUPABASE_CLE_SERVEUR?: string;
  IA_URL?: string;
  IA_MODELE?: string;
  IA_CLE?: string;
  SUPABASE_URL: string;
  SUPABASE_CLE_PUBLIQUE: string;
}
export type QuestionIA = 'priorites' | 'ventes' | 'videos' | 'frais' | 'preparation' | 'essai-synthetique';
export interface ActionAssistant {
  id: 'boutique' | 'paiement' | 'publications' | 'rythme';
  raison: string;
}
export const QUESTIONS_IA: readonly string[] = ['priorites', 'ventes', 'videos', 'frais', 'preparation', 'essai-synthetique'];
export const VERSION_CONSIGNES_ASSISTANT = '2026-10-07-zero-connu-null-remboursement-v1';
export async function empreinteContexteAssistant(sujet: QuestionIA, donnees: unknown): Promise<string> {
  const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ versionConsignes: VERSION_CONSIGNES_ASSISTANT, sujet, donnees })));
  return Array.from(new Uint8Array(octets), (octet) => octet.toString(16).padStart(2, '0')).join('');
}
export const MODELE_CLOUDFLARE_GRATUIT = '@cf/meta/llama-3.1-8b-instruct-fp8';
export const MODELE_GROQ_GRATUIT = 'openai/gpt-oss-120b';
const URL_GROQ_GRATUIT = 'https://api.groq.com/openai/v1/chat/completions';
export function etatAssistantGratuit(env: ConfigurationIA): { disponible: boolean; mode: 'cloudflare-gratuit' | 'groq-gratuit'; raison: string } {
  const mode = env.IA_MODE === 'groq-gratuit' ? 'groq-gratuit' : 'cloudflare-gratuit';
  let raison: string | null = null;
  if (env.IA_ACTIVEE !== 'oui') raison = 'L’IA cloud est désactivée : le budget d’appels payants est fixé à zéro.';
  else if (!['cloudflare-gratuit', 'groq-gratuit'].includes(env.IA_MODE ?? '')) raison = 'Aucun fournisseur gratuit autorisé n’est configuré. Les appels payants sont désactivés.';
  else if (env.IA_PLAN_VERIFIE !== 'free') raison = 'Le plan gratuit du fournisseur doit être vérifié avant toute activation.';
  else if (mode === 'cloudflare-gratuit' && !env.AI) raison = 'Le lien Workers AI n’est pas encore configuré.';
  else if (mode === 'groq-gratuit' && !env.IA_CLE?.trim()) raison = 'La clé serveur Groq n’est pas encore configurée.';
  else if (mode === 'groq-gratuit' && env.IA_TRANSFERT_AUTORISE !== 'oui') raison = 'Le transfert des agrégats vers Groq doit être autorisé avant activation.';
  else if (!env.SUPABASE_CLE_SERVEUR) raison = 'Le budget partagé gratuit n’est pas encore configuré sur le serveur.';
  else if (env.IA_MODELE && env.IA_MODELE !== (mode === 'groq-gratuit' ? MODELE_GROQ_GRATUIT : MODELE_CLOUDFLARE_GRATUIT)) raison = 'Ce modèle n’est pas autorisé dans le mode gratuit.';
  return { disponible: raison === null, mode,
    raison: raison ?? (mode === 'groq-gratuit' ? 'IA Groq gratuite configurée. La disponibilité reste soumise aux quotas du fournisseur.' : 'IA Cloudflare gratuite configurée. La disponibilité reste soumise au quota quotidien.') };
}
const PAGE = 500;
const LIGNES_MAX = 10_000;
const DELAI_MAX_MS = 25_000;
export type LimiteurAssistant = (userId: string, businessId: string) => boolean;
/** Frein local à un isolate Worker ; un quota fournisseur reste nécessaire pour plafonner le coût global. */
export function creerLimiteurAssistant(horloge: () => number = Date.now): LimiteurAssistant {
  const demandes = new Map<string, number>();
  return (userId, businessId) => {
    const maintenant = horloge();
    for (const [cle, date] of demandes) if (maintenant - date >= 60_000) demandes.delete(cle);
    const cle = `${userId}|${businessId}`;
    if (demandes.has(cle) || demandes.size >= 1000) return false;
    demandes.set(cle, maintenant);
    return true;
  };
}
export const limiteurAssistant = creerLimiteurAssistant();
export class ErreurAssistant extends Error {
  constructor(public readonly statut: number, message: string) { super(message); }
}

const indisponible = () => new ErreurAssistant(503, 'L’assistant ne répond pas. Réessaie dans un moment.');

/** Même une réponse du fournisseur reste une entrée non fiable et bornée en octets. */
async function lireJSON(reponse: Response, maximum = 1_048_576): Promise<unknown> {
  if (!reponse.ok || !reponse.body) throw indisponible();
  const lecteur = reponse.body.getReader();
  const decodeur = new TextDecoder();
  let taille = 0;
  let texte = '';
  try {
    for (;;) {
      const { done, value } = await lecteur.read();
      if (done) break;
      taille += value.byteLength;
      if (taille > maximum) {
        await lecteur.cancel().catch(() => undefined);
        throw indisponible();
      }
      texte += decodeur.decode(value, { stream: true });
    }
    return JSON.parse(texte + decodeur.decode()) as unknown;
  } finally {
    lecteur.releaseLock();
  }
}

function objet(valeur: unknown): Record<string, unknown> {
  if (!valeur || typeof valeur !== 'object' || Array.isArray(valeur)) throw indisponible();
  return valeur as Record<string, unknown>;
}
function entier(valeur: unknown): number {
  if (typeof valeur !== 'number' || !Number.isSafeInteger(valeur) || valeur < 0) throw indisponible();
  return valeur;
}
function instant(valeur: unknown): string {
  if (typeof valeur !== 'string' || Number.isNaN(Date.parse(valeur))) throw indisponible();
  return valeur;
}

export async function analyserBusiness(
  env: ConfigurationIA, jeton: string, userId: string, businessId: string,
  periode: Periode, question: QuestionIA, recuperer: Recuperateur, maintenant = new Date(),
  limiter: LimiteurAssistant = limiteurAssistant,
  empreinteConnue?: string | null,
): Promise<{ texte: string; genereLe: string; modele: string; avertissement: string; actions: ActionAssistant[]; empreinte: string; inchange?: boolean }> {
  const synthetique = question === 'essai-synthetique';
  if (synthetique && env.IA_ESSAIS_ACTIVES !== 'oui') throw new ErreurAssistant(403, 'Les essais synthétiques sont désactivés sur le serveur.');
  if (env.IA_ACTIVEE !== 'oui') {
    throw new ErreurAssistant(503, 'L’IA distante est désactivée : le budget d’appels payants est fixé à zéro.');
  }
  const etat = etatAssistantGratuit(env);
  if (!etat.disponible) throw new ErreurAssistant(503, etat.raison);
  const cloudflare = env.IA_MODE === 'cloudflare-gratuit';
  const controleur = new AbortController();
  const minuteur = setTimeout(() => controleur.abort(), DELAI_MAX_MS);
  const recuperateurInitial = recuperer;
  recuperer = (entree, init) => recupererSansRedirection(entree, init, recuperateurInitial);
  const headers = jeton === env.SUPABASE_CLE_SERVEUR
    ? entetesSupabaseServeur(jeton)
    : { apikey: env.SUPABASE_CLE_PUBLIQUE, Authorization: `Bearer ${jeton}` };
  const filtre = { user_id: `eq.${userId}`, business_id: `eq.${businessId}` };
  const base = (table: string, parametres: Record<string, string>) => recuperer(
    `${env.SUPABASE_URL}/rest/v1/${table}?${new URLSearchParams(parametres)}`,
    { headers, signal: controleur.signal },
  );
  try {
    const business = await lireJSON(await base('business', { user_id: filtre.user_id, id: `eq.${businessId}`, select: 'id', limit: '1' }));
    if (!Array.isArray(business)) throw indisponible();
    if (business.length !== 1 || objet(business[0]).id !== businessId) {
      throw new ErreurAssistant(403, 'Ce business n’est pas accessible depuis ton compte.');
    }
    if (!limiter(userId, businessId)) throw new ErreurAssistant(429, 'Attends une minute avant une nouvelle analyse de ce business.');

    const lireDonneesReelles = async () => {
      // Un jour de marge couvre le décalage UTC/Paris. Les calculs retirent ensuite cette marge.
      const debut = ajouterJours(bornesPeriode(periode, dateParis(maintenant)).debut, -1);
      const debutVideos = ajouterJours(dateParis(maintenant), -7);
      const lireTable = async (table: string, select: string, ordre: string, depuis: string): Promise<Record<string, unknown>[]> => {
        const lignes: Record<string, unknown>[] = [];
        for (let offset = 0; offset <= LIGNES_MAX; offset += PAGE) {
          const lot = await lireJSON(await base(table, { ...filtre, select, order: ordre,
            instant: `gte.${depuis}T00:00:00Z`, limit: String(PAGE), offset: String(offset) }));
          if (!Array.isArray(lot)) throw indisponible();
          if (lignes.length + lot.length > LIGNES_MAX) {
            throw new ErreurAssistant(503, 'Trop de lignes pour cette analyse (limite de 10 000 par type de données). Choisis une période plus courte.');
          }
          lignes.push(...lot.map(objet));
          if (lot.length < PAGE) return lignes;
        }
        throw indisponible();
      };
      const [lignesVentes, lignesVideos, reglages, comptesRelies] = await Promise.all([
        lireTable('ventes', 'plateforme,instant,montant_centimes,frais_centimes,tva_centimes,rembourse', 'instant.asc,plateforme.asc,numero_commande.asc', debut),
        lireTable('videos', 'instant,reseau,vues', 'instant.asc,id.asc', debutVideos),
        base('reglages', { ...filtre, select: 'objectif_par_jour,couverture', limit: '1' }).then(lireJSON),
        // Facultatif : une ancienne base peut ne pas proposer les comptes reliés.
        base('comptes_relies', { ...filtre, select: 'source,derniere_synchro,derniere_erreur', limit: '100' }).then(lireJSON).catch(() => null),
      ]);
      if (!Array.isArray(reglages) || reglages.length > 1) throw indisponible();
      const reglage = reglages[0] === undefined ? null : objet(reglages[0]);
      const objectif = reglage ? entier(reglage.objectif_par_jour) : null;
      const couverture = reglage?.couverture == null ? null : instant(reglage.couverture);
      const ventes: Vente[] = lignesVentes.map((ligne) => {
        if (typeof ligne.plateforme !== 'string' || typeof ligne.rembourse !== 'boolean') throw indisponible();
        return {
          plateforme: ligne.plateforme, instant: instant(ligne.instant), montantCentimes: entier(ligne.montant_centimes),
          fraisCentimes: ligne.frais_centimes === null ? null : entier(ligne.frais_centimes),
          ...(ligne.tva_centimes == null ? {} : { tvaCentimes: entier(ligne.tva_centimes) }),
          rembourse: ligne.rembourse, produit: '', numeroCommande: '',
        };
      }).filter((vente) => !vente.plateforme.endsWith('-test'));
      const videos: Video[] = lignesVideos.map((ligne) => {
        if (ligne.reseau !== 'tiktok' && ligne.reseau !== 'instagram') throw indisponible();
        return { id: '', instant: instant(ligne.instant), reseau: ligne.reseau,
          ...(ligne.vues == null ? {} : { vues: entier(ligne.vues) }) };
      });
      const semaine = rythmeSemaine(videos, objectif ?? 0, maintenant);
      const resume = calculerResume(ventes, periode, maintenant);
      const donnees = {
        qualiteChiffres: qualifierChiffresVentes(resume, couverture, ventes),
        resume,
        jourParis: dateParis(maintenant),
        resumeJour: {
          ...calculerResume(ventes.filter((vente) => dateParis(new Date(vente.instant)) === dateParis(maintenant)), '7j', maintenant),
          periode: 'jour', debut: dateParis(maintenant), fin: dateParis(maintenant),
        },
        rythme: { publiees: semaine.publiees, objectif: objectif === null ? null : semaine.objectif },
        videos: {
          debut: ajouterJours(dateParis(maintenant), -6), fin: dateParis(maintenant),
          parReseau: (['tiktok', 'instagram'] as const).map((reseau) => {
            const liste = videos.filter((video) => video.reseau === reseau && dateParis(new Date(video.instant)) >= ajouterJours(dateParis(maintenant), -6)
              && dateParis(new Date(video.instant)) <= dateParis(maintenant));
            return { reseau, publiees: liste.length,
              vuesConnues: liste.reduce((total, video) => total + (video.vues ?? 0), 0),
              videosSansVues: liste.filter((video) => video.vues === undefined).length };
          }),
          precision: 'Les vues sont le cumul connu des vidéos publiées dans cette fenêtre ; elles ne sont pas les vues gagnées pendant la fenêtre.',
        },
        couvertureVentes: couverture,
        sources: Array.isArray(comptesRelies) ? comptesRelies.map((valeur) => {
          const ligne = objet(valeur);
          if (!['stripe', 'lemonsqueezy', 'tiktok', 'instagram', 'shopify'].includes(String(ligne.source))) throw indisponible();
          return { source: ligne.source, derniereSynchro: ligne.derniere_synchro == null ? null : instant(ligne.derniere_synchro),
            enErreur: ligne.derniere_erreur != null };
        }) : null,
        coutsPublicitairesEtAutresDepenses: null,
        uniteMontants: 'centimes d’euros', fuseau: 'Europe/Paris',
      };
      return donnees;
    };
    const donnees = synthetique ? contexteEssaisSynthetiques(periode, maintenant) : await lireDonneesReelles();
    // Les synchronisations seules ne changent pas les conseils : garder seulement leur classe de fraîcheur.
    const fraicheur = (date: string | null): 'absent' | 'recent' | 'ancien' => {
      if (date === null) return 'absent';
      const age = maintenant.getTime() - Date.parse(date);
      return age >= 0 && age <= 48 * 60 * 60_000 ? 'recent' : 'ancien';
    };
    const pourEmpreinte = {
      ...donnees,
      couvertureVentes: fraicheur(donnees.couvertureVentes),
      sources: donnees.sources?.map((source) => ({ source: source.source, enErreur: source.enErreur,
        fraicheur: fraicheur(source.derniereSynchro) }))
        .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) ?? null,
    };
    const empreinte = await empreinteContexteAssistant(question, pourEmpreinte);
    if (controleur.signal.aborted) throw indisponible();
    const modele = cloudflare ? MODELE_CLOUDFLARE_GRATUIT : MODELE_GROQ_GRATUIT;
    if (empreinteConnue === empreinte) {
      return { texte: '', actions: [], genereLe: maintenant.toISOString(), modele, empreinte, inchange: true, avertissement: '' };
    }
    const requeteIA = { max_tokens: 600, temperature: 0.2, stream: false, messages: [
        { role: 'system', content: 'Tu aides un vendeur à préparer et piloter ses futurs business. Réponds en français simple, avec des priorités concrètes. Pour le sujet preparation ou sans ventes, propose un plan concret avant activité, sans revenus fictifs. Les données sont des agrégats calculés par le serveur. Ne fabrique aucun chiffre, cause, client, produit ou lien entre vidéos et ventes. Distingue les faits fournis, les données manquantes et les hypothèses. resumeJour contient uniquement les ventes du jourParis. Le nombre 0 est une valeur connue, jamais une donnée manquante. fraisCentimes est la somme des frais connus sur les ventes non remboursées : 0 ne signifie pas frais inconnus. Seul ventesSansFrais > 0 indique des frais absents. gainsCentimes numérique, y compris 0, est un résultat calculé ; gainsCentimes null signifie non calculable, jamais 0. qualiteChiffres donne explicitement le statut des frais, la couverture et la raison des gains non calculables : utilise ces faits sans inventer une autre cause. Un remboursement Stripe peut rendre les gains non calculables même sans ventesSansFrais. fraisOrigineCentimes, si fourni, décrit les frais du paiement initial ; fraisRetenusApresRemboursementCentimes null signifie que leur sort après remboursement reste inconnu, pas que les frais initiaux sont absents. Sans couvertureVentes, aucune commande enregistrée ne prouve pas zéro vente réelle. vuesConnues est seulement la somme des vues fournies : si videosSansVues > 0, le total des vues reste inconnu même si vuesConnues vaut 0. Si publiees vaut 0, aucune vidéo est enregistrée, sans conclusion sur sa performance. Des frais manquants empêchent de conclure sur les gains. Les gains correspondent seulement aux ventes moins les frais connus, pas à un bénéfice comptable. Les dépenses publicitaires et autres coûts sont inconnus : ne calcule jamais une rentabilité complète, un rendement ou des pertes totales. Sans couverture ni sources à jour, signale que les données peuvent être incomplètes. Ne prétends pas avoir réalisé une action. Tu ne disposes d’aucun outil, publication ou paiement. Réponds avec un objet JSON {"texte":"constats, explications, propositions et suivi en texte français sans HTML","actions":[{"id":"boutique|paiement|publications|rythme","raison":"raison concrète en 300 caractères maximum"}]}. Propose au maximum quatre actions, une par id. boutique signifie vérifier la liaison boutique ; paiement signifie vérifier les frais et les mouvements existants, jamais payer ; publications signifie consulter les vidéos ; rythme signifie revoir l’objectif de publication. Ces actions proposent seulement d’ouvrir les écrans existants. actions peut être vide.' },
        { role: 'user', content: JSON.stringify({ sujet: question, donnees, ...(synthetique ? { consigneEssai: 'Compare séparément les trois cas SYNTHÉTIQUES. Identifie faits, frais manquants, gains inconnus après remboursement et actions prudentes. Aucun chiffre ne décrit une activité réelle. Réponds en JSON et signale ESSAI SYNTHÉTIQUE.' } : {}) }) },
      ] };
    if (new TextEncoder().encode(JSON.stringify(requeteIA)).byteLength > 12_000) {
      throw new ErreurAssistant(503, 'Le contexte est trop volumineux pour une analyse gratuite.');
    }
    let message: Record<string, unknown>;
    {
      const reservation = await recuperer(`${env.SUPABASE_URL}/rest/v1/rpc/reserver_analyse_assistant`, {
        method: 'POST', signal: controleur.signal,
        headers: { ...entetesSupabaseServeur(env.SUPABASE_CLE_SERVEUR!), 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_jour: maintenant.toISOString().slice(0, 10), p_user_id: userId, p_business_id: businessId }),
      });
      const reserve = await lireJSON(reservation, 1024);
      if (reserve === false) throw new ErreurAssistant(429, 'Le quota gratuit d’analyses du jour est atteint. Réessaie demain.');
      if (reserve !== true) throw indisponible();
    }
    if (controleur.signal.aborted) throw indisponible();
    if (cloudflare) {
      let surAnnulation: () => void = () => undefined;
      try {
        const attente = new Promise<never>((_fin, refuser) => {
          surAnnulation = () => refuser(indisponible());
          if (controleur.signal.aborted) surAnnulation();
          else controleur.signal.addEventListener('abort', surAnnulation, { once: true });
        });
        const resultat = objet(await Promise.race([env.AI!.run(modele, requeteIA), attente]));
        if (resultat.tool_calls || resultat.function_call) throw indisponible();
        message = { content: resultat.response };
      } catch (e) {
        // 3036 = allocation quotidienne épuisée ; 3040 = capacité temporairement indisponible.
        const erreur = e && typeof e === 'object' ? e as { status?: unknown; code?: unknown; message?: unknown } : null;
        if (erreur?.code === 3036 || (typeof erreur?.message === 'string' && /\b3036\b/.test(erreur.message))) {
          throw new ErreurAssistant(429, 'Le quota gratuit Workers AI est atteint. Aucun service payant n’est utilisé. Réessaie demain.');
        }
        if (erreur?.status === 429 || erreur?.code === 3040) {
          throw new ErreurAssistant(429, 'Workers AI est temporairement occupé. Réessaie dans un moment : aucun service payant n’est utilisé.');
        }
        throw e;
      } finally {
        controleur.signal.removeEventListener('abort', surAnnulation);
      }
    } else {
      const reponse = await recuperer(URL_GROQ_GRATUIT, {
        method: 'POST', signal: controleur.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.IA_CLE}` },
        body: JSON.stringify({ model: modele, messages: requeteIA.messages, temperature: requeteIA.temperature, stream: false, max_completion_tokens: 1800, reasoning_effort: "low", include_reasoning: false, response_format: { type: "json_object" } }),
      });
      if (reponse.status === 429) {
        throw new ErreurAssistant(429, 'Le quota gratuit Groq est atteint. Aucun autre fournisseur n’est utilisé. Réessaie plus tard.');
      }
      if (!reponse.ok) throw new ErreurAssistant(503, `Le fournisseur Groq a refusé l’analyse (statut HTTP ${reponse.status}). Aucun détail privé n’est affiché.`);
      let resultat: Record<string, unknown>;
      try { resultat = objet(await lireJSON(reponse, 65_536)); }
      catch { throw new ErreurAssistant(503, 'Le fournisseur a renvoyé une réponse illisible (JSON invalide).'); }
      const choix = resultat.choices;
      if (!Array.isArray(choix) || !choix[0]) throw indisponible();
      const completion = objet(choix[0]);
      if (completion.finish_reason === 'length') throw new ErreurAssistant(503, 'L’analyse a été interrompue : sortie trop courte pour fournir une réponse complète. Réessaie plus tard.');
      message = objet(completion.message);
    }
    const contenu = message.content;
    if (typeof contenu !== 'string' || !contenu.trim()) throw new ErreurAssistant(503, 'Le modèle n’a fourni aucun texte : contenu absent.');
    if (contenu.length > 12_000 || message.tool_calls || message.function_call) throw indisponible();
    let texte = contenu.trim();
    let actions: ActionAssistant[] = [];
    const sansBloc = texte.replace(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/, '$1').trim();
    if (sansBloc.startsWith('{')) {
      let structure: Record<string, unknown>;
      try { structure = objet(JSON.parse(sansBloc)); }
      catch { throw new ErreurAssistant(503, 'Le modèle a fourni une réponse illisible (JSON invalide).'); }
      if (typeof structure.texte !== 'string' || !structure.texte.trim() || structure.texte.length > 12_000) throw indisponible();
      texte = structure.texte.trim();
      if (structure.actions !== undefined) {
        if (!Array.isArray(structure.actions) || structure.actions.length > 4) throw indisponible();
        const ids = new Set<string>();
        actions = structure.actions.map((valeur) => {
          const action = objet(valeur);
          if (typeof action.id !== 'string' || !['boutique', 'paiement', 'publications', 'rythme'].includes(action.id)
            || ids.has(action.id) || typeof action.raison !== 'string' || !action.raison.trim() || action.raison.length > 300) throw indisponible();
          ids.add(action.id);
          return { id: action.id as ActionAssistant['id'], raison: action.raison.trim() };
        });
      }
    }
    return {
      texte: synthetique ? "ESSAI SYNTHÉTIQUE — aucun chiffre réel. " + texte : texte, actions, genereLe: maintenant.toISOString(), modele, empreinte,
      avertissement: 'Cette réponse de l’IA peut contenir des erreurs et des hypothèses. Vérifie les conseils avec les chiffres de l’application avant de décider.',
    };
  } catch (e) {
    if (e instanceof ErreurAssistant) throw e;
    throw indisponible();
  } finally {
    clearTimeout(minuteur);
  }
}
