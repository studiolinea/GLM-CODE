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
import { lireRetourTikTok } from './donnees/comptesRelies';
import { donneesExemple } from './donnees/exemple';
import { useDonnees, type Source } from './donnees/useDonnees';
import { useSynchroBoutique } from './donnees/useSynchroBoutique';
import { AjoutFichier, type BilanImport } from './ecrans/AjoutFichier';
import { EcranMessage } from './ecrans/EcranMessage';
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
  | { type: 'reglages' };

/** L'heure actuelle, remise à jour toutes les 30 secondes (les alertes en dépendent). */
function useMaintenant(): Date {
  const [maintenant, setMaintenant] = useState(() => new Date());
  useEffect(() => {
    const minuteur = setInterval(() => setMaintenant(new Date()), 30_000);
    return () => clearInterval(minuteur);
  }, []);
  return maintenant;
}

export function Pilotage({ source, compte }: { source: Source; compte?: Compte }) {
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
}: {
  donnees: NonNullable<ReturnType<typeof useDonnees>['donnees']>;
  modifier: ReturnType<typeof useDonnees>['modifier'];
  erreur: string | null;
  effacerErreur: () => void;
  enLigne: boolean;
  compte?: Compte;
}) {
  const maintenant = useMaintenant();
  // Au retour de la page d'accord de TikTok, l'adresse porte le code : on finit la liaison dans les réglages.
  const [retourTikTok] = useState(() => (enLigne ? lireRetourTikTok(window.location.search) : null));
  // Les ventes de la boutique reliée arrivent toutes seules (seulement avec la base en ligne).
  const boutique = useSynchroBoutique(modifier, enLigne, retourTikTok);
  const [periode, setPeriode] = useState<Periode>('7j');
  const [fenetre, setFenetre] = useState<Fenetre>(() => (retourTikTok ? { type: 'reglages' } : { type: 'aucune' }));

  const aujourdhui = dateParis(maintenant);
  const resume = useMemo(() => calculerResume(donnees.ventes, periode, maintenant), [donnees.ventes, periode, maintenant]);
  const rythme = useMemo(
    () => rythmeSemaine(donnees.videos, donnees.reglages.objectifParJour, maintenant),
    [donnees.videos, donnees.reglages.objectifParJour, maintenant],
  );
  const alertes = useMemo(
    () => alertesVisibles(calculerAlertes({ ...donnees, maintenant }), donnees.etatsAlertes, aujourdhui),
    [donnees, maintenant, aujourdhui],
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

  const actions = (
    <nav className="barre" aria-label="Actions">
      <button className="bouton principal" onClick={() => setFenetre({ type: 'saisie' })}>
        J’ai publié
      </button>
      <button className="bouton" onClick={() => setFenetre({ type: 'import' })}>
        Fichier de ventes
      </button>
      <button className="bouton icone-seule" aria-label="Réglages" onClick={() => setFenetre({ type: 'reglages' })}>
        ⚙
      </button>
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

      <TableauDeBord
        maintenant={maintenant}
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

      {fenetre.type === 'reglages' && (
        <Reglages
          donnees={donnees}
          maintenant={maintenant}
          enLigne={enLigne}
          compte={compte}
          boutique={enLigne ? boutique : undefined}
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
