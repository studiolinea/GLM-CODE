import { useEffect, useId, useRef, type ReactNode } from 'react';
import { IconeCroix } from './Icones';

/** Fenêtre qui monte du bas sur téléphone, centrée sur ordinateur. Croix, Échap ou clic à côté pour fermer. */
export function Feuille({ titre, onFermer, children }: { titre: string; onFermer: () => void; children: ReactNode }) {
  const idTitre = useId();
  const ref = useRef<HTMLDivElement>(null);
  const fermer = useRef(onFermer);
  fermer.current = onFermer;

  // Une seule fois à l'ouverture : sinon le curseur sauterait à chaque frappe.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fermer.current();
    };
    document.addEventListener('keydown', surTouche);
    // Avec une souris, on se place sur le premier champ. Sur téléphone, non : le clavier monterait tout seul.
    const souris = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: fine)').matches;
    const premier = souris ? ref.current?.querySelector<HTMLElement>('input:not([disabled]), button:not(.fermer-feuille):not([disabled])') : null;
    (premier ?? ref.current)?.focus();
    return () => document.removeEventListener('keydown', surTouche);
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
