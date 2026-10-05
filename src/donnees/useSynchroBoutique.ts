import { useCallback, useEffect, useRef, useState } from 'react';
import type { Donnees } from '../modele';
import type { Vente } from '../ventes/modele';
import { importerVentes } from './actions';
import {
  deconnecterCompte,
  listerComptes,
  relierLemonSqueezy,
  synchroniserLemonSqueezy,
  type CompteRelie,
  type SourceCompte,
} from './comptesRelies';

export interface SynchroBoutique {
  /** null tant que la liste n'est pas arrivée. */
  comptes: CompteRelie[] | null;
  enCours: boolean;
  erreur: string | null;
  synchroniser: () => Promise<void>;
  /** Renvoie le nom de la boutique ; lève une erreur avec un message clair sinon. */
  relier: (cle: string) => Promise<string>;
  deconnecter: (source: SourceCompte) => Promise<void>;
}

const ECART_MIN_MS = 5 * 60_000; // en revenant sur l'appli, pas plus d'une synchro toutes les 5 minutes

/**
 * Applique les ventes reçues de la boutique :
 * - les vraies ventes sont ajoutées (et font disparaître l'exemple s'il y en a) ;
 * - les ventes du mode test ne s'ajoutent qu'aux données d'exemple, jamais aux vraies données.
 */
export function appliquerVentesBoutique(d: Donnees, ventes: Vente[], synchroniseLe: string): Donnees {
  const reelles = ventes.filter((v) => v.plateforme !== 'lemonsqueezy-test');
  const tests = ventes.filter((v) => v.plateforme === 'lemonsqueezy-test');
  let resultat = d;
  // Sans vraie vente, on ne quitte pas l'exemple ; avec de vraies données, la date « à jour » avance quand même.
  if (reelles.length > 0 || !resultat.exemple) resultat = importerVentes(resultat, reelles, synchroniseLe).donnees;
  if (tests.length > 0 && resultat.exemple) {
    resultat = importerVentes(resultat, tests, synchroniseLe, { essai: true }).donnees;
  }
  return resultat;
}

/** Les ventes de la boutique reliée arrivent toutes seules : à l'ouverture, puis en revenant sur l'appli. */
export function useSynchroBoutique(modifier: (f: (d: Donnees) => Donnees) => void, actif: boolean): SynchroBoutique {
  const [comptes, setComptes] = useState<CompteRelie[] | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const derniere = useRef(0);

  const synchroniser = useCallback(async () => {
    if (!actif) return;
    derniere.current = Date.now();
    try {
      const liste = await listerComptes();
      setComptes(liste);
      if (!liste.some((c) => c.source === 'lemonsqueezy')) return;
      setEnCours(true);
      const r = await synchroniserLemonSqueezy();
      modifier((d) => appliquerVentesBoutique(d, r.ventes, r.synchroniseLe));
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
    if (!actif) return;
    void synchroniser();
    const surRetour = () => {
      if (document.visibilityState === 'visible' && Date.now() - derniere.current > ECART_MIN_MS) void synchroniser();
    };
    document.addEventListener('visibilitychange', surRetour);
    return () => document.removeEventListener('visibilitychange', surRetour);
  }, [actif, synchroniser]);

  const relier = useCallback(
    async (cle: string) => {
      const libelle = await relierLemonSqueezy(cle);
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

  return { comptes, enCours, erreur, synchroniser, relier, deconnecter };
}
