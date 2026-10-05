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
import { donneesExemple } from './donnees/exemple';
import { chargerDonnees, enregistrerDonnees } from './donnees/stockage';
import { AjoutFichier, type BilanImport } from './ecrans/AjoutFichier';
import { Reglages } from './ecrans/Reglages';
import { SaisieVideo } from './ecrans/SaisieVideo';
import { TableauDeBord } from './ecrans/TableauDeBord';
import type { Donnees } from './modele';
import { dateParis } from './temps';
import type { Vente } from './ventes/modele';
import './style.css';

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

export function App() {
  const maintenant = useMaintenant();
  const [donnees, setDonnees] = useState<Donnees>(() => chargerDonnees(new Date()));
  const [periode, setPeriode] = useState<Periode>('7j');
  const [fenetre, setFenetre] = useState<Fenetre>({ type: 'aucune' });
  const [stockageOk, setStockageOk] = useState(true);

  useEffect(() => setStockageOk(enregistrerDonnees(donnees)), [donnees]);

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
    const r = importerVentes(donnees, ventes, couverture, { essai });
    setDonnees(r.donnees);
    const { ajoutees, misesAJour, inchangees } = r.fusion;
    return { ajoutees, misesAJour, inchangees, exempleRetire: r.exempleRetire };
  };

  // La confirmation se fait dans les réglages, avant d'arriver ici.
  const remettreExemple = () => setDonnees((d) => ({ ...donneesExemple(new Date()), reglages: d.reglages }));

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
      {!stockageOk && (
        <p className="bandeau-exemple" role="alert">
          Attention : cet appareil n’enregistre pas tes données (navigation privée ?). Elles seront perdues en fermant la page.
        </p>
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
        onRanger={(id, statut) => setDonnees((d) => rangerAlerte(d, id, statut, aujourdhui))}
        onQuitterExemple={() => setDonnees((d) => quitterExemple(d))}
      />

      {(fenetre.type === 'saisie' || videoAModifier) && (
        <SaisieVideo
          video={videoAModifier}
          maintenant={maintenant}
          onEnregistrer={(video) => {
            setDonnees((d) => enregistrerVideo(d, video));
            fermer();
          }}
          onSupprimer={(id) => {
            setDonnees((d) => supprimerVideo(d, id));
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
          onObjectif={(objectifParJour) => setDonnees((d) => changerReglages(d, { ...d.reglages, objectifParJour }))}
          onRestaurer={setDonnees}
          onRemettreExemple={remettreExemple}
          onFermer={fermer}
        />
      )}
    </div>
  );
}
