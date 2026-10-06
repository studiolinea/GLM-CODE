import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconeCroix } from './Icones';

/**
 * Vrai avec une souris ou un pavé tactile (Mac). Sur téléphone, on ne place pas le curseur dans un champ :
 * le clavier monterait tout seul.
 */
export function avecSouris(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
}

const FOCUSABLES = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Ce qu'on peut atteindre avec Tab dans la fenêtre, dans l'ordre (les éléments cachés ne comptent pas). */
function atteignables(fenetre: HTMLElement): HTMLElement[] {
  return [...fenetre.querySelectorAll<HTMLElement>(FOCUSABLES)].filter((el) => el.getClientRects().length > 0);
}

/** Fenêtre qui monte du bas sur téléphone, centrée sur ordinateur. Croix, Échap ou clic à côté pour fermer. */
export function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const idTitre = useId();
  const ref = useRef<HTMLDivElement>(null);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  // Une seule fois à l'ouverture : sinon le curseur sauterait à chaque frappe.
  useEffect(() => {
    // Le bouton qui a ouvert la fenêtre : il retrouve le curseur à la fermeture.
    const ouvreur = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return fermer.current();
      // Tab et Maj+Tab restent dans la fenêtre.
      const fenetre = ref.current;
      if (e.key !== 'Tab' || !fenetre) return;
      const liste = atteignables(fenetre);
      const premier = liste[0];
      const dernier = liste[liste.length - 1];
      if (!premier || !dernier) return e.preventDefault();
      const actif = document.activeElement;
      if (e.shiftKey && (actif === premier || actif === fenetre || !fenetre.contains(actif))) {
        e.preventDefault();
        dernier.focus();
      } else if (!e.shiftKey && (actif === dernier || !fenetre.contains(actif))) {
        e.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener('keydown', surTouche);
    // Avec une souris, on se place sur le premier champ. Sur téléphone, non : le clavier monterait tout seul.
    const premier = avecSouris()
      ? ref.current?.querySelector<HTMLElement>('input:not([disabled]), button:not(.fermer-feuille):not([disabled])')
      : null;
    (premier ?? ref.current)?.focus();
    return () => {
      document.removeEventListener('keydown', surTouche);
      if (ouvreur?.isConnected) ouvreur.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div className="voile" onMouseDown={(e) => e.target === e.currentTarget && onFermer()}>
      <div className="feuille" role="dialog" aria-modal="true" aria-labelledby={idTitre} ref={ref} tabIndex={-1}>
        <div className="feuille-tete">
          <h2 id={idTitre}>{titre}</h2>
          <button type="button" className="fermer-feuille" aria-label="Fermer la fenêtre" onClick={onFermer}>
            <IconeCroix />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Fait télécharger un fichier texte à l'utilisateur. */
export function telecharger(nom: string, contenu: string, type: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nom;
  lien.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
