import { useCallback, useEffect, useRef, useState } from 'react';
import type { Donnees } from '../modele';
import { donneesValides, donneesVides } from './actions';
import { exempleAAfficher, versDonnees, type Depot } from './depot';
import { chargerDonnees, enregistrerDonnees } from './stockage';
import { messageEchecEnregistrement, Synchro, type OrigineModification } from './synchro';

/** Où sont gardées les données : sur l'appareil seulement, ou dans le compte en ligne. */
export type Source =
  | { type: 'appareil' }
  /** `cle` distingue la copie gardée sur l'appareil : une par compte et par business. */
  | { type: 'compte'; depot: Depot; cle: string };

export interface EtatDonnees {
  /** null tant que les données ne sont pas encore arrivées. */
  donnees: Donnees | null;
  /**
   * `origine` : absente pour une action de la personne, « ventes » ou « vidéos » pour une actualisation automatique.
   * La promesse dit si le changement est bien enregistré (dans la base, ou sur l'appareil).
   */
  modifier: (f: (d: Donnees) => Donnees, origine?: OrigineModification) => Promise<boolean>;
  erreur: string | null;
  effacerErreur: () => void;
  recharger: () => void;
}

// Copie du compte sur l'appareil : l'appli s'ouvre tout de suite, même avant la réponse de la base.
const PREFIXE_CACHE = 'pilotage:compte:';
const cleCache = (cle: string) => `${PREFIXE_CACHE}${cle}`;

function lireCache(cle: string): Donnees | null {
  try {
    const texte = localStorage.getItem(cleCache(cle));
    return texte ? donneesValides(JSON.parse(texte)) : null;
  } catch {
    return null;
  }
}

function ecrireCache(cle: string, d: Donnees): void {
  try {
    localStorage.setItem(cleCache(cle), JSON.stringify(d));
  } catch {
    // Pas grave : la base en ligne reste la référence.
  }
}

/** Vrai si cet appareil garde une copie lisible de ce business : sans réseau, on peut l'ouvrir. */
export function copieExiste(cle: string): boolean {
  return lireCache(cle) !== null;
}

/** Efface la copie d'un seul business sur l'appareil (par exemple quand il est supprimé). */
export function oublierCopie(cle: string): void {
  try {
    localStorage.removeItem(cleCache(cle));
  } catch {
    // Rien à faire.
  }
}

/** Efface les copies d'un compte sur l'appareil (tous ses business), par exemple à la déconnexion. */
export function oublierCache(userId: string): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const cle = localStorage.key(i);
      if (cle?.startsWith(cleCache(userId))) localStorage.removeItem(cle);
    }
  } catch {
    // Rien à faire.
  }
}

/** La base ne répond pas, mais l'appli montre la copie de l'appareil. */
export const MESSAGE_HORS_LIGNE = 'Pas de connexion : les chiffres affichés sont peut-être anciens.';

/** La base ne répond pas, et cet appareil n'a pas de copie de ce business. */
export const MESSAGE_SANS_COPIE =
  'Impossible de charger les chiffres de ce business. Vérifie ta connexion internet : sans réseau, seuls les business déjà ouverts sur cet appareil s’affichent.';

const MESSAGE_APPAREIL =
  'Attention : cet appareil n’enregistre pas tes données (navigation privée ?). Elles seront perdues en fermant la page.';

export function useDonnees(source: Source): EtatDonnees {
  const depot = source.type === 'compte' ? source.depot : null;
  const cle = source.type === 'compte' ? source.cle : null;

  const [donnees, setDonnees] = useState<Donnees | null>(() =>
    source.type === 'appareil' ? chargerDonnees(new Date()) : lireCache(source.cle),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const actuelles = useRef(donnees);
  const version = useRef(0);
  const synchro = useRef<Synchro | null>(null);
  // Faux dès que l'écran est fermé (déconnexion, autre business) : une réponse qui arrive après n'écrit plus rien.
  const monte = useRef(true);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  const afficher = useCallback(
    (d: Donnees) => {
      if (!monte.current) return;
      actuelles.current = d;
      setDonnees(d);
      if (cle) ecrireCache(cle, d);
    },
    [cle],
  );

  // Sur l'appareil : vérifier dès l'ouverture que l'enregistrement fonctionne.
  useEffect(() => {
    if (source.type === 'appareil' && actuelles.current && !enregistrerDonnees(actuelles.current)) {
      setErreur(MESSAGE_APPAREIL);
    }
  }, [source.type]);

  const recharger = useCallback(async () => {
    if (!depot || synchro.current?.occupee) return;
    // Sans réseau, la base réessaie plusieurs secondes avant d'abandonner : on prévient tout de suite.
    if (navigator.onLine === false && actuelles.current) setErreur(MESSAGE_HORS_LIGNE);
    const versionDepart = version.current;
    try {
      const compte = await depot.charger();
      // Une modification faite pendant le chargement est plus récente : on ne l'écrase pas.
      if (versionDepart !== version.current || synchro.current?.occupee) return;
      const maintenant = new Date();
      const d = exempleAAfficher(actuelles.current, versDonnees(compte, maintenant), maintenant);
      if (synchro.current) synchro.current.etatServeur = d;
      afficher(d);
      setErreur(null);
    } catch {
      setErreur(actuelles.current ? MESSAGE_HORS_LIGNE : MESSAGE_SANS_COPIE);
    }
  }, [depot, afficher]);

  useEffect(() => {
    if (!depot) return;
    synchro.current = new Synchro(depot, actuelles.current ?? donneesVides(), (etatServeur, origine) => {
      afficher(etatServeur);
      setErreur(messageEchecEnregistrement(origine));
    });
    void recharger();
    // En revenant sur l'appli (par exemple après avoir noté une vidéo sur l'autre appareil), ou quand le réseau
    // revient, on recharge.
    const surRetour = () => {
      if (document.visibilityState === 'visible') void recharger();
    };
    const surReseau = () => void recharger();
    document.addEventListener('visibilitychange', surRetour);
    window.addEventListener('online', surReseau);
    return () => {
      document.removeEventListener('visibilitychange', surRetour);
      window.removeEventListener('online', surReseau);
    };
  }, [depot, afficher, recharger]);

  const modifier = useCallback(
    (f: (d: Donnees) => Donnees, origine?: OrigineModification) => {
      const avant = actuelles.current;
      if (!avant || !monte.current) return Promise.resolve(false);
      const apres = f(avant);
      if (apres === avant) return Promise.resolve(true);
      version.current++;
      afficher(apres);
      if (synchro.current) return synchro.current.enregistrer(avant, apres, origine);
      if (enregistrerDonnees(apres)) return Promise.resolve(true);
      setErreur(MESSAGE_APPAREIL);
      return Promise.resolve(false);
    },
    [afficher],
  );

  return {
    donnees,
    modifier,
    erreur,
    effacerErreur: useCallback(() => setErreur(null), []),
    recharger: useCallback(() => void recharger(), [recharger]),
  };
}
