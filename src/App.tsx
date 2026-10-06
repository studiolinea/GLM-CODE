import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  businessAOuvrir,
  businessRetenu,
  creerBusiness,
  listerBusiness,
  renommerBusiness,
  retenirBusiness,
  type Business,
} from './donnees/business';
import { client } from './donnees/config';
import { DepotSupabase } from './donnees/depotSupabase';
import { oublierCache, type Source } from './donnees/useDonnees';
import { Connexion } from './ecrans/Connexion';
import { EcranMessage } from './ecrans/EcranMessage';
import { Pilotage } from './Pilotage';
import './style.css';

const SUR_APPAREIL: Source = { type: 'appareil' };

export function App() {
  // Sans base en ligne configurée (version de test), les données restent sur l'appareil.
  if (!client) return <Pilotage source={SUR_APPAREIL} />;
  return <AvecCompte client={client} />;
}

function AvecCompte({ client }: { client: SupabaseClient }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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

  return (
    <AvecBusiness
      key={userId}
      client={client}
      userId={userId}
      compte={{
        email,
        deconnecter: async () => {
          oublierCache(userId);
          await client.auth.signOut();
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

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      let business = await listerBusiness(client);
      // Nouveau compte : un premier business, avec les données d'exemple.
      if (business.length === 0) business = [await creerBusiness(client, userId, 'Mon premier business', true)];
      setListe(business);
    } catch (e) {
      setErreur(
        `${e instanceof Error ? e.message : 'Impossible de lire tes business.'} Si le problème continue, la base n’est peut-être pas à jour (texte SQL « 05-plusieurs-business.sql »).`,
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
              {erreur}
            </p>
            <button className="bouton principal" onClick={() => void charger()}>
              Réessayer
            </button>
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
      business={{ liste, actuel, choisir, creer, renommer }}
    />
  );
}
