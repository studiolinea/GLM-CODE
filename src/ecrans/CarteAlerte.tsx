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
        <button className="bouton principal" onClick={() => onAction(alerte.action)}>
          {alerte.action.libelle}
        </button>
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
