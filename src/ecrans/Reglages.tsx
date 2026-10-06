import { useEffect, useRef, useState } from 'react';
import { nomFichierSauvegarde, ouvrirSauvegarde, questionRestauration, versSauvegarde, type Sauvegarde } from '../donnees/actions';
import type { SynchroBoutique } from '../donnees/useSynchroBoutique';
import type { Donnees } from '../modele';
import { dateParis } from '../temps';
import { accord, fr } from '../texte';
import { ComptesRelies, ID_CARTES, type CarteCompte } from './ComptesRelies';
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
  cible,
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
  /** La carte à montrer à l'ouverture (depuis un voyant, au retour de TikTok…). */
  cible?: CarteCompte;
  /** La promesse dit si l'objectif est bien enregistré. */
  onObjectif: (objectifParJour: number) => Promise<boolean>;
  /** En secours seulement (en ligne, tout arrive des comptes reliés). */
  onSaisieManuelle?: () => void;
  onImportManuel?: () => void;
  /** La promesse dit si la sauvegarde est bien enregistrée. */
  onRestaurer: (donnees: Donnees) => Promise<boolean>;
  onRemettreExemple: () => void;
  onFermer: () => void;
}) {
  // L'objectif affiché est toujours celui enregistré : si l'enregistrement échoue, l'appli revient en arrière, et lui aussi.
  const objectif = donnees.reglages.objectifParJour;
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  // La sauvegarde choisie, en attente de confirmation.
  const [aRestaurer, setARestaurer] = useState<Sauvegarde | null>(null);
  const [restauration, setRestauration] = useState(false);
  const [erreurObjectif, setErreurObjectif] = useState(false);

  // Ouverts depuis un voyant ou au retour de TikTok : on va jusqu'à la carte concernée, dès qu'elle est affichée.
  const defile = useRef(false);
  const comptesArrives = boutique?.comptes !== null;
  useEffect(() => {
    if (!cible || defile.current || !comptesArrives) return;
    const carte = document.getElementById(ID_CARTES[cible]);
    if (!carte) return;
    defile.current = true;
    const reduit = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    carte.scrollIntoView({ block: 'start', behavior: reduit ? 'auto' : 'smooth' });
  }, [cible, comptesArrives]);

  const changerObjectif = async (n: number) => {
    const voulu = Math.min(OBJECTIF_MAX, Math.max(0, n));
    if (voulu === objectif) return;
    setErreurObjectif(false);
    // Si la base refuse, l'objectif revient tout seul à sa valeur d'avant : on le dit ici, dans la fenêtre.
    setErreurObjectif(!(await onObjectif(voulu)));
  };

  const choisirSauvegarde = async (fichier: File) => {
    setMessage(null);
    setConfirmer(false);
    const resultat = ouvrirSauvegarde(await fichier.text());
    if (typeof resultat === 'string') {
      setARestaurer(null);
      return setMessage({ type: 'erreur', texte: resultat });
    }
    // En ligne, les données d'exemple ne vont jamais dans la base : elles disparaîtraient au prochain chargement.
    if (enLigne && resultat.donnees.exemple) {
      setARestaurer(null);
      return setMessage({ type: 'erreur', texte: 'Cette sauvegarde ne contient que les données d’exemple : rien à restaurer.' });
    }
    setARestaurer(resultat);
  };

  const restaurer = async () => {
    if (!aRestaurer || restauration) return;
    setRestauration(true);
    setMessage(null);
    const ok = await onRestaurer(aRestaurer.donnees);
    setRestauration(false);
    setARestaurer(null);
    setMessage(
      ok
        ? { type: 'succes', texte: 'Sauvegarde restaurée.' }
        : {
            type: 'erreur',
            texte: 'La sauvegarde n’a pas pu être enregistrée : tes données n’ont pas changé. Réessaie quand le réseau revient.',
          },
    );
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
            // aria-disabled plutôt que disabled : au clavier, le curseur reste sur le bouton à 0.
            aria-disabled={objectif <= 0}
            onClick={() => void changerObjectif(objectif - 1)}
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
            aria-disabled={objectif >= OBJECTIF_MAX}
            onClick={() => void changerObjectif(objectif + 1)}
          >
            <IconePlus />
          </button>
          <span className="texte-doux">{objectif === 0 ? 'pas de rappel' : `${accord(objectif, 'vidéo')} par jour`}</span>
        </div>
        {erreurObjectif && (
          <p className="erreur" role="alert">
            L’objectif n’a pas pu être enregistré. Réessaie dans un moment.
          </p>
        )}
      </section>

      {boutique && (
        <>
          <hr className="separateur" />
          <ComptesRelies boutique={boutique} onReconnecter={compte ? () => void compte.deconnecter() : undefined} />
          {(onSaisieManuelle || onImportManuel) && (
            <>
              <hr className="separateur" />
              <h3 className="titre-reglage">À la main, en secours</h3>
              <p className="texte-doux">
                Tout arrive tout seul de tes comptes reliés. Ces boutons ne servent qu’en secours : noter une vidéo
                Instagram (pas encore reliée), ou ajouter un fichier de ventes au format de l’appli.
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
        <div role="alert" className="confirmation">
          <p className="erreur">{fr(questionRestauration(aRestaurer.business, business))}</p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton danger" disabled={restauration} onClick={() => void restaurer()}>
              {restauration ? 'Restauration…' : 'Remplacer par la sauvegarde'}
            </button>
            <button type="button" className="bouton discret" disabled={restauration} onClick={() => setARestaurer(null)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {confirmer && (
        <div role="alert" className="confirmation">
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
