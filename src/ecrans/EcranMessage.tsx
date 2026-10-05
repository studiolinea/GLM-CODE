import type { ReactNode } from 'react';

/** Un écran simple au centre : chargement, erreur de chargement. */
export function EcranMessage({ children }: { children: ReactNode }) {
  return (
    <main className="ecran-centre">
      <div className="marque">PILOTAGE</div>
      {children}
    </main>
  );
}
