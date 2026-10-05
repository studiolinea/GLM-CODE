import { useCallback, useEffect, useRef, useState } from 'react';
import type { Donnees } from '../modele';
import { donneesValides, donneesVides } from './actions';
import { versDonnees, type Depot } from './depot';
import { chargerDonnees, enregistrerDonnees } from './stockage';
import { Synchro } from './synchro';

/** Où sont gardées les données : sur l'appareil seulement, ou dans le compte en ligne. */
export type Source = { type: 'appareil' } | { type: 'compte'; depot: Depot; userId: string };

export interface EtatDonnees {
  /** null tant que les données ne sont pas encore arrivées. */
  donnees: Donnees | null;
  modifier: (f: (d: Donnees) => Donnees) => void;
  erreur: string | null;
  effacerErreur: () => void;
  recharger: () => void;
}

// Copie du compte sur l'appareil : l'appli s'ouvre tout de suite, même avant la réponse de la base.
const cleCache = (userId: string) => `pilotage:compte:${userId}`;

function lireCache(userId: string): Donnees | null {
  try {
    const texte = localStorage.getItem(cleCache(userId));
    return texte ? donneesValides(JSON.parse(texte)) : null;
  } catch {
    return null;
  }
}

function ecrireCache(userId: string, d: Donnees): void {
  try {
    localStorage.setItem(cleCache(userId), JSON.stringify(d));
  } catch {
    // Pas grave : la base en ligne reste la référence.
  }
}

export function oublierCache(userId: string): void {
  try {
    localStorage.removeItem(cleCache(userId));
  } catch {
    // Rien à faire.
  }
}

const MESSAGE_APPAREIL =
  'Attention : cet appareil n’enregistre pas tes données (navigation privée ?). Elles seront perdues en fermant la page.';

export function useDonnees(source: Source): EtatDonnees {
  const depot = source.type === 'compte' ? source.depot : null;
  const userId = source.type === 'compte' ? source.userId : null;

  const [donnees, setDonnees] = useState<Donnees | null>(() =>
    source.type === 'appareil' ? chargerDonnees(new Date()) : lireCache(source.userId),
  );
  const [erreur, setErreur] = useState<string | null>(null);
  const actuelles = useRef(donnees);
  const version = useRef(0);
  const synchro = useRef<Synchro | null>(null);

  const afficher = useCallback(
    (d: Donnees) => {
      actuelles.current = d;
      setDonnees(d);
      if (userId) ecrireCache(userId, d);
    },
    [userId],
  );

  // Sur l'appareil : vérifier dès l'ouverture que l'enregistrement fonctionne.
  useEffect(() => {
    if (source.type === 'appareil' && actuelles.current && !enregistrerDonnees(actuelles.current)) {
      setErreur(MESSAGE_APPAREIL);
    }
  }, [source.type]);

  const recharger = useCallback(async () => {
    if (!depot || synchro.current?.occupee) return;
    const versionDepart = version.current;
    try {
      const compte = await depot.charger();
      // Une modification faite pendant le chargement est plus récente : on ne l'écrase pas.
      if (versionDepart !== version.current || synchro.current?.occupee) return;
      let d = versDonnees(compte, new Date());
      // Compte encore vide : on garde l'exemple déjà affiché (et les essais faits dessus).
      if (d.exemple && actuelles.current?.exemple) d = actuelles.current;
      if (synchro.current) synchro.current.etatServeur = d;
      afficher(d);
      setErreur(null);
    } catch {
      setErreur(
        actuelles.current
          ? 'Pas de connexion : les chiffres affichés sont peut-être anciens.'
          : 'Impossible de charger tes données. Vérifie ta connexion, puis réessaie.',
      );
    }
  }, [depot, afficher]);

  useEffect(() => {
    if (!depot) return;
    synchro.current = new Synchro(depot, actuelles.current ?? donneesVides(), (etatServeur) => {
      afficher(etatServeur);
      setErreur('Pas de connexion, réessaie : ta dernière action n’a pas été enregistrée.');
    });
    void recharger();
    // En revenant sur l'appli (par exemple après avoir noté une vidéo sur l'autre appareil), on recharge.
    const surRetour = () => {
      if (document.visibilityState === 'visible') void recharger();
    };
    document.addEventListener('visibilitychange', surRetour);
    return () => document.removeEventListener('visibilitychange', surRetour);
  }, [depot, afficher, recharger]);

  const modifier = useCallback(
    (f: (d: Donnees) => Donnees) => {
      const avant = actuelles.current;
      if (!avant) return;
      const apres = f(avant);
      if (apres === avant) return;
      version.current++;
      afficher(apres);
      if (synchro.current) synchro.current.enregistrer(avant, apres);
      else if (!enregistrerDonnees(apres)) setErreur(MESSAGE_APPAREIL);
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
