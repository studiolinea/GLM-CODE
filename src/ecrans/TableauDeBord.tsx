import type { Action, Alerte } from '../alertes/alertes';
import { formatEuros } from '../argent';
import { PERIODES, type Periode, type Resume } from '../calculs/resume';
import { quandParis } from '../temps';
import { CarteAlerte } from './CarteAlerte';

const FORMAT_JOUR = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function TableauDeBord({
  maintenant,
  exemple,
  couverture,
  periode,
  resume,
  alertes,
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
  alertes: Alerte[];
  onPeriode: (p: Periode) => void;
  onAction: (action: Action) => void;
  onRanger: (id: string, statut: 'fait' | 'plus-tard') => void;
  onQuitterExemple: () => void;
}) {
  const aucuneVente = resume.commandes === 0 && resume.nbRemboursements === 0;

  return (
    <>
      <header className="entete">
        <div>
          <h1>Pilotage</h1>
          <p className="sous-titre">Ma boutique — {FORMAT_JOUR.format(maintenant)}</p>
        </div>
        <div className="periodes" role="group" aria-label="Période">
          {(Object.keys(PERIODES) as Periode[]).map((p) => (
            <button key={p} className="periode" aria-pressed={p === periode} onClick={() => onPeriode(p)}>
              {PERIODES[p].libelle}
            </button>
          ))}
        </div>
      </header>

      {exemple && (
        <div className="bandeau-exemple" role="note">
          <strong>DONNÉES D’EXEMPLE</strong> — ces chiffres sont inventés pour te montrer l’appli. Ils disparaissent dès
          que tu notes une vraie vidéo ou que tu ajoutes un vrai fichier de ventes.{' '}
          <button className="bouton discret" style={{ color: 'inherit', padding: '2px 6px' }} onClick={onQuitterExemple}>
            Commencer avec mes vraies données
          </button>
        </div>
      )}

      <section className="cartes">
        <div className="carte">
          <p className="etiquette">Ton résumé · {PERIODES[periode].libelle}</p>
          <div className="chiffres">
            <div>
              <div className="chiffre-valeur">{formatEuros(resume.ventesCentimes)}</div>
              <div className="chiffre-nom">Ventes</div>
            </div>
            <div>
              <div className="chiffre-valeur">{resume.commandes}</div>
              <div className="chiffre-nom">Commandes</div>
            </div>
            <div>
              <div className="chiffre-valeur">
                {resume.panierMoyenCentimes === null ? '—' : formatEuros(resume.panierMoyenCentimes)}
              </div>
              <div className="chiffre-nom">Panier moyen</div>
            </div>
          </div>
          <p className="precision">
            {couverture ? `Ventes chargées jusqu’au ${quandParis(new Date(couverture))}.` : 'Aucun fichier de ventes ajouté.'}
            {resume.nbRemboursements > 0 &&
              ` ${resume.nbRemboursements} remboursement${resume.nbRemboursements > 1 ? 's' : ''} (${formatEuros(
                resume.remboursementsCentimes,
              )}) mis à part.`}
          </p>
        </div>

        <div className="carte">
          <p className="etiquette">Gains réels</p>
          {aucuneVente && !couverture ? (
            <div className="gros-chiffre">—</div>
          ) : resume.gainsCentimes === null ? (
            <>
              <div className="gros-chiffre">—</div>
              <p className="explication">
                Frais non fournis par la boutique pour {resume.ventesSansFrais} vente
                {resume.ventesSansFrais > 1 ? 's' : ''} : on ne devine pas.
              </p>
            </>
          ) : (
            <div className="gros-chiffre vert">{formatEuros(resume.gainsCentimes)}</div>
          )}
          <p className="explication">
            Tes ventes moins les commissions et frais de la boutique. Avant impôts et cotisations.
          </p>
        </div>
      </section>

      <section aria-labelledby="titre-aujourdhui">
        <div className="titre-section">
          <h2 id="titre-aujourdhui">Aujourd’hui</h2>
          <span className="compteur">
            {alertes.length === 0 ? 'rien à traiter' : `${alertes.length} à traiter`}
          </span>
        </div>
        {alertes.length === 0 ? (
          <p className="rien">Rien à signaler pour l’instant. Note ta prochaine vidéo avec « J’ai publié ».</p>
        ) : (
          <ul className="alertes">
            {alertes.map((a) => (
              <CarteAlerte key={a.id} alerte={a} onAction={onAction} onRanger={(statut) => onRanger(a.id, statut)} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
