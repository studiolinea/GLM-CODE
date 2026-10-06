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
import { BOUTIQUES, lireRetourTikTok, MESSAGE_PAS_DE_CONNEXION } from './donnees/comptesRelies';
import { donneesExemple } from './donnees/exemple';
import { useDonnees, type Source } from './donnees/useDonnees';
import { useSynchroBoutique } from './donnees/useSynchroBoutique';
import { AjoutFichier, type BilanImport } from './ecrans/AjoutFichier';
import type { CarteCompte } from './ecrans/ComptesRelies';
import { EcranMessage } from './ecrans/EcranMessage';
import { curseurSurEcran } from './ecrans/Feuille';
import { IconeCroix, IconeReglages } from './ecrans/Icones';
import { MesBusiness } from './ecrans/MesBusiness';
import { VueEnsemble } from './ecrans/VueEnsemble';
import { Reglages, type Compte } from './ecrans/Reglages';
import { SaisieVideo } from './ecrans/SaisieVideo';
import { TableauDeBord } from './ecrans/TableauDeBord';
import { dateParis, heureParis, quandParis } from './temps';
import { fr } from './texte';
import type { Vente } from './ventes/modele';

type Fenetre =
  | { type: 'aucune' }
  | { type: 'saisie' }
  | { type: 'modifier'; videoId: string }
  | { type: 'import' }
  /** `cible` : la carte à montrer à l'ouverture (boutique, TikTok, ou tous les comptes reliés). */
  | { type: 'reglages'; cible?: CarteCompte }
  | { type: 'business' }
  | { type: 'ensemble' };

/** L'annonce sur l'écran principal (par exemple : un business supprimé) disparaît toute seule au bout de ce délai. */
const DUREE_ANNONCE_MS = 8000;

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
  // Sans réseau, un business jamais ouvert sur cet appareil ne s'affiche pas : on peut revenir à un autre.
  const [choix, setChoix] = useState(false);

  if (!donnees) {
    return (
      <EcranMessage>
        {erreur ? (
          <>
            <p className="erreur" role="alert">
              {fr(erreur)}
            </p>
            <div className="pied pied-centre">
              <button className="bouton principal" onClick={recharger}>
                Réessayer
              </button>
              {business && business.liste.length > 1 && (
                <button className="bouton" onClick={() => setChoix(true)}>
                  Changer de business
                </button>
              )}
              {compte && (
                <button className="bouton" onClick={() => void compte.deconnecter()}>
                  Se déconnecter
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="sous-titre">Chargement de tes données…</p>
        )}
        {choix && business && <MesBusiness business={business} onFermer={() => setChoix(false)} />}
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
  const [fenetre, setFenetre] = useState<Fenetre>(() => (retourTikTok ? { type: 'reglages', cible: 'tiktok' } : { type: 'aucune' }));

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

  // Un seul bandeau rouge à la fois : l'erreur des données, celle de l'actualisation et celle de TikTok y sont réunies.
  // Les deux dernières restent dans les réglages quand ils sont ouverts (sur la carte du compte concerné).
  const surEcranPrincipal = fenetre.type !== 'reglages';
  const erreurActualisation =
    enLigne && surEcranPrincipal && boutique.erreur && !(erreur && boutique.erreur === MESSAGE_PAS_DE_CONNEXION) // déjà dit
      ? boutique.erreur
      : null;
  const erreurTikTok = surEcranPrincipal && boutique.messageTikTok?.type === 'erreur' ? boutique.messageTikTok.texte : null;
  const succesTikTok = surEcranPrincipal && boutique.messageTikTok?.type === 'succes' ? boutique.messageTikTok.texte : null;
  const rouges = [
    erreur,
    erreurActualisation && (boutique.connexionExpiree ? erreurActualisation : `Actualisation incomplète. ${erreurActualisation}`),
    erreurTikTok,
  ].filter((t): t is string => !!t);
  const effacerRouges = () => {
    effacerErreur();
    boutique.effacerErreur();
    if (erreurTikTok) boutique.effacerMessageTikTok();
  };

  // L'annonce (un business supprimé) s'efface toute seule.
  const effacerAnnonce = business?.effacerAnnonce;
  const annonce = business?.annonce;
  useEffect(() => {
    if (!annonce || !effacerAnnonce) return;
    const minuteur = setTimeout(effacerAnnonce, DUREE_ANNONCE_MS);
    return () => clearTimeout(minuteur);
  }, [annonce, effacerAnnonce]);

  const surAction = (action: Action) => {
    switch (action.cible) {
      case 'saisie-video':
        return setFenetre({ type: 'saisie' });
      case 'import':
        return setFenetre({ type: 'import' });
      case 'modifier-video':
        return setFenetre({ type: 'modifier', videoId: action.videoId });
      case 'comptes':
        return setFenetre({ type: 'reglages', cible: action.compte ?? 'comptes' });
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
      <IconeReglages />
    </button>
  );
  // « À jour à 04h47 » : la dernière actualisation réussie d'un compte relié (le jour aussi, si ce n'est pas aujourd'hui).
  const derniere = relies?.reduce<string | null>((plus, c) => (c.derniereSynchro && (!plus || c.derniereSynchro > plus) ? c.derniereSynchro : plus), null);
  const aJour = derniere
    ? dateParis(new Date(derniere)) === aujourdhui
      ? `à jour à ${heureParis(new Date(derniere)).replace(':', 'h')}`
      : `à jour le ${quandParis(new Date(derniere))}`
    : null;
  // En ligne, tout arrive des comptes reliés : on actualise, ou on relie. Sur l'appareil seul, on note à la main.
  const actions = enLigne ? (
    <nav className="barre" aria-label="Actions">
      {relies && relies.length === 0 ? (
        <button className="bouton principal" onClick={() => setFenetre({ type: 'reglages', cible: 'comptes' })}>
          Relier mes comptes
        </button>
      ) : (
        <button className="bouton principal actualiser" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
          <span className="actualiser-texte">{boutique.enCours ? 'Actualisation…' : 'Actualiser'}</span>
          {aJour && !boutique.enCours && <span className="a-jour">{aJour}</span>}
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
      {rouges.length > 0 && (
        <div className="bandeau-erreur" role="alert">
          <span className="bandeau-texte">
            {rouges.map((texte) => (
              <span key={texte} className="bandeau-ligne">
                {fr(texte)}
              </span>
            ))}
          </span>
          {boutique.connexionExpiree && compte ? (
            <button className="bouton discret bandeau-action" onClick={() => void compte.deconnecter()}>
              Me reconnecter
            </button>
          ) : (
            (erreurActualisation || erreurTikTok) && (
              <button
                className="bouton discret bandeau-action"
                onClick={() => setFenetre({ type: 'reglages', cible: erreurActualisation ? 'comptes' : 'tiktok' })}
              >
                Voir
              </button>
            )
          )}
          <button className="bouton discret icone-seule bandeau-fermer" onClick={() => { curseurSurEcran(); effacerRouges(); }} aria-label="Fermer le message">
            <IconeCroix />
          </button>
        </div>
      )}
      {succesTikTok && (
        <div className="bandeau-info bandeau-succes" role="status">
          <span className="bandeau-texte">{fr(succesTikTok)}</span>
          <button
            className="bouton discret icone-seule bandeau-fermer"
            onClick={boutique.effacerMessageTikTok}
            aria-label="Fermer le message"
          >
            <IconeCroix />
          </button>
        </div>
      )}
      {business?.annonce && (
        <div className="bandeau-info" role="status">
          <span className="bandeau-texte">{fr(business.annonce)}</span>
          <button className="bouton discret icone-seule bandeau-fermer" onClick={business.effacerAnnonce} aria-label="Fermer le message">
            <IconeCroix />
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
        <AjoutFichier
          maintenant={maintenant}
          exemple={donnees.exemple}
          enLigne={enLigne}
          onImporter={importer}
          onFermer={fermer}
        />
      )}

      {fenetre.type === 'business' && business && (
        <MesBusiness business={business} exemple={donnees.exemple} onEnsemble={() => setFenetre({ type: 'ensemble' })} onFermer={fermer} />
      )}

      {fenetre.type === 'ensemble' && business && (
        <VueEnsemble
          charger={business.chargerEnsemble}
          actuelId={business.actuel.id}
          maintenant={maintenant}
          periodeInitiale={periode}
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
          business={business?.actuel}
          cible={fenetre.cible}
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
