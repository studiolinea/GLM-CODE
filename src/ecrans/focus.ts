// Le curseur du clavier après un changement d'écran (par exemple en ouvrant un autre business, l'écran est refait) :
// l'action le demande, l'élément le prend en arrivant. Sur téléphone, rien : pas de clavier qui monte tout seul.

export const ID_SELECTEUR_BUSINESS = 'selecteur-business';

let enAttente: string | null = null;

/** Demande que l'élément portant cet id reçoive le curseur dès qu'il apparaît (null : plus rien à demander). */
export function demanderFocus(id: string | null): void {
  enAttente = id;
}

/** À appeler quand l'élément apparaît : il prend le curseur si c'était demandé (une seule fois). */
export function prendreFocus(element: HTMLElement | null): void {
  if (!element || enAttente !== element.id) return;
  enAttente = null;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches) {
    element.focus({ preventScroll: true });
  }
}
