import type { ReactNode } from 'react';
import { Logo } from './Icones';

/** Un écran simple au centre : chargement, erreur de chargement. */
export function EcranMessage({ children }: { children: ReactNode }) {
  return (
    <main className="ecran-centre">
      <div className="marque">
        <Logo />
        PILOTAGE
      </div>
      {children}
    </main>
  );
}
