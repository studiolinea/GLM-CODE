import { Component, type ReactNode } from 'react';
import { EcranMessage } from './EcranMessage';

/** Si un écran plante, on le dit en français, avec un bouton pour recharger, au lieu d'une page blanche. */
export class FiletErreur extends Component<{ children: ReactNode }, { plante: boolean }> {
  state = { plante: false };

  static getDerivedStateFromError() {
    return { plante: true };
  }

  componentDidCatch(erreur: unknown) {
    console.error('Pilotage a planté :', erreur);
  }

  render() {
    if (!this.state.plante) return this.props.children;
    return (
      <EcranMessage>
        <p className="erreur" role="alert">
          L’appli a eu un problème. Recharge la page pour continuer.
        </p>
        <div className="pied pied-centre">
          <button className="bouton principal" onClick={() => location.reload()}>
            Recharger
          </button>
        </div>
      </EcranMessage>
    );
  }
}
