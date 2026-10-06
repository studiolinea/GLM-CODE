import type { ReactNode } from 'react';
import type { Action, Alerte } from '../alertes/alertes';
import { formatEuros } from '../argent';
import { PERIODES, type Periode, type Resume } from '../calculs/resume';
import type { Rythme } from '../calculs/rythme';
import { quandParis } from '../temps';
import { nombre, PHRASE_GAINS } from '../texte';
import { CarteAlerte } from './CarteAlerte';
import { IconeChevron, Logo } from './Icones';
import { Jauge } from './Jauge';
import { Odometre } from './Odometre';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** « Mardi 6 octobre 2026 » : la date du jour à Paris, avec une majuscule. */
function jourEnTete(maintenant: Date): string {
  const jour = FORMAT_JOUR.format(maintenant);
  return jour.charAt(0).toUpperCase() + jour.slice(1);
}

/** Libellés courts du sélecteur de période, comme le levier d'une boîte automatique. */
const COURTS: Record<Periode, string> = { '7j': '7 J', '1m': '1 M', '3m': '3 M' };

export function TableauDeBord({
  maintenant,
  nomBusiness,
  onBusiness,
  onEnsemble,
  automatique = false,
  exemple,
  couverture,
  periode,
  resume,
  rythme,
  alertes,
  actions,
  onPeriode,
  onAction,
  onRanger,
  onQuitterExemple,
  ventesEcartees = 0,
}: {
  maintenant: Date;
  /** Le business affiché (avec la base en ligne) ; un appui ouvre « Mes business ». */
  nomBusiness?: string;
  onBusiness?: () => void;
  /** Ouvre la vue d'ensemble (à partir de deux business). */
  onEnsemble?: () => void;
  /** Vrai avec la base en ligne : ventes et vidéos arrivent des comptes reliés. */
  automatique?: boolean;
  exemple: boolean;
  couverture: string | null;
  periode: Periode;
  resume: Resume;
  rythme: Rythme;
  alertes: Alerte[];
  /** Boutons d'action : en haut sur ordinateur, collés en bas sur téléphone. */
  actions: ReactNode;
  onPeriode: (p: Periode) => void;
  onAction: (action: Action) => void;
  onRanger: (id: string, statut: 'fait' | 'plus-tard') => void;
  onQuitterExemple: () => void;
  /** Ventes envoyées par la boutique mais pas comptées (autre devise…). */
  ventesEcartees?: number;
}) {
  // Sans aucun fichier ni vente, on n'affiche pas de chiffres : « — ».
  const sansDonnees = !couverture && resume.commandes === 0 && resume.nbRemboursements === 0;
  const euros = (centimes: number | null) => (sansDonnees || centimes === null ? '—' : formatEuros(centimes));
  // Un « — » (pas de valeur) reste gris : jamais en vert comme un vrai gain.
  const valeur = (texte: string | number) => <b className={texte === '—' ? 'vide' : undefined}>{texte}</b>;

  return (
    <>
      <header className="entete">
        <div className="entete-haut">
          <div className="entete-titre">
            <div className="marque">
              <Logo />
              PILOTAGE
              {exemple && <span className="tag">EXEMPLE</span>}
            </div>
            <p className="sous-titre">
              {onBusiness ? '' : 'Ma boutique · '}
              {jourEnTete(maintenant)}
            </p>
            {onBusiness && (
              <button className="selecteur-business" onClick={onBusiness} aria-label={`Business ouvert : ${nomBusiness}. Changer de business`}>
                <span className="selecteur-business-texte">
                  <span className="etiquette">Business</span>
                  <span className="selecteur-business-nom">{nomBusiness}</span>
                </span>
                <span className="selecteur-business-action" aria-hidden="true">
                  Changer <IconeChevron taille={16} />
                </span>
              </button>
            )}
            {onEnsemble && (
              <button className="lien-ensemble" onClick={onEnsemble}>
                Vue d’ensemble de mes business
              </button>
            )}
          </div>
          {actions}
        </div>
        <div className="boite" role="group" aria-label="Période">
          {(Object.keys(PERIODES) as Periode[]).map((p) => (
            <button
              key={p}
              className="rapport"
              aria-pressed={p === periode}
              aria-label={PERIODES[p].libelle}
              onClick={() => onPeriode(p)}
            >
              {COURTS[p]}
            </button>
          ))}
        </div>
      </header>

      {exemple && (
        <div className="bandeau-exemple" role="note">
          <strong>DONNÉES D’EXEMPLE</strong> Ces chiffres sont inventés pour te montrer l’appli. Ils disparaissent dès que
          {automatique
            ? ' tes comptes reliés envoient de vraies ventes ou de vraies vidéos.'
            : ' tu notes une vraie vidéo ou que tu ajoutes un vrai fichier de ventes.'}{' '}
          <button className="lien-bandeau" onClick={onQuitterExemple}>
            Commencer avec mes vraies données
          </button>
        </div>
      )}

      <div className="cockpit">
        <section className="tableau" aria-label="Tes chiffres">
          {rythme.objectif > 0 && <Jauge valeur={rythme.publiees} max={rythme.objectif} />}

          <div className="etiquette">Ventes · {PERIODES[periode].libelle}</div>
          {sansDonnees ? <div className="odo-vide">—</div> : <Odometre centimes={resume.ventesCentimes} />}

          <div className="lectures">
            <div className="lecture">
              <span className="etiquette">Commandes</span>
              {valeur(sansDonnees ? '—' : resume.commandes)}
            </div>
            <div className="lecture">
              <span className="etiquette">Panier moyen</span>
              {valeur(euros(resume.panierMoyenCentimes))}
            </div>
            <div className="lecture gains">
              <span className="etiquette">Gains réels</span>
              {valeur(euros(resume.gainsCentimes))}
            </div>
            <div className="lecture">
              <span className="etiquette">Remboursé</span>
              {valeur(euros(resume.remboursementsCentimes))}
            </div>
          </div>

          {!sansDonnees && resume.gainsCentimes === null && (
            <p className="note alerte-note">
              Frais non fournis par la boutique pour {resume.ventesSansFrais} vente
              {resume.ventesSansFrais > 1 ? 's' : ''} : pas de gains devinés.
            </p>
          )}
          {resume.tvaCentimes !== null && (
            <p className="note">
              TVA retenue par la boutique : {euros(resume.tvaCentimes)}. Elle est payée par tes clients et reversée à
              l’État, donc pas comptée dans tes ventes.
            </p>
          )}
          {ventesEcartees > 0 && (
            <p className="note alerte-note">
              {ventesEcartees} vente{ventesEcartees > 1 ? 's' : ''} de ta boutique pas comptée{ventesEcartees > 1 ? 's' : ''} ici
              (autre devise…) : le détail est dans les réglages.
            </p>
          )}
          <p className="note">{PHRASE_GAINS}</p>
          <p className="note">
            {couverture ? `Ventes chargées jusqu’au ${quandParis(new Date(couverture))}.` : automatique ? 'Aucune vente lue pour l’instant.' : 'Aucun fichier de ventes ajouté.'}
          </p>
        </section>

        <section className="zone-voyants" aria-labelledby="titre-voyants">
          <div className="titre-section">
            <h2 id="titre-voyants">Voyants</h2>
            <span className="compteur">{alertes.length === 0 ? 'tout est éteint' : nombre(alertes.length, 'allumé')}</span>
          </div>
          {alertes.length === 0 ? (
            <p className="rien">
              {automatique
                ? 'Aucun voyant allumé. Tes ventes et tes vidéos arrivent toutes seules.'
                : 'Aucun voyant allumé. Note ta prochaine vidéo avec « J’ai publié ».'}
            </p>
          ) : (
            <ul className="alertes">
              {alertes.map((a) => (
                <CarteAlerte key={a.id} alerte={a} onAction={onAction} onRanger={(statut) => onRanger(a.id, statut)} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
