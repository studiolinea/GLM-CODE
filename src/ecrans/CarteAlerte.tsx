import type { Action, Alerte } from '../alertes/alertes';

const ICONES = { attention: '⚠', 'bonne-nouvelle': '✓', info: 'ℹ' } as const;

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
      <h3>
        <span className="icone" aria-hidden="true">
          {ICONES[alerte.ton]}
        </span>
        {alerte.titre}
      </h3>
      <p className="dapres">{alerte.dapres}</p>
      {alerte.note && <p className="note">{alerte.note}</p>}
      <div className="alerte-actions">
        {action.cible === 'lien' ? (
          <a className="bouton principal" href={action.url} target="_blank" rel="noopener noreferrer">
            {action.libelle}
          </a>
        ) : (
          <button className="bouton principal" onClick={() => onAction(action)}>
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
    </li>
  );
}
