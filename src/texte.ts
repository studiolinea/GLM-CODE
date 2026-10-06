// Les petites règles d'écriture de l'appli : typographie française et pluriels.

const INSECABLE = '\u00a0';

/** La même phrase partout où les gains réels s'affichent. */
export const PHRASE_GAINS = 'Gains réels = ventes moins commissions et frais, avant impôts et cotisations.';

/**
 * Typographie française pour les textes qui changent (voyants, messages d'erreur ou de succès, messages du
 * serveur) : une espace insécable après « et avant », ainsi qu'avant : ; ! ?. Ainsi, « : » ou « » » ne se
 * retrouvent jamais seuls en début de ligne. Ne fait qu'échanger les espaces déjà là : n'en ajoute aucune.
 */
export function fr(texte: string): string {
  return texte
    .replace(/«[ \u00a0\u202f]+/g, `«${INSECABLE}`)
    .replace(/[ \u00a0\u202f]+»/g, `${INSECABLE}»`)
    .replace(/[ \u00a0\u202f]+([:;!?])/g, `${INSECABLE}$1`);
}

/** Vrai si les deux noms sont les mêmes, sans compter les majuscules ni les espaces (« Guide  detailing » = « guide DETAILING »). */
export function memeNom(a: string, b: string): boolean {
  const simple = (nom: string) => nom.normalize('NFC').replace(/\s+/g, '').toLocaleLowerCase('fr-FR');
  return simple(a) === simple(b);
}

/** « mode test · ventes à jour » → « Mode test · ventes à jour » : une majuscule au début, rien d'autre ne change. */
export function majuscule(texte: string): string {
  return texte.charAt(0).toLocaleUpperCase('fr-FR') + texte.slice(1);
}

/** Le mot au singulier pour 0 et 1, au pluriel à partir de 2 (règle française). */
export function accord(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return Math.abs(n) >= 2 ? pluriel : singulier;
}

/** « 1 vente », « 3 ventes », « 0 vente » : le nombre et le mot accordé, sans coupure de ligne entre les deux. */
export function nombre(n: number, singulier: string, pluriel = `${singulier}s`): string {
  return `${n}${INSECABLE}${accord(n, singulier, pluriel)}`;
}
