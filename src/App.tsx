import { isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  businessAOuvrir,
  businessRetenu,
  compteRetenu,
  creerBusiness,
  listerBusiness,
  memoireBusiness,
  messageNomPris,
  NOM_PREMIER_BUSINESS,
  nomDejaPris,
  oublierBusiness,
  oublierCompte,
  renommerBusiness,
  retenirBusiness,
  retenirCompte,
  retenirListe,
  supprimerBusiness,
  type Business,
  type CompteRetenu,
} from './donnees/business';
import type { DonneesBusiness } from './calculs/ensemble';
import { client } from './donnees/config';
import { chargerEnsemble } from './donnees/ensemble';
import { DepotSupabase } from './donnees/depotSupabase';
import { copieExiste, oublierCache, oublierCopie, type Source } from './donnees/useDonnees';
import { Connexion } from './ecrans/Connexion';
import { NouveauMotDePasse } from './ecrans/NouveauMotDePasse';
import { EcranMessage } from './ecrans/EcranMessage';
import { Pilotage } from './Pilotage';
import { fr } from './texte';
import './style.css';

const SUR_APPAREIL: Source = { type: 'appareil' };

/**
 * Sans réseau, Supabase réessaie longtemps avant d'abandonner (jusqu'à 25 secondes pour renouveler la session,
 * 7 secondes pour lire la liste des business) : au bout de ce délai, on ouvre la copie de l'appareil.
 */
const ATTENTE_RESEAU_MS = 2500;

/** Au-delà, la déconnexion n'attend plus Supabase : la session est effacée de l'appareil quand même. */
const ATTENTE_DECONNEXION_MS = 5000;

/** Efface de l'appareil tout ce que l'appli gardait pour ce compte : copies des business, liste, dernier compte. */
function oublierToutLeCompte(userId: string | undefined): void {
  if (userId) {
    oublierCache(userId);
    oublierBusiness(userId);
  }
  oublierCompte();
}

/** Sans réseau, Supabase ne peut pas fermer la session et la garde : on l'efface nous-mêmes de l'appareil. */
function oublierSessionSupabase(): void {
  try {
    for (const cle of Object.keys(localStorage)) if (cle.startsWith('sb-')) localStorage.removeItem(cle);
  } catch {
    // Rien à faire.
  }
}

/** Le business à ouvrir sans réseau : le dernier ouvert s'il a une copie sur l'appareil, sinon un autre qui en a une. */
function businessHorsLigne(userId: string): Business | null {
  const memoire = memoireBusiness(userId);
  const garde = businessAOuvrir(memoire.liste, memoire.actuel);
  const aUneCopie = (b: Business | null) => !!b && copieExiste(`${userId}:${b.id}`);
  if (aUneCopie(garde)) return garde;
  return memoire.liste.find(aUneCopie) ?? null;
}

export function App() {
  // Sans base en ligne configurée (version de test), les données restent sur l'appareil.
  if (!client) return <Pilotage source={SUR_APPAREIL} />;
  return <AvecCompte client={client} />;
}

function AvecCompte({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  // Sans réseau, la session ne peut pas être renouvelée : on ouvre quand même la copie du dernier compte connecté.
  const [horsLigne, setHorsLigne] = useState<CompteRetenu | null>(null);
  const [sortie, setSortie] = useState(false);
  const [recuperation, setRecuperation] = useState(() => new URLSearchParams(window.location.search).get('recuperation') === '1');

  useEffect(() => {
    let actif = true;
    const retenu = compteRetenu();
    const ouvrirHorsLigne = () => {
      if (actif && retenu && businessHorsLigne(retenu.userId)) {
        setHorsLigne(retenu);
        return true;
      }
      return false;
    };
    const minuteur = setTimeout(ouvrirHorsLigne, ATTENTE_RESEAU_MS);
    void client.auth.getSession().then(({ data, error }) => {
      clearTimeout(minuteur);
      if (!actif) return;
      if (data.session) return setSession(data.session);
      // Pas de réseau pour renouveler la session : elle reste gardée, et Supabase réessaiera tout seul.
      if (error && isAuthRetryableFetchError(error) && ouvrirHorsLigne()) return;
      setHorsLigne(null);
      setSession(null);
    });
    const { data } = client.auth.onAuthStateChange((evenement, nouvelle) => {
      // La session de départ est lue juste au-dessus, avec getSession.
      if (evenement === 'INITIAL_SESSION') return;
      if (evenement === 'PASSWORD_RECOVERY') setRecuperation(true);
      if (nouvelle) {
        setSession(nouvelle);
      } else if (evenement === 'SIGNED_OUT') {
        // Aussi quand la déconnexion vient d'ailleurs (« Se déconnecter » sur un autre appareil, session révoquée) :
        // rien de ce compte ne reste sur cet appareil.
        oublierToutLeCompte(compteRetenu()?.userId);
        setHorsLigne(null);
        setSession(null);
      }
    });
    return () => {
      actif = false;
      clearTimeout(minuteur);
      data.subscription.unsubscribe();
    };
  }, [client]);

  const compte: CompteRetenu | null = session ? { userId: session.user.id, email: session.user.email ?? '' } : horsLigne;

  useEffect(() => {
    if (session) retenirCompte({ userId: session.user.id, email: session.user.email ?? '' });
  }, [session]);

  if (session === undefined && !horsLigne) {
    return (
      <EcranMessage>
        <p className="sous-titre">Démarrage…</p>
      </EcranMessage>
    );
  }
  if (!compte) return <Connexion client={client} />;
  if (recuperation && session) return <NouveauMotDePasse client={client} onTerminer={() => {
    window.history.replaceState(null, '', window.location.pathname);
    setRecuperation(false);
  }} />;
  if (sortie) {
    return (
      <EcranMessage>
        <p className="sous-titre">Déconnexion…</p>
      </EcranMessage>
    );
  }

  const { userId, email } = compte;
  return (
    <AvecBusiness
      key={userId}
      client={client}
      userId={userId}
      compte={{
        email,
        deconnecter: async () => {
          // D'abord fermer les écrans du compte : une synchro qui finirait après ne réécrit plus la copie de l'appareil.
          setSortie(true);
          await new Promise((fin) => setTimeout(fin, 0));
          oublierToutLeCompte(userId);
          const fermee = await Promise.race([
            client.auth.signOut().then(
              ({ error }) => !error,
              () => false,
            ),
            new Promise<boolean>((fin) => setTimeout(() => fin(false), ATTENTE_DECONNEXION_MS)),
          ]);
          if (!fermee) oublierSessionSupabase();
          setHorsLigne(null);
          setSession(null);
          setSortie(false);
        },
      }}
    />
  );
}

/** Ce que l'écran principal sait des business du compte, pour passer de l'un à l'autre. */
export interface ChoixBusiness {
  liste: Business[];
  actuel: Business;
  choisir: (id: string) => void;
  creer: (nom: string) => Promise<void>;
  renommer: (id: string, nom: string) => Promise<void>;
  /** Supprime un business et toutes ses données. Le dernier business ne peut pas être supprimé. */
  supprimer: (id: string) => Promise<void>;
  /** Les ventes et vidéos de tous les business, pour la vue d'ensemble. */
  chargerEnsemble: () => Promise<DonneesBusiness[]>;
  /** Un message pour l'écran principal (par exemple : le business ouvert vient d'être supprimé). */
  annonce: string | null;
  effacerAnnonce: () => void;
  /** Vrai quand la base ne répond pas et que la liste vient de la copie de l'appareil. */
  horsLigne: boolean;
  /** Vrai si ce business a une copie sur cet appareil : sans réseau, seul un business avec une copie s'ouvre. */
  aUneCopie: (id: string) => boolean;
}

function AvecBusiness({
  client,
  userId,
  compte,
}: {
  client: SupabaseClient;
  userId: string;
  compte: { email: string; deconnecter: () => Promise<void> };
}) {
  const [liste, setListe] = useState<Business[] | null>(null);
  const [actuelId, setActuelId] = useState<string | null>(() => businessRetenu(userId));
  const [erreur, setErreur] = useState<string | null>(null);
  // Vrai quand la liste vient de la copie de l'appareil (la base n'a pas répondu) : on la relit quand le réseau revient.
  const [depuisCopie, setDepuisCopie] = useState(false);
  const [annonce, setAnnonce] = useState<string | null>(null);
  // Une seule lecture à la fois : sinon un compte tout neuf recevrait deux « Mon premier business ».
  const lecture = useRef<Promise<Business[]> | null>(null);

  // Faux dès que les écrans du compte sont fermés (déconnexion) : une réponse qui arrive après n'écrit plus rien.
  const monte = useRef(false);
  useEffect(() => {
    monte.current = true;
    return () => {
      monte.current = false;
    };
  }, []);

  /** La liste lue en ligne : affichée, et gardée sur l'appareil pour ouvrir l'appli sans réseau. */
  const garderListe = useCallback(
    (lue: Business[]) => {
      if (!monte.current) return;
      retenirListe(userId, lue);
      setListe(lue);
    },
    [userId],
  );

  /** Sans réseau : on ouvre le dernier business avec la copie gardée sur l'appareil. Renvoie faux s'il n'y en a pas. */
  const ouvrirCopie = useCallback(() => {
    const garde = businessHorsLigne(userId);
    if (!garde) return false;
    setListe((deja) => deja ?? memoireBusiness(userId).liste);
    // Le business choisi n'a pas de copie sur cet appareil : on ouvre celui qui en a une.
    setActuelId((id) => (id && copieExiste(`${userId}:${id}`) ? id : garde.id));
    setDepuisCopie(true);
    return true;
  }, [userId]);

  const charger = useCallback(async () => {
    setErreur(null);
    // La base répond vite d'habitude. Sans réseau, elle réessaie plusieurs secondes : on n'attend pas pour ouvrir la copie.
    const minuteur = setTimeout(ouvrirCopie, navigator.onLine === false ? 0 : ATTENTE_RESEAU_MS);
    try {
      lecture.current ??= (async () => {
        const business = await listerBusiness(client);
        // Nouveau compte : un premier business, avec les données d'exemple.
        return business.length > 0 ? business : [await creerBusiness(client, userId, NOM_PREMIER_BUSINESS, true)];
      })().finally(() => {
        lecture.current = null;
      });
      garderListe(await lecture.current);
      setDepuisCopie(false);
    } catch (e) {
      // Le détail technique, pour qui ouvre la console du navigateur (jamais à l'écran).
      console.error(
        'Lecture des business impossible. Si le problème continue, la base n’est peut-être pas à jour (texte SQL « 05-plusieurs-business.sql »).',
        e instanceof Error ? (e.cause ?? e) : e,
      );
      if (ouvrirCopie()) return;
      // Le bouton « Réessayer » est juste en dessous : pas besoin de « Réessaie. » dans le message.
      if (navigator.onLine === false) setErreur('Pas de connexion : impossible de lire tes business.');
      else setErreur(e instanceof Error ? e.message.replace(/\s*Réessaie\.$/, '') : 'Impossible de lire tes business.');
    } finally {
      clearTimeout(minuteur);
    }
  }, [client, userId, garderListe, ouvrirCopie]);

  useEffect(() => {
    void charger();
  }, [charger]);

  // Ouverte avec la copie de l'appareil : dès que le réseau revient, on relit la vraie liste.
  useEffect(() => {
    if (!depuisCopie) return;
    const surReseau = () => void charger();
    window.addEventListener('online', surReseau);
    return () => window.removeEventListener('online', surReseau);
  }, [depuisCopie, charger]);

  const aUneCopie = useCallback((id: string) => copieExiste(`${userId}:${id}`), [userId]);

  const actuel = liste ? businessAOuvrir(liste, actuelId) : null;
  const idOuvert = actuel?.id ?? null;

  const choisir = useCallback(
    (id: string) => {
      if (!monte.current) return;
      retenirBusiness(userId, id);
      setActuelId(id);
    },
    [userId],
  );

  const creer = useCallback(
    async (nom: string) => {
      const pris = nomDejaPris(nom, liste ?? []);
      if (pris) throw new Error(messageNomPris(pris));
      const nouveau = await creerBusiness(client, userId, nom, false);
      garderListe([...(liste ?? []), nouveau]);
      choisir(nouveau.id);
    },
    [client, userId, liste, garderListe, choisir],
  );

  const renommer = useCallback(
    async (id: string, nom: string) => {
      const pris = nomDejaPris(nom, liste ?? [], id);
      if (pris) throw new Error(messageNomPris(pris));
      await renommerBusiness(client, id, nom);
      garderListe(await listerBusiness(client));
    },
    [client, liste, garderListe],
  );

  const supprimer = useCallback(
    async (id: string) => {
      if ((liste?.length ?? 0) <= 1) throw new Error('Il te faut au moins un business : crée-en un autre avant de supprimer celui-ci.');
      const nom = liste?.find((b) => b.id === id)?.nom ?? '';
      await supprimerBusiness(client, id);
      oublierCopie(`${userId}:${id}`);
      const reste = await listerBusiness(client);
      garderListe(reste);
      // Le business ouvert vient d'être supprimé : on ouvre le premier qui reste, et on le dit sur l'écran principal.
      // (Le business ouvert n'est pas forcément « retenu » : sans choix gardé, c'est le premier de la liste.)
      if (id === idOuvert && reste[0]) {
        setAnnonce(`« ${nom} » est supprimé.`);
        choisir(reste[0].id);
      }
    },
    [client, userId, liste, idOuvert, garderListe, choisir],
  );

  const lireEnsemble = useCallback(() => chargerEnsemble(client, userId, liste ?? []), [client, userId, liste]);
  const effacerAnnonce = useCallback(() => setAnnonce(null), []);

  const source = useMemo<Source | null>(
    () =>
      idOuvert ? { type: 'compte', depot: new DepotSupabase(client, userId, idOuvert), cle: `${userId}:${idOuvert}` } : null,
    [client, userId, idOuvert],
  );

  if (!liste || !actuel || !source) {
    return (
      <EcranMessage>
        {erreur ? (
          <>
            <p className="erreur" role="alert">
              {fr(erreur)}
            </p>
            <div className="pied pied-centre">
              <button className="bouton principal" onClick={() => void charger()}>
                Réessayer
              </button>
              <button className="bouton" onClick={() => void compte.deconnecter()}>
                Se déconnecter
              </button>
            </div>
          </>
        ) : (
          <p className="sous-titre">Chargement de tes business…</p>
        )}
      </EcranMessage>
    );
  }

  return (
    <Pilotage
      key={actuel.id}
      source={source}
      compte={compte}
      business={{
        liste,
        actuel,
        choisir,
        creer,
        renommer,
        supprimer,
        chargerEnsemble: lireEnsemble,
        annonce,
        effacerAnnonce,
        horsLigne: depuisCopie,
        aUneCopie,
      }}
    />
  );
}
