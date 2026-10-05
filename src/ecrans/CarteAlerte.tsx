import type { Action, Alerte } from '../alertes/alertes';

/** Chaque alerte est un voyant : orange à traiter, vert bonne nouvelle, bleu pour info. */
const VOYANTS = { attention: '!', 'bonne-nouvelle': '✓', info: 'i' } as const;

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
        <h3>{alerte.titre}</h3>
        <p className="dapres">{alerte.dapres}</p>
        {alerte.note && <p className="note">{alerte.note}</p>}
        <div className="alerte-actions">
          {action.cible === 'lien' ? (
            <a className="bouton contour" href={action.url} target="_blank" rel="noopener noreferrer">
              {action.libelle}
            </a>
          ) : (
            <button className="bouton contour" onClick={() => onAction(action)}>
              {action.libelle}
            </button>
          )}
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
