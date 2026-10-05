import { formatEuros } from '../argent';

/** Les ventes affichées comme un compteur kilométrique : les centimes en cases inversées. */
export function Odometre({ centimes }: { centimes: number }) {
  const euros = String(Math.floor(centimes / 100)).padStart(5, '0');
  const cents = String(centimes % 100).padStart(2, '0');
  // Les zéros de tête sont estompés, sauf le dernier chiffre des euros.
  const premierUtile = euros.search(/[1-9]/);
  const finZeros = premierUtile === -1 ? euros.length - 1 : premierUtile;

  return (
    <div className="odo" role="img" aria-label={formatEuros(centimes)}>
      {[...euros].map((c, i) => (
        <span key={`e${i}`} className={i < finZeros ? 'zero' : undefined}>
          {c}
        </span>
      ))}
      <span className="virgule">,</span>
      {[...cents].map((c, i) => (
        <span key={`c${i}`} className="cent">
          {c}
        </span>
      ))}
      <span className="euro">€</span>
    </div>
  );
}
