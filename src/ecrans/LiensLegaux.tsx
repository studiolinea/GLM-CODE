/** Le pied de page : conditions d'utilisation et confidentialité (pages fixes, ouvertes à côté de l'appli). */
export function LiensLegaux() {
  return (
    <p className="liens-legaux">
      <a href="./conditions.html" target="_blank" rel="noopener">
        Conditions
      </a>
      <span aria-hidden="true">·</span>
      <a href="./confidentialite.html" target="_blank" rel="noopener">
        Confidentialité
      </a>
    </p>
  );
}
