import { useCallback, useEffect, useRef, useState } from 'react';
import type { Donnees, Video } from '../modele';
import type { Vente } from '../ventes/modele';
import { importerVentes, quitterExemple } from './actions';
import {
  adresseConnexionTikTok,
  avecNomCompte,
  BOUTIQUES,
  ConnexionExpiree,
  deconnecterCompte,
  listerComptes,
  MESSAGE_CONNEXION_EXPIREE,
  messageBoutiqueReliee,
  mouvementsBoutique,
  relierBoutique,
  relierTikTok,
  synchroniserBoutique,
  synchroniserTikTok,
  type CompteRelie,
  type MouvementBoutique,
  type RetourTikTok,
  type SourceBoutique,
  type SourceCompte,
} from './comptesRelies';
import type { OrigineModification } from './synchro';

export type MessageCompte = { type: 'succes' | 'erreur'; texte: string };

/** Où en est la liaison d'une boutique. Gardé ici (pas dans la carte) : le résultat reste si la fenêtre a été fermée. */
export interface Liaison {
  enCours: boolean;
  message: MessageCompte | null;
}

export interface SynchroBoutique {
  /** null tant que la liste n'est pas arrivée. */
  comptes: CompteRelie[] | null;
  enCours: boolean;
  /** Ce qui n'a pas marché à la dernière actualisation, compte par compte (« Stripe : … »), ou null. */
  erreur: string | null;
  /** Le message d'erreur de chaque compte, pour l'afficher sur sa carte dans les réglages. */
  erreursComptes: Partial<Record<SourceCompte, string>>;
  /** Vrai si la session n'a pas pu être renouvelée : il faut se reconnecter. */
  connexionExpiree: boolean;
  synchroniser: () => Promise<void>;
  /** Relie une boutique avec sa clé. Le résultat (succès ou erreur) se lit dans `liaisons`. Renvoie vrai si c'est relié. */
  relier: (source: SourceBoutique, cle: string) => Promise<boolean>;
  liaisons: Partial<Record<SourceBoutique, Liaison>>;
  deconnecter: (source: SourceCompte, identifiant?: string) => Promise<void>;
  /** Les derniers mouvements d'argent de la boutique (pour vérifier les frais et la TVA). */
  mouvements: (source: SourceBoutique) => Promise<MouvementBoutique[]>;
  /** Part sur la page d'accord de TikTok ; lève une erreur avec un message clair si c'est impossible. */
  relierTikTok: () => Promise<void>;
  /** Le résultat de la liaison TikTok, au retour de la page d'accord. */
  messageTikTok: MessageCompte | null;
  effacerMessageTikTok: () => void;
  /** Les ventes que la boutique a envoyées mais que l'appli n'a pas comptées (autre devise…), avec la raison. */
  ignorees: VenteEcartee[];
  /** Les ventes du mode test reçues à la dernière actualisation, par boutique : jamais dans les vrais chiffres. */
  ventesTest: Partial<Record<SourceBoutique, Vente[]>>;
  effacerErreur: () => void;
}

export type VenteEcartee = { numero: string; raison: string };

type Modifier = (f: (d: Donnees) => Donnees, origine?: OrigineModification) => void;

/** Une vente envoyée par la boutique en mode test (plateforme « stripe-test », « lemonsqueezy-test »). */
export const estVenteTest = (v: Vente) => v.plateforme.endsWith('-test');

/** Une vente écartée qu'il faut signaler : pas les paiements qui n'ont simplement pas abouti. */
const A_SIGNALER = (i: VenteEcartee) => !/non abouti|non payée/.test(i.raison);

export interface BilanComptes {
  /** Un message par compte en erreur, avec le nom du compte (« Stripe : … »). */
  erreurs: string[];
  /** Le message de chaque compte en erreur, sans son nom (il est déjà sur la carte). */
  parCompte: Partial<Record<SourceCompte, string>>;
  /** Vrai si la session a expiré pendant la lecture. */
  expiree: boolean;
  ignorees: VenteEcartee[];
  ventesTest: Partial<Record<SourceBoutique, Vente[]>>;
}

/**
 * Lit chaque compte relié du business, l'un après l'autre. Un compte en erreur n'empêche pas les autres :
 * son message est gardé, et la lecture continue.
 */
export async function lireComptesRelies(
  businessId: string,
  liste: CompteRelie[],
  appels: {
    boutique: (business: string, source: SourceBoutique) => Promise<{ ventes: Vente[]; ignorees: VenteEcartee[]; synchroniseLe: string }>;
    tiktok: (business: string) => Promise<{ videos: Video[] }>;
  },
  modifier: Modifier,
): Promise<BilanComptes> {
  const bilan: BilanComptes = { erreurs: [], parCompte: {}, expiree: false, ignorees: [], ventesTest: {} };
  const noter = (source: SourceCompte, e: unknown) => {
    const message = e instanceof Error ? e.message : 'L’actualisation a échoué. Réessaie.';
    if (e instanceof ConnexionExpiree) bilan.expiree = true;
    bilan.parCompte[source] = message;
    bilan.erreurs.push(avecNomCompte(source, message));
  };
  for (const source of BOUTIQUES.filter((b) => liste.some((c) => c.source === b))) {
    try {
      const r = await appels.boutique(businessId, source);
      bilan.ignorees.push(...(r.ignorees ?? []).filter(A_SIGNALER));
      const tests = r.ventes.filter(estVenteTest);
      if (tests.length > 0) bilan.ventesTest[source] = tests;
      modifier((d) => appliquerVentesBoutique(d, r.ventes, r.synchroniseLe), 'ventes');
    } catch (e) {
      noter(source, e);
    }
  }
  if (liste.some((c) => c.source === 'tiktok')) {
    try {
      const r = await appels.tiktok(businessId);
      modifier((d) => appliquerVideos(d, r.videos), 'videos');
    } catch (e) {
      noter('tiktok', e);
    }
  }
  return bilan;
}

const ECART_MIN_MS = 5 * 60_000; // en revenant sur l'appli, pas plus d'une synchro toutes les 5 minutes

/**
 * Applique les ventes reçues de la boutique :
 * - les vraies ventes sont ajoutées (et font disparaître l'exemple s'il y en a) ;
 * - les ventes du mode test ne s'ajoutent qu'aux données d'exemple, jamais aux vraies données.
 */
export function appliquerVentesBoutique(d: Donnees, ventes: Vente[], synchroniseLe: string): Donnees {
  const reelles = ventes.filter((v) => !estVenteTest(v));
  const tests = ventes.filter(estVenteTest);
  let resultat = d;
  // Sans vraie vente, on ne quitte pas l'exemple ; avec de vraies données, la date « à jour » avance quand même.
  if (reelles.length > 0 || !resultat.exemple) resultat = importerVentes(resultat, reelles, synchroniseLe).donnees;
  if (tests.length > 0 && resultat.exemple) {
    resultat = importerVentes(resultat, tests, synchroniseLe, { essai: true }).donnees;
  }
  return resultat;
}

/**
 * Ajoute ou met à jour les vidéos lues sur un réseau (mêmes identifiants : les vues sont mises à jour).
 * Ce sont de vraies données : elles font disparaître l'exemple. Sans vidéo, rien ne change.
 */
export function appliquerVideos(d: Donnees, videos: Video[]): Donnees {
  if (videos.length === 0) return d;
  const base = quitterExemple(d);
  const parId = new Map(base.videos.map((v) => [v.id, v]));
  for (const v of videos) parId.set(v.id, v);
  return { ...base, videos: [...parId.values()].sort((a, b) => a.instant.localeCompare(b.instant)) };
}

const RAISONS_TIKTOK: Record<string, string> = {
  access_denied: 'Tu as refusé l’accès sur TikTok : rien n’a été relié.',
};

const messageDe = (e: unknown, defaut: string) => (e instanceof Error ? e.message : defaut);

/** Les ventes de la boutique reliée arrivent toutes seules : à l'ouverture, puis en revenant sur l'appli. */
export function useSynchroBoutique(
  modifier: Modifier,
  actif: boolean,
  retourTikTok: RetourTikTok | null = null,
  businessId: string | null = null,
): SynchroBoutique {
  const [comptes, setComptes] = useState<CompteRelie[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [erreursComptes, setErreursComptes] = useState<SynchroBoutique['erreursComptes']>({});
  const [connexionExpiree, setConnexionExpiree] = useState(false);
  const [messageTikTok, setMessageTikTok] = useState<MessageCompte | null>(null);
  const [ignorees, setIgnorees] = useState<VenteEcartee[]>([]);
  const [ventesTest, setVentesTest] = useState<SynchroBoutique['ventesTest']>({});
  const [liaisons, setLiaisons] = useState<SynchroBoutique['liaisons']>({});
  const derniere = useRef(0);
  const retourTraite = useRef(false);

  const enLigne = actif && businessId !== null;
  // Une seule synchro à la fois ; une demande pendant une synchro en relance une juste après.
  const enVol = useRef<Promise<void> | null>(null);
  const relancer = useRef(false);
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const synchroniser = useCallback((): Promise<void> => {
    if (!enLigne || !businessId) return Promise.resolve();
    if (enVol.current) {
      relancer.current = true;
      return enVol.current;
    }
    const tour = (async () => {
      do {
        relancer.current = false;
        derniere.current = Date.now();
        try {
          const liste = await listerComptes(businessId);
          if (!monte.current) return;
          setComptes(liste);
          setEnCours(true);
          const bilan = await lireComptesRelies(businessId, liste, { boutique: synchroniserBoutique, tiktok: synchroniserTikTok }, modifier);
          if (!monte.current) return;
          setIgnorees(bilan.ignorees);
          setVentesTest(bilan.ventesTest);
          setErreursComptes(bilan.parCompte);
          setConnexionExpiree(bilan.expiree);
          // Session expirée : un seul message, pas un par compte.
          setErreur(bilan.expiree ? MESSAGE_CONNEXION_EXPIREE : bilan.erreurs.join(' ') || null);
          setComptes(await listerComptes(businessId));
        } catch (e) {
          if (!monte.current) return;
          setErreursComptes({});
          setConnexionExpiree(e instanceof ConnexionExpiree);
          setErreur(messageDe(e, 'L’actualisation a échoué. Réessaie.'));
        }
      } while (relancer.current && monte.current);
    })();
    enVol.current = tour;
    return tour.finally(() => {
      enVol.current = null;
      if (monte.current) setEnCours(false);
    });
  }, [enLigne, businessId, modifier]);

  useEffect(() => {
    if (!enLigne || !retourTikTok || retourTraite.current) return;
    retourTraite.current = true;
    // Le code de TikTok ne sert qu'une fois : on l'enlève de l'adresse tout de suite.
    window.history.replaceState(null, '', window.location.pathname);
    if ('erreur' in retourTikTok) {
      setMessageTikTok({
        type: 'erreur',
        texte: Object.hasOwn(RAISONS_TIKTOK, retourTikTok.erreur)
          ? RAISONS_TIKTOK[retourTikTok.erreur]!
          : 'TikTok n’a pas pu relier ton compte. Réessaie.',
      });
      return;
    }
    relierTikTok(retourTikTok.code, retourTikTok.etat).then(
      (libelle) => {
        setMessageTikTok({ type: 'succes', texte: `TikTok relié : « ${libelle} ».` });
        void synchroniser();
      },
      (e: unknown) => {
        if (e instanceof ConnexionExpiree) setConnexionExpiree(true);
        setMessageTikTok({ type: 'erreur', texte: messageDe(e, 'La liaison TikTok a échoué. Réessaie.') });
      },
    );
  }, [enLigne, retourTikTok, synchroniser]);

  useEffect(() => {
    if (!enLigne) return;
    void synchroniser();
    const surRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - derniere.current > ECART_MIN_MS) void synchroniser();
    };
    document.addEventListener('visibilitychange', surRetour);
    return () => document.removeEventListener('visibilitychange', surRetour);
  }, [enLigne, synchroniser]);

  const relier = useCallback(
    async (source: SourceBoutique, cle: string) => {
      const finir = (message: MessageCompte) => {
        if (monte.current) setLiaisons((l) => ({ ...l, [source]: { enCours: false, message } }));
      };
      if (!businessId) {
        finir({ type: 'erreur', texte: 'Choisis d’abord un business.' });
        return false;
      }
      setLiaisons((l) => ({ ...l, [source]: { enCours: true, message: null } }));
      try {
        const libelle = await relierBoutique(businessId, source, cle);
        await synchroniser();
        finir({ type: 'succes', texte: messageBoutiqueReliee(source, libelle) });
        return true;
      } catch (e) {
        if (e instanceof ConnexionExpiree && monte.current) setConnexionExpiree(true);
        finir({ type: 'erreur', texte: messageDe(e, 'La liaison a échoué. Réessaie.') });
        return false;
      }
    },
    [businessId, synchroniser],
  );

  const deconnecter = useCallback(
    async (source: SourceCompte, identifiant = '') => {
      if (!businessId) return;
      await deconnecterCompte(businessId, source, identifiant);
      setComptes(await listerComptes(businessId));
      setErreur(null);
      setErreursComptes((e) => ({ ...e, [source]: undefined }));
      // Le message de liaison (« Boutique reliée ») n'a plus lieu d'être.
      if ((BOUTIQUES as SourceCompte[]).includes(source)) setLiaisons((l) => ({ ...l, [source]: undefined }));
    },
    [businessId],
  );

  const mouvements = useCallback(
    (source: SourceBoutique) =>
      businessId ? mouvementsBoutique(businessId, source) : Promise.reject(new Error('Choisis d’abord un business.')),
    [businessId],
  );

  const partirSurTikTok = useCallback(async () => {
    if (!businessId) throw new Error('Choisis d’abord un business.');
    window.location.assign(await adresseConnexionTikTok(businessId));
  }, [businessId]);

  return {
    comptes,
    enCours,
    erreur,
    erreursComptes,
    connexionExpiree,
    synchroniser,
    relier,
    liaisons,
    deconnecter,
    mouvements,
    relierTikTok: partirSurTikTok,
    messageTikTok,
    effacerMessageTikTok: useCallback(() => setMessageTikTok(null), []),
    ignorees,
    ventesTest,
    effacerErreur: useCallback(() => setErreur(null), []),
  };
}
