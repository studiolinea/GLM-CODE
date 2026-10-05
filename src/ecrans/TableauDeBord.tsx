import type { ReactNode } from 'react';
import type { Action, Alerte } from '../alertes/alertes';
import { formatEuros } from '../argent';
import { PERIODES, type Periode, type Resume } from '../calculs/resume';
import type { Rythme } from '../calculs/rythme';
import { quandParis } from '../temps';
import { CarteAlerte } from './CarteAlerte';
import { Jauge } from './Jauge';
import { Odometre } from './Odometre';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Libellés courts du sélecteur de période, comme le levier d'une boîte automatique. */
const COURTS: Record<Periode, string> = { '7j': '7 J', '1m': '1 M', '3m': '3 M' };

export function TableauDeBord({
  maintenant,
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
}: {
  maintenant: Date;
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
}) {
  // Sans aucun fichier ni vente, on n'affiche pas de chiffres : « — ».
  const sansDonnees = !couverture && resume.commandes === 0 && resume.nbRemboursements === 0;
  const euros = (centimes: number | null) => (sansDonnees || centimes === null ? '—' : formatEuros(centimes));

  return (
    <>
      <header className="entete">
        <div className="entete-haut">
          <div>
            <div className="marque">
              PILOTAGE
              {exemple && <span className="tag">EXEMPLE</span>}
            </div>
            <p className="sous-titre">Ma boutique · {FORMAT_JOUR.format(maintenant)}</p>
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
          tu notes une vraie vidéo ou que tu ajoutes un vrai fichier de ventes.{' '}
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
              <b>{sansDonnees ? '—' : resume.commandes}</b>
            </div>
            <div className="lecture">
              <span className="etiquette">Panier moyen</span>
              <b>{euros(resume.panierMoyenCentimes)}</b>
            </div>
            <div className="lecture gains">
              <span className="etiquette">Gains réels</span>
              <b>{euros(resume.gainsCentimes)}</b>
            </div>
            <div className="lecture">
              <span className="etiquette">Remboursé</span>
              <b>{euros(resume.remboursementsCentimes)}</b>
            </div>
          </div>

          {!sansDonnees && resume.gainsCentimes === null && (
            <p className="note alerte-note">
              Frais non fournis par la boutique pour {resume.ventesSansFrais} vente
              {resume.ventesSansFrais > 1 ? 's' : ''} : pas de gains devinés.
            </p>
          )}
          <p className="note">Gains = ventes moins commissions et frais. Avant impôts et cotisations.</p>
          <p className="note">
            {couverture ? `Ventes chargées jusqu’au ${quandParis(new Date(couverture))}.` : 'Aucun fichier de ventes ajouté.'}
          </p>
        </section>

        <section className="zone-voyants" aria-labelledby="titre-voyants">
          <div className="titre-section">
            <h2 id="titre-voyants">Voyants</h2>
            <span className="compteur">{alertes.length === 0 ? 'tout est éteint' : `${alertes.length} à traiter`}</span>
          </div>
          {alertes.length === 0 ? (
            <p className="rien">Aucun voyant allumé. Note ta prochaine vidéo avec « J’ai publié ».</p>
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
