import { useState } from 'react';
import { nomFichierSauvegarde, ouvrirSauvegarde, questionRestauration, versSauvegarde, type Sauvegarde } from '../donnees/actions';
import type { SynchroBoutique } from '../donnees/useSynchroBoutique';
import type { Donnees } from '../modele';
import { dateParis } from '../temps';
import { accord, fr } from '../texte';
import { ComptesRelies } from './ComptesRelies';
import { Feuille, telecharger } from './Feuille';
import { IconeMoins, IconePlus } from './Icones';
import { LiensLegaux } from './LiensLegaux';

const OBJECTIF_MAX = 20;

/** Le compte connecté, quand l'appli est reliée à la base en ligne. */
export interface Compte {
  email: string;
  deconnecter: () => Promise<void>;
}

export function Reglages({
  donnees,
  maintenant,
  enLigne,
  compte,
  business,
  boutique,
  onObjectif,
  onSaisieManuelle,
  onImportManuel,
  onRestaurer,
  onRemettreExemple,
  onFermer,
}: {
  donnees: Donnees;
  maintenant: Date;
  enLigne: boolean;
  compte?: Compte;
  /** Le business ouvert (avec la base en ligne) : la sauvegarde porte son nom. */
  business?: { id: string; nom: string };
  /** Les comptes reliés (boutique, réseaux), seulement avec la base en ligne. */
  boutique?: SynchroBoutique;
  onObjectif: (objectifParJour: number) => void;
  /** En secours seulement (en ligne, tout arrive des comptes reliés). */
  onSaisieManuelle?: () => void;
  onImportManuel?: () => void;
  onRestaurer: (donnees: Donnees) => void;
  onRemettreExemple: () => void;
  onFermer: () => void;
}) {
  const [objectif, setObjectif] = useState(donnees.reglages.objectifParJour);
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  // La sauvegarde choisie, en attente de confirmation.
  const [aRestaurer, setARestaurer] = useState<Sauvegarde | null>(null);

  const changerObjectif = (n: number) => {
    const borne = Math.min(OBJECTIF_MAX, Math.max(0, n));
    setObjectif(borne);
    onObjectif(borne);
  };

  const choisirSauvegarde = async (fichier: File) => {
    setMessage(null);
    setConfirmer(false);
    const resultat = ouvrirSauvegarde(await fichier.text());
    if (typeof resultat === 'string') {
      setARestaurer(null);
      return setMessage({ type: 'erreur', texte: resultat });
    }
    setARestaurer(resultat);
  };

  const restaurer = () => {
    if (!aRestaurer) return;
    onRestaurer(aRestaurer.donnees);
    setObjectif(aRestaurer.donnees.reglages.objectifParJour);
    setARestaurer(null);
    setMessage({ type: 'succes', texte: 'Sauvegarde restaurée.' });
  };

  return (
    <Feuille titre="Réglages" onFermer={onFermer}>
      <section aria-labelledby="titre-objectif">
        <h3 id="titre-objectif" className="titre-reglage">
          Objectif
        </h3>
        <p id="question-objectif" className="texte-doux">
          Combien de vidéos par jour ? Mets 0 pour ne plus avoir de rappel.
        </p>
        <div className="objectif" role="group" aria-labelledby="question-objectif">
          <button
            type="button"
            className="bouton icone-seule"
            aria-label="Une vidéo de moins"
            disabled={objectif <= 0}
            onClick={() => changerObjectif(objectif - 1)}
          >
            <IconeMoins />
          </button>
          <output id="objectif-par-jour" className="objectif-valeur" aria-live="polite">
            {objectif}
          </output>
          <button
            type="button"
            className="bouton icone-seule"
            aria-label="Une vidéo de plus"
            disabled={objectif >= OBJECTIF_MAX}
            onClick={() => changerObjectif(objectif + 1)}
          >
            <IconePlus />
          </button>
          <span className="texte-doux">{objectif === 0 ? 'pas de rappel' : `${accord(objectif, 'vidéo')} par jour`}</span>
        </div>
      </section>

      {boutique && (
        <>
          <hr className="separateur" />
          <ComptesRelies boutique={boutique} />
          {(onSaisieManuelle || onImportManuel) && (
            <>
              <hr className="separateur" />
              <h3 className="titre-reglage">À la main, en secours</h3>
              <p className="texte-doux">
                Tout arrive tout seul de tes comptes reliés. Ces boutons ne servent qu’en secours : une vidéo Instagram
                (pas encore reliée) ou un fichier de ventes d’une autre plateforme.
              </p>
              <div className="pied" style={{ justifyContent: 'flex-start' }}>
                {onSaisieManuelle && (
                  <button type="button" className="bouton" onClick={onSaisieManuelle}>
                    Noter une vidéo
                  </button>
                )}
                {onImportManuel && (
                  <button type="button" className="bouton" onClick={onImportManuel}>
                    Ajouter un fichier de ventes
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}

      <hr className="separateur" />
      <h3 className="titre-reglage">Sauvegarde</h3>
      <p className="texte-doux">
        {enLigne
          ? 'Tes données sont dans ta base en ligne : les mêmes sur le Mac et le téléphone. La sauvegarde en fait une copie dans un fichier, au cas où.'
          : 'Tes données sont gardées sur cet appareil. La sauvegarde en fait une copie dans un fichier, au cas où.'}
      </p>
      {message && (
        <p className={message.type} role="status">
          {fr(message.texte)}
        </p>
      )}
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="bouton"
          onClick={() =>
            telecharger(
              nomFichierSauvegarde(business?.nom, dateParis(maintenant)),
              versSauvegarde(donnees, business),
              'application/json',
            )
          }
        >
          Sauvegarder
        </button>
        {/* Le champ reste dans la page (caché à l'œil) : on l'atteint aussi au clavier, avec Tab. */}
        <label className="bouton choix-fichier">
          Restaurer
          <input
            id="restaurer-sauvegarde"
            className="cache"
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void choisirSauvegarde(fichier);
              e.target.value = '';
            }}
          />
        </label>
        {!enLigne && !donnees.exemple && !confirmer && !aRestaurer && (
          <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
            Revoir l’exemple
          </button>
        )}
      </div>

      {aRestaurer && (
        <div role="alert" style={{ marginTop: 14 }}>
          <p className="erreur">{fr(questionRestauration(aRestaurer.business, business))}</p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton danger" onClick={restaurer}>
              Remplacer par la sauvegarde
            </button>
            <button type="button" className="bouton discret" onClick={() => setARestaurer(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {confirmer && (
        <div role="alert" style={{ marginTop: 14 }}>
          <p className="erreur">
            Tes données seront remplacées par l’exemple. Fais une sauvegarde avant si tu veux les garder.
          </p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="bouton danger"
              onClick={() => {
                onRemettreExemple();
                setConfirmer(false);
                setMessage({ type: 'succes', texte: 'Les données d’exemple sont de retour.' });
              }}
            >
              Remplacer par l’exemple
            </button>
            <button type="button" className="bouton discret" onClick={() => setConfirmer(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {compte && (
        <>
          <hr className="separateur" />
          <h3 className="titre-reglage">Mon compte</h3>
          <p className="texte-doux">Connecté avec {compte.email}.</p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton" onClick={() => void compte.deconnecter()}>
              Se déconnecter
            </button>
          </div>
        </>
      )}

      <div className="pied">
        <button type="button" className="bouton principal" onClick={onFermer}>
          Fermer
        </button>
      </div>
      <LiensLegaux />
    </Feuille>
  );
}
