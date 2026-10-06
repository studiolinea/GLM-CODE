import { useCallback, useEffect, useRef, useState } from 'react';
import type { Donnees, Video } from '../modele';
import type { Vente } from '../ventes/modele';
import { importerVentes, quitterExemple } from './actions';
import {
  adresseConnexionTikTok,
  BOUTIQUES,
  deconnecterCompte,
  listerComptes,
  relierBoutique,
  relierTikTok,
  synchroniserBoutique,
  synchroniserTikTok,
  mouvementsBoutique,
  type CompteRelie,
  type MouvementBoutique,
  type RetourTikTok,
  type SourceBoutique,
  type SourceCompte,
} from './comptesRelies';

export interface SynchroBoutique {
  /** null tant que la liste n'est pas arrivée. */
  comptes: CompteRelie[] | null;
  enCours: boolean;
  erreur: string | null;
  synchroniser: () => Promise<void>;
  /** Renvoie le libellé de la boutique ; lève une erreur avec un message clair sinon. */
  relier: (source: SourceBoutique, cle: string) => Promise<string>;
  deconnecter: (source: SourceCompte, identifiant?: string) => Promise<void>;
  /** Les derniers mouvements d'argent de la boutique (pour vérifier les frais et la TVA). */
  mouvements: (source: SourceBoutique) => Promise<MouvementBoutique[]>;
  /** Part sur la page d'accord de TikTok ; lève une erreur avec un message clair si c'est impossible. */
  relierTikTok: () => Promise<void>;
  /** Le résultat de la liaison TikTok, au retour de la page d'accord. */
  messageTikTok: { type: 'succes' | 'erreur'; texte: string } | null;
}

const ECART_MIN_MS = 5 * 60_000; // en revenant sur l'appli, pas plus d'une synchro toutes les 5 minutes

/**
 * Applique les ventes reçues de la boutique :
 * - les vraies ventes sont ajoutées (et font disparaître l'exemple s'il y en a) ;
 * - les ventes du mode test ne s'ajoutent qu'aux données d'exemple, jamais aux vraies données.
 */
export function appliquerVentesBoutique(d: Donnees, ventes: Vente[], synchroniseLe: string): Donnees {
  const estTest = (v: Vente) => v.plateforme.endsWith('-test');
  const reelles = ventes.filter((v) => !estTest(v));
  const tests = ventes.filter(estTest);
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

/** Les ventes de la boutique reliée arrivent toutes seules : à l'ouverture, puis en revenant sur l'appli. */
export function useSynchroBoutique(
  modifier: (f: (d: Donnees) => Donnees) => void,
  actif: boolean,
  retourTikTok: RetourTikTok | null = null,
  businessId: string | null = null,
): SynchroBoutique {
  const [comptes, setComptes] = useState<CompteRelie[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageTikTok, setMessageTikTok] = useState<SynchroBoutique['messageTikTok']>(null);
  const derniere = useRef(0);
  const retourTraite = useRef(false);

  const enLigne = actif && businessId !== null;
  const synchroniser = useCallback(async () => {
    if (!enLigne || !businessId) return;
    derniere.current = Date.now();
    try {
      const liste = await listerComptes(businessId);
      setComptes(liste);
      const reliees = BOUTIQUES.filter((b) => liste.some((c) => c.source === b));
      const tiktok = liste.some((c) => c.source === 'tiktok');
      if (reliees.length === 0 && !tiktok) return;
      setEnCours(true);
      for (const source of reliees) {
        const r = await synchroniserBoutique(businessId, source);
        modifier((d) => appliquerVentesBoutique(d, r.ventes, r.synchroniseLe));
      }
      if (tiktok) {
        const r = await synchroniserTikTok(businessId);
        modifier((d) => appliquerVideos(d, r.videos));
      }
      setComptes(await listerComptes(businessId));
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La synchronisation a échoué. Réessaie.');
      listerComptes(businessId).then(setComptes, () => undefined);
    } finally {
      setEnCours(false);
    }
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
        setMessageTikTok({ type: 'succes', texte: `TikTok relié : « ${libelle} ».` });
        void synchroniser();
      },
      (e: unknown) =>
        setMessageTikTok({ type: 'erreur', texte: e instanceof Error ? e.message : 'La liaison TikTok a échoué. Réessaie.' }),
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
      if (!businessId) throw new Error('Choisis d’abord un business.');
      const libelle = await relierBoutique(businessId, source, cle);
      await synchroniser();
      return libelle;
    },
    [businessId, synchroniser],
  );

  const deconnecter = useCallback(
    async (source: SourceCompte, identifiant = '') => {
      if (!businessId) return;
      await deconnecterCompte(businessId, source, identifiant);
      setComptes(await listerComptes(businessId));
      setErreur(null);
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
    synchroniser,
    relier,
    deconnecter,
    mouvements,
    relierTikTok: partirSurTikTok,
    messageTikTok,
  };
}
