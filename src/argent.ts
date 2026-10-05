// Les montants sont gardés en centimes (nombres entiers) pour éviter les erreurs d'arrondi.

/**
 * Lit un montant tel qu'on le trouve dans un fichier : "19,90", "19.90", "1 234,50 €",
 * "€1,234.50", "-0,75". Renvoie des centimes, ou null si le texte n'est pas un montant.
 */
export function lireMontant(texte: string): number | null {
  let t = texte.trim().replace(/[\s  ]/g, '').replace(/€|\$|EUR|USD/gi, '');
  let signe = 1;
  if (t.startsWith('-')) {
    signe = -1;
    t = t.slice(1);
  }
  if (!/^[\d.,]+$/.test(t) || !/\d/.test(t)) return null;

  // Le dernier séparateur est celui des décimales s'il est suivi de 1 ou 2 chiffres.
  const dernier = Math.max(t.lastIndexOf(','), t.lastIndexOf('.'));
  let entier = t;
  let decimales = '';
  if (dernier !== -1 && t.length - dernier - 1 <= 2) {
    entier = t.slice(0, dernier);
    decimales = t.slice(dernier + 1);
  }
  entier = entier.replace(/[.,]/g, '');
  if (entier === '' && decimales === '') return null;
  const centimes = Number(entier || '0') * 100 + Number(decimales.padEnd(2, '0') || '0');
  return Number.isFinite(centimes) ? signe * centimes : null;
}

const FORMAT_EUROS = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

/** 1990 → "19,90 €". */
export function formatEuros(centimes: number): string {
  return FORMAT_EUROS.format(centimes / 100);
}
