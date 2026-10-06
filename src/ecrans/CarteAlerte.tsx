import type { Action, Alerte, Ton } from '../alertes/alertes';
import { fr } from '../texte';

/** Chaque alerte est un voyant : orange à traiter, vert bonne nouvelle, bleu pour info. */
const VOYANTS: Record<Ton, string> = { attention: '!', 'bonne-nouvelle': '✓', info: 'i' };

/** Ce que dit la couleur du voyant, pour qui écoute l'écran au lieu de le voir. */
const TONS_LUS: Record<Ton, string> = { attention: 'À traiter : ', 'bonne-nouvelle': 'Bonne nouvelle : ', info: 'Info : ' };

export function CarteAlerte({
  alerte,
  onAction,
  onRanger,
}: {
  alerte: Alerte;
  onAction: (action: Action) => void;
  onRanger: (statut: 'fait' | 'plus-tard') => void;
}) {
  const action = alerte.action;
  return (
    <li className={`alerte ${alerte.ton}`}>
      <span className="voyant" aria-hidden="true">
        {VOYANTS[alerte.ton]}
      </span>
      <div className="alerte-corps">
        <h3>
          <span className="cache">{TONS_LUS[alerte.ton]}</span>
          {fr(alerte.titre)}
        </h3>
        <p className="dapres">{fr(alerte.dapres)}</p>
        {alerte.note && <p className="note">{fr(alerte.note)}</p>}
        <div className={`alerte-actions${action ? ' avec-action' : ''}`}>
          {action &&
            (action.cible === 'lien' ? (
              <a className="bouton contour" href={action.url} target="_blank" rel="noopener noreferrer">
                {action.libelle}
              </a>
            ) : (
              <button className="bouton contour" onClick={() => onAction(action)}>
                {action.libelle}
              </button>
            ))}
          <button className="bouton" onClick={() => onRanger('fait')}>
            Fait
          </button>
          <button className="bouton discret" onClick={() => onRanger('plus-tard')}>
            Plus tard
          </button>
        </div>
      </div>
    </li>
  );
}
