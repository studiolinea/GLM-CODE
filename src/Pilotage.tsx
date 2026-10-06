import { useCallback, useEffect, useMemo, useState } from 'react';
import { alertesVisibles, calculerAlertes, type Action } from './alertes/alertes';
import { calculerResume, type Periode } from './calculs/resume';
import { rythmeSemaine } from './calculs/rythme';
import {
  changerReglages,
  enregistrerVideo,
  importerVentes,
  quitterExemple,
  rangerAlerte,
  supprimerVideo,
} from './donnees/actions';
import type { ChoixBusiness } from './App';
import { BOUTIQUES, lireRetourTikTok } from './donnees/comptesRelies';
import { donneesExemple } from './donnees/exemple';
import { useDonnees, type Source } from './donnees/useDonnees';
import { useSynchroBoutique } from './donnees/useSynchroBoutique';
import { AjoutFichier, type BilanImport } from './ecrans/AjoutFichier';
import { EcranMessage } from './ecrans/EcranMessage';
import { MesBusiness } from './ecrans/MesBusiness';
import { VueEnsemble } from './ecrans/VueEnsemble';
import { Reglages, type Compte } from './ecrans/Reglages';
import { SaisieVideo } from './ecrans/SaisieVideo';
import { TableauDeBord } from './ecrans/TableauDeBord';
import { dateParis } from './temps';
import type { Vente } from './ventes/modele';

type Fenetre =
  | { type: 'aucune' }
  | { type: 'saisie' }
  | { type: 'modifier'; videoId: string }
  | { type: 'import' }
  | { type: 'reglages' }
  | { type: 'business' }
  | { type: 'ensemble' };

/** L'heure actuelle, remise à jour toutes les 30 secondes (les alertes en dépendent). */
function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(minuteur);
  }, []);
  return maintenant;
}

export function Pilotage({ source, compte, business }: { source: Source; compte?: Compte; business?: ChoixBusiness }) {
  const { donnees, modifier, erreur, effacerErreur, recharger } = useDonnees(source);

  if (!donnees) {
    return (
      <EcranMessage>
        {erreur ? (
          <>
            <p className="erreur" role="alert">
              {erreur}
            </p>
            <button className="bouton principal" onClick={recharger}>
              Réessayer
            </button>
          </>
        ) : (
          <p className="sous-titre">Chargement de tes données…</p>
        )}
      </EcranMessage>
    );
  }

  return (
    <Cockpit
      donnees={donnees}
      modifier={modifier}
      erreur={erreur}
      effacerErreur={effacerErreur}
      enLigne={source.type === 'compte'}
      compte={compte}
      business={business}
    />
  );
}

function Cockpit({
  donnees,
  modifier,
  erreur,
  effacerErreur,
  enLigne,
  compte,
  business,
}: {
  donnees: NonNullable<ReturnType<typeof useDonnees>['donnees']>;
  modifier: ReturnType<typeof useDonnees>['modifier'];
  erreur: string | null;
  effacerErreur: () => void;
  enLigne: boolean;
  compte?: Compte;
  business?: ChoixBusiness;
}) {
  const maintenant = useMaintenant();
  // Au retour de la page d'accord de TikTok, l'adresse porte le code : on finit la liaison dans les réglages.
  const [retourTikTok] = useState(() => (enLigne ? lireRetourTikTok(window.location.search) : null));
  // Les ventes de la boutique reliée arrivent toutes seules (seulement avec la base en ligne).
  const boutique = useSynchroBoutique(modifier, enLigne, retourTikTok, business?.actuel.id ?? null);
  const [periode, setPeriode] = useState<Periode>('7j');
  const [fenetre, setFenetre] = useState<Fenetre>(() => (retourTikTok ? { type: 'reglages' } : { type: 'aucune' }));

  const aujourdhui = dateParis(maintenant);
  const resume = useMemo(() => calculerResume(donnees.ventes, periode, maintenant), [donnees.ventes, periode, maintenant]);
  const rythme = useMemo(
    () => rythmeSemaine(donnees.videos, donnees.reglages.objectifParJour, maintenant),
    [donnees.videos, donnees.reglages.objectifParJour, maintenant],
  );
  // Avec la base en ligne, les données viennent des comptes reliés : rien à noter à la main.
  const relies = boutique.comptes;
  const comptes = useMemo(() => {
    if (!enLigne) return undefined;
    // Liste pas encore arrivée : on ne propose pas de relier ce qui l'est peut-être déjà.
    if (!relies) return { boutique: true, videos: true };
    return {
      boutique: relies.some((c) => (BOUTIQUES as string[]).includes(c.source)),
      videos: relies.some((c) => c.source === 'tiktok' || c.source === 'instagram'),
    };
  }, [enLigne, relies]);
  const alertes = useMemo(
    () => alertesVisibles(calculerAlertes({ ...donnees, maintenant, comptes }), donnees.etatsAlertes, aujourdhui),
    [donnees, maintenant, aujourdhui, comptes],
  );

  const fermer = useCallback(() => setFenetre({ type: 'aucune' }), []);

  const surAction = (action: Action) => {
    switch (action.cible) {
      case 'saisie-video':
        return setFenetre({ type: 'saisie' });
      case 'import':
        return setFenetre({ type: 'import' });
      case 'modifier-video':
        return setFenetre({ type: 'modifier', videoId: action.videoId });
      case 'comptes':
        return setFenetre({ type: 'reglages' });
      case 'actualiser':
        return void boutique.synchroniser();
    }
  };

  const importer = (ventes: Vente[], couverture: string, essai: boolean): BilanImport => {
    let bilan: BilanImport = { ajoutees: 0, misesAJour: 0, inchangees: 0, exempleRetire: false };
    modifier((d) => {
      const r = importerVentes(d, ventes, couverture, { essai });
      const { ajoutees, misesAJour, inchangees } = r.fusion;
      bilan = { ajoutees, misesAJour, inchangees, exempleRetire: r.exempleRetire };
      return r.donnees;
    });
    return bilan;
  };

  const videoAModifier =
    fenetre.type === 'modifier' ? donnees.videos.find((v) => v.id === fenetre.videoId) : undefined;

  const reglages = (
    <button className="bouton icone-seule" aria-label="Réglages" onClick={() => setFenetre({ type: 'reglages' })}>
      ⚙
    </button>
  );
  // En ligne, tout arrive des comptes reliés : on actualise, ou on relie. Sur l'appareil seul, on note à la main.
  const actions = enLigne ? (
    <nav className="barre" aria-label="Actions">
      {relies && relies.length === 0 ? (
        <button className="bouton principal" onClick={() => setFenetre({ type: 'reglages' })}>
          Relier mes comptes
        </button>
      ) : (
        <button className="bouton principal" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
          {boutique.enCours ? 'Actualisation…' : 'Actualiser'}
        </button>
      )}
      {reglages}
    </nav>
  ) : (
    <nav className="barre" aria-label="Actions">
      <button className="bouton principal" onClick={() => setFenetre({ type: 'saisie' })}>
        J’ai publié
      </button>
      <button className="bouton" onClick={() => setFenetre({ type: 'import' })}>
        Fichier de ventes
      </button>
      {reglages}
    </nav>
  );

  return (
    <div className="page">
      {erreur && (
        <div className="bandeau-erreur" role="alert">
          <span>{erreur}</span>
          <button className="bouton discret" onClick={effacerErreur} aria-label="Fermer le message">
            ✕
          </button>
        </div>
      )}
      {enLigne && boutique.erreur && fenetre.type !== 'reglages' && (
        <div className="bandeau-erreur" role="alert">
          <span>Actualisation incomplète : {boutique.erreur}</span>
          <button className="bouton discret" onClick={() => setFenetre({ type: 'reglages' })}>
            Voir mes comptes reliés
          </button>
          <button className="bouton discret" onClick={boutique.effacerErreur} aria-label="Fermer le message">
            ✕
          </button>
        </div>
      )}

      <TableauDeBord
        maintenant={maintenant}
        nomBusiness={business?.actuel.nom}
        onBusiness={business ? () => setFenetre({ type: 'business' }) : undefined}
        onEnsemble={business && business.liste.length > 1 ? () => setFenetre({ type: 'ensemble' }) : undefined}
        automatique={enLigne}
        exemple={donnees.exemple}
        couverture={donnees.couverture}
        periode={periode}
        resume={resume}
        rythme={rythme}
        alertes={alertes}
        actions={actions}
        onPeriode={setPeriode}
        onAction={surAction}
        onRanger={(id, statut) => modifier((d) => rangerAlerte(d, id, statut, aujourdhui))}
        onQuitterExemple={() => modifier((d) => quitterExemple(d))}
        ventesEcartees={boutique.ignorees.length}
      />

      {(fenetre.type === 'saisie' || videoAModifier) && (
        <SaisieVideo
          video={videoAModifier}
          maintenant={maintenant}
          onEnregistrer={(video) => {
            modifier((d) => enregistrerVideo(d, video));
            fermer();
          }}
          onSupprimer={(id) => {
            modifier((d) => supprimerVideo(d, id));
            fermer();
          }}
          onFermer={fermer}
        />
      )}

      {fenetre.type === 'import' && (
        <AjoutFichier maintenant={maintenant} exemple={donnees.exemple} onImporter={importer} onFermer={fermer} />
      )}

      {fenetre.type === 'business' && business && (
        <MesBusiness business={business} onEnsemble={() => setFenetre({ type: 'ensemble' })} onFermer={fermer} />
      )}

      {fenetre.type === 'ensemble' && business && (
        <VueEnsemble
          charger={business.chargerEnsemble}
          actuelId={business.actuel.id}
          maintenant={maintenant}
          onOuvrir={(id) => business.choisir(id)}
          onFermer={fermer}
        />
      )}

      {fenetre.type === 'reglages' && (
        <Reglages
          donnees={donnees}
          maintenant={maintenant}
          enLigne={enLigne}
          compte={compte}
          boutique={enLigne ? boutique : undefined}
          onSaisieManuelle={() => setFenetre({ type: 'saisie' })}
          onImportManuel={() => setFenetre({ type: 'import' })}
          onObjectif={(objectifParJour) => modifier((d) => changerReglages(d, { ...d.reglages, objectifParJour }))}
          onRestaurer={(restaurees) => modifier(() => restaurees)}
          // La confirmation se fait dans les réglages, avant d'arriver ici.
          onRemettreExemple={() => modifier((d) => ({ ...donneesExemple(new Date()), reglages: d.reglages }))}
          onFermer={fermer}
        />
      )}
    </div>
  );
}
