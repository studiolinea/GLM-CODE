import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { useEffect, useMemo, useState } from 'react';
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
  const source = useMemo<Source | null>(
    () => (userId ? { type: 'compte', depot: new DepotSupabase(client, userId), userId } : null),
    [client, userId],
  );

  if (session === undefined) {
    return (
      <EcranMessage>
        <p className="sous-titre">Démarrage…</p>
      </EcranMessage>
    );
  }
  if (!userId || !source) return <Connexion client={client} />;

  return (
    <Pilotage
      key={userId}
      source={source}
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
