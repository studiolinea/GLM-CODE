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
  type CompteRelie,
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
  deconnecter: (source: SourceCompte) => Promise<void>;
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
): SynchroBoutique {
  const [comptes, setComptes] = useState<CompteRelie[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [messageTikTok, setMessageTikTok] = useState<SynchroBoutique['messageTikTok']>(null);
  const derniere = useRef(0);
  const retourTraite = useRef(false);

  const synchroniser = useCallback(async () => {
    if (!actif) return;
    derniere.current = Date.now();
    try {
      const liste = await listerComptes();
      setComptes(liste);
      const reliees = BOUTIQUES.filter((b) => liste.some((c) => c.source === b));
      const tiktok = liste.some((c) => c.source === 'tiktok');
      if (reliees.length === 0 && !tiktok) return;
      setEnCours(true);
      for (const source of reliees) {
        const r = await synchroniserBoutique(source);
        modifier((d) => appliquerVentesBoutique(d, r.ventes, r.synchroniseLe));
      }
      if (tiktok) {
        const r = await synchroniserTikTok();
        modifier((d) => appliquerVideos(d, r.videos));
      }
      setComptes(await listerComptes());
      setErreur(null);
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La synchronisation a échoué. Réessaie.');
      listerComptes().then(setComptes, () => undefined);
    } finally {
      setEnCours(false);
    }
  }, [actif, modifier]);

  useEffect(() => {
    if (!actif || !retourTikTok || retourTraite.current) return;
    retourTraite.current = true;
    // Le code de TikTok ne sert qu'une fois : on l'enlève de l'adresse tout de suite.
    window.history.replaceState(null, '', window.location.pathname);
    if ('erreur' in retourTikTok) {
      setMessageTikTok({
        type: 'erreur',
        texte: RAISONS_TIKTOK[retourTikTok.erreur] ?? 'TikTok n’a pas pu relier ton compte. Réessaie.',
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
  }, [actif, retourTikTok, synchroniser]);

  useEffect(() => {
    if (!actif) return;
    void synchroniser();
    const surRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - derniere.current > ECART_MIN_MS) void synchroniser();
    };
    document.addEventListener('visibilitychange', surRetour);
    return () => document.removeEventListener('visibilitychange', surRetour);
  }, [actif, synchroniser]);

  const relier = useCallback(
    async (source: SourceBoutique, cle: string) => {
      const libelle = await relierBoutique(source, cle);
      await synchroniser();
      return libelle;
    },
    [synchroniser],
  );

  const deconnecter = useCallback(async (source: SourceCompte) => {
    await deconnecterCompte(source);
    setComptes(await listerComptes());
    setErreur(null);
  }, []);

  const partirSurTikTok = useCallback(async () => {
    window.location.assign(await adresseConnexionTikTok());
  }, []);

  return {
    comptes,
    enCours,
    erreur,
    synchroniser,
    relier,
    deconnecter,
    relierTikTok: partirSurTikTok,
    messageTikTok,
  };
}
