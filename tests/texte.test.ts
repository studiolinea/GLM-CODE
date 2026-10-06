import { describe, expect, it } from 'vitest';
import { accord, fr, nombre } from '../src/texte';

const NB = '\u00a0';

describe('fr() : la typographie française des textes qui changent', () => {
  it('met une espace insécable avant : ; ! ? et à l’intérieur des guillemets', () => {
    expect(fr('D’après : 3 ventes. Prêt ? Oui ! Bon ; « Fait »')).toBe(
      `D’après${NB}: 3 ventes. Prêt${NB}? Oui${NB}! Bon${NB}; «${NB}Fait${NB}»`,
    );
  });

  it('n’ajoute aucune espace là où il n’y en a pas (adresses, heures, anglais)', () => {
    expect(fr('https://www.tiktok.com/@kevin?x=1')).toBe('https://www.tiktok.com/@kevin?x=1');
    expect(fr('Error: boom')).toBe('Error: boom');
    expect(fr('à 18h00')).toBe('à 18h00');
  });

  it('remplace aussi l’espace fine et ne double rien si le texte est déjà bon', () => {
    expect(fr('Total\u202f: 3')).toBe(`Total${NB}: 3`);
    const bon = fr('Reliée : « Stripe ».');
    expect(fr(bon)).toBe(bon);
  });
});

describe('accord() et nombre() : les vrais pluriels', () => {
  it('singulier pour 0 et 1, pluriel à partir de 2', () => {
    expect(accord(0, 'vente')).toBe('vente');
    expect(accord(1, 'vente')).toBe('vente');
    expect(accord(2, 'vente')).toBe('ventes');
    expect(accord(3, 'ligne refusée', 'lignes refusées')).toBe('lignes refusées');
  });

  it('le nombre et le mot restent collés', () => {
    expect(nombre(1, 'vente ajoutée', 'ventes ajoutées')).toBe(`1${NB}vente ajoutée`);
    expect(nombre(12, 'mise à jour', 'mises à jour')).toBe(`12${NB}mises à jour`);
  });
});
