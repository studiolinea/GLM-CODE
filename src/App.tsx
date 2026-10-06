import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  businessAOuvrir,
  businessRetenu,
  creerBusiness,
  listerBusiness,
  renommerBusiness,
  retenirBusiness,
  supprimerBusiness,
  type Business,
} from './donnees/business';
import type { DonneesBusiness } from './calculs/ensemble';
import { client } from './donnees/config';
import { chargerEnsemble } from './donnees/ensemble';
import { DepotSupabase } from './donnees/depotSupabase';
import { oublierCache, oublierCopie, type Source } from './donnees/useDonnees';
import { Connexion } from './ecrans/Connexion';
import { EcranMessage } from './ecrans/EcranMessage';
import { Pilotage } from './Pilotage';
import { fr } from './texte';
import './style.css';

const SUR_APPAREIL: Source = { type: 'appareil' };

export function App() {
  // Sans base en ligne configurée (version de test), les données restent sur l'appareil.
  if (!client) return <Pilotage source={SUR_APPAREIL} />;
  return <AvecCompte client={client} />;
}

function AvecCompte({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [sortie, setSortie] = useState(false);

  useEffect(() => {
    let actif = true;
    void client.auth.getSession().then(({ data }) => actif && setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_evenement, nouvelle) => setSession(nouvelle));
    return () => {
      actif = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const userId = session?.user.id;
  const email = session?.user.email ?? '';

  if (session === undefined) {
    return (
      <EcranMessage>
        <p className="sous-titre">Démarrage…</p>
      </EcranMessage>
    );
  }
  if (!userId) return <Connexion client={client} />;
  if (sortie) {
    return (
      <EcranMessage>
        <p className="sous-titre">Déconnexion…</p>
      </EcranMessage>
    );
  }

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
          oublierCache(userId);
          try {
            await client.auth.signOut();
          } finally {
            setSortie(false);
          }
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
  // Une seule lecture à la fois : sinon un compte tout neuf recevrait deux « Mon premier business ».
  const lecture = useRef<Promise<Business[]> | null>(null);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      lecture.current ??= (async () => {
        const business = await listerBusiness(client);
        // Nouveau compte : un premier business, avec les données d'exemple.
        return business.length > 0 ? business : [await creerBusiness(client, userId, 'Mon premier business', true)];
      })().finally(() => {
        lecture.current = null;
      });
      setListe(await lecture.current);
    } catch (e) {
      // Le bouton « Réessayer » est juste en dessous : pas besoin de « Réessaie. » dans le message.
      setErreur(e instanceof Error ? e.message.replace(/\s*Réessaie\.$/, '') : 'Impossible de lire tes business.');
      // Le détail technique, pour qui ouvre la console du navigateur.
      console.error(
        'Lecture des business impossible. Si le problème continue, la base n’est peut-être pas à jour (texte SQL « 05-plusieurs-business.sql »).',
        e instanceof Error ? (e.cause ?? e) : e,
      );
    }
  }, [client, userId]);

  useEffect(() => {
    void charger();
  }, [charger]);

  const actuel = liste ? businessAOuvrir(liste, actuelId) : null;

  const choisir = useCallback(
    (id: string) => {
      retenirBusiness(userId, id);
      setActuelId(id);
    },
    [userId],
  );

  const creer = useCallback(
    async (nom: string) => {
      const nouveau = await creerBusiness(client, userId, nom, false);
      setListe((l) => [...(l ?? []), nouveau]);
      choisir(nouveau.id);
    },
    [client, userId, choisir],
  );

  const renommer = useCallback(
    async (id: string, nom: string) => {
      await renommerBusiness(client, id, nom);
      setListe(await listerBusiness(client));
    },
    [client],
  );

  const supprimer = useCallback(
    async (id: string) => {
      if ((liste?.length ?? 0) <= 1) throw new Error('Il te faut au moins un business : crée-en un autre avant de supprimer celui-ci.');
      await supprimerBusiness(client, id);
      oublierCopie(`${userId}:${id}`);
      const reste = await listerBusiness(client);
      setListe(reste);
      // Le business ouvert vient d'être supprimé : on ouvre le premier qui reste.
      if (id === actuelId && reste[0]) choisir(reste[0].id);
    },
    [client, userId, liste, actuelId, choisir],
  );

  const lireEnsemble = useCallback(() => chargerEnsemble(client, userId, liste ?? []), [client, userId, liste]);

  const idOuvert = actuel?.id ?? null;
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
      business={{ liste, actuel, choisir, creer, renommer, supprimer, chargerEnsemble: lireEnsemble }}
    />
  );
}
