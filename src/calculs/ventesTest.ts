// Les ventes du mode test (Stripe, Lemon Squeezy) : jamais dans les vrais chiffres, mais on dit ce qui a été reçu,
// pour que Kévin puisse vérifier un paiement test (montant, frais, TVA).

import { formatEuros } from '../argent';
import { accord, nombre } from '../texte';
import type { Vente } from '../ventes/modele';

const somme = (ventes: Vente[], champ: (v: Vente) => number) => ventes.reduce((total, v) => total + champ(v), 0);

/**
 * « 2 ventes en mode test reçues (dont 1 remboursée), pas comptées dans tes vrais chiffres : 39,80 €, frais 2,50 €,
 * TVA 6,64 €. » Les remboursements sont dits juste après le nombre de ventes, pour ne pas sembler porter sur la TVA.
 * Les frais sont « inconnus » dès qu'une vente ne les donne pas ; la TVA n'est écrite que si la boutique la donne.
 * Renvoie null s'il n'y a aucune vente de test.
 */
export function resumeVentesTest(ventes: Vente[]): string | null {
  const n = ventes.length;
  if (n === 0) return null;
  const morceaux = [formatEuros(somme(ventes, (v) => v.montantCentimes))];
  morceaux.push(
    ventes.every((v) => v.fraisCentimes !== null) ? `frais ${formatEuros(somme(ventes, (v) => v.fraisCentimes ?? 0))}` : 'frais inconnus',
  );
  const avecTva = ventes.filter((v) => v.tvaCentimes !== undefined);
  if (avecTva.length > 0) morceaux.push(`TVA ${formatEuros(somme(avecTva, (v) => v.tvaCentimes ?? 0))}`);
  const dont = remboursements(n, ventes.filter((v) => v.rembourse).length);
  return `${nombre(n, 'vente')} en mode test ${accord(n, 'reçue')}${dont}, pas ${accord(n, 'comptée')} dans tes vrais chiffres : ${morceaux.join(', ')}.`;
}

/** « (remboursée) » pour une seule vente, « (toutes remboursées) », « (dont 1 remboursée) », ou rien. */
function remboursements(n: number, remboursees: number): string {
  if (remboursees === 0) return '';
  if (remboursees === n) return n === 1 ? ' (remboursée)' : ' (toutes remboursées)';
  return ` (dont ${nombre(remboursees, 'remboursée')})`;
}
