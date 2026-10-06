// Les ventes du mode test (Stripe, Lemon Squeezy) : jamais dans les vrais chiffres, mais on dit ce qui a été reçu,
// pour que Kévin puisse vérifier un paiement test (montant, frais, TVA).

import { formatEuros } from '../argent';
import { accord, nombre } from '../texte';
import type { Vente } from '../ventes/modele';

const somme = (ventes: Vente[], champ: (v: Vente) => number) => ventes.reduce((total, v) => total + champ(v), 0);

/**
 * « 1 vente en mode test reçue, pas comptée dans tes vrais chiffres : 19,90 €, frais 1,25 €, TVA 3,32 €. »
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
  const remboursees = ventes.filter((v) => v.rembourse).length;
  const dont = remboursees > 0 ? ` (dont ${nombre(remboursees, 'remboursée')})` : '';
  return `${nombre(n, 'vente')} en mode test ${accord(n, 'reçue')}, pas ${accord(n, 'comptée')} dans tes vrais chiffres : ${morceaux.join(', ')}${dont}.`;
}
