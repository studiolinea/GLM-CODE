// Les petites icônes de l'appli : toutes au même trait (1,8), dans la couleur du texte qui les entoure.
// Elles sont décoratives (aria-hidden) : le bouton qui les porte a toujours un nom lisible à voix haute.

import type { ReactNode } from 'react';

function Icone({ taille = 20, children }: { taille?: number; children: ReactNode }) {
  return (
    <svg
      className="icone"
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

const ENGRENAGE =
  'M10.16 5.14L10.5 2.52A9.6 9.6 0 0 1 13.5 2.52L13.84 5.14A7.1 7.1 0 0 1 15.55 5.85L17.64 4.23A9.6 9.6 0 0 1 19.77 6.36L18.15 8.45A7.1 7.1 0 0 1 18.86 10.16L21.48 10.5A9.6 9.6 0 0 1 21.48 13.5L18.86 13.84A7.1 7.1 0 0 1 18.15 15.55L19.77 17.64A9.6 9.6 0 0 1 17.64 19.77L15.55 18.15A7.1 7.1 0 0 1 13.84 18.86L13.5 21.48A9.6 9.6 0 0 1 10.5 21.48L10.16 18.86A7.1 7.1 0 0 1 8.45 18.15L6.36 19.77A9.6 9.6 0 0 1 4.23 17.64L5.85 15.55A7.1 7.1 0 0 1 5.14 13.84L2.52 13.5A9.6 9.6 0 0 1 2.52 10.5L5.14 10.16A7.1 7.1 0 0 1 5.85 8.45L4.23 6.36A9.6 9.6 0 0 1 6.36 4.23L8.45 5.85A7.1 7.1 0 0 1 10.16 5.14Z';

/** Réglages : un engrenage. */
export function IconeReglages({ taille }: { taille?: number }) {
  return (
    <Icone taille={taille}>
      <path d={ENGRENAGE} />
      <circle cx="12" cy="12" r="3" />
    </Icone>
  );
}

/** Fermer : une croix. */
export function IconeCroix({ taille }: { taille?: number }) {
  return (
    <Icone taille={taille}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Icone>
  );
}

/** Ouvrir une liste : une flèche vers le bas. */
export function IconeChevron({ taille }: { taille?: number }) {
  return (
    <Icone taille={taille}>
      <path d="M6 9l6 6 6-6" />
    </Icone>
  );
}

export function IconeMoins({ taille }: { taille?: number }) {
  return (
    <Icone taille={taille}>
      <path d="M5 12h14" />
    </Icone>
  );
}

export function IconePlus({ taille }: { taille?: number }) {
  return (
    <Icone taille={taille}>
      <path d="M12 5v14M5 12h14" />
    </Icone>
  );
}

/** Le petit compte-tours de l'icône de l'appli (public/icone.svg), devant « PILOTAGE ». */
export function Logo() {
  return (
    <svg className="logo" width="22" height="22" viewBox="8 5 48 48" aria-hidden="true" focusable="false">
      <path className="logo-piste" d="M 17.86 46.14 A 20 20 0 1 1 46.14 46.14" fill="none" strokeWidth="5" strokeLinecap="round" />
      <path className="logo-arc" d="M 17.86 46.14 A 20 20 0 0 1 32 12" fill="none" strokeWidth="5" strokeLinecap="round" />
      <line className="logo-aiguille" x1="32" y1="32" x2="24" y2="19" strokeWidth="3.5" strokeLinecap="round" />
      <circle className="logo-moyeu" cx="32" cy="32" r="3.5" />
    </svg>
  );
}
