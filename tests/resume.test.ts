import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { bornesPeriode, calculerResume } from '../src/calculs/resume';
import { lireFichierVentes } from '../src/ventes/lire';

const lecture = lireFichierVentes(readFileSync(new URL('./fichiers/ventes-exemple.csv', import.meta.url), 'utf8'));
if (!lecture.ok) throw new Error(lecture.erreur);
const ventes = lecture.ventes;

// Lundi 5 octobre 2026, 18 h à Paris.
const maintenant = new Date('2026-10-05T16:00:00Z');

describe('bornesPeriode', () => {
  it('compte aujourd’hui dans la période', () => {
    expect(bornesPeriode('7j', '2026-10-05')).toEqual({ debut: '2026-09-29', fin: '2026-10-05' });
    expect(bornesPeriode('1m', '2026-10-05')).toEqual({ debut: '2026-09-06', fin: '2026-10-05' });
    expect(bornesPeriode('3m', '2026-10-05')).toEqual({ debut: '2026-07-08', fin: '2026-10-05' });
  });
});

// Résultats calculés à la main à partir de tests/fichiers/ventes-exemple.csv.
describe('calculerResume', () => {
  it('7 jours : 1001, 1002 (00 h 30 à Paris) et 1003 ; 1004 remboursée à part', () => {
    expect(calculerResume(ventes, '7j', maintenant)).toEqual({
      periode: '7j',
      debut: '2026-09-29',
      fin: '2026-10-05',
      ventesCentimes: 6970, // 19,90 + 19,90 + 29,90
      commandes: 3,
      panierMoyenCentimes: 2323, // 69,70 / 3 = 23,233…
      remboursementsCentimes: 1990,
      nbRemboursements: 1,
      fraisCentimes: 500, // 1,50 + 1,50 + 2,00
      ventesSansFrais: 0,
      gainsCentimes: 6470, // 69,70 − 5,00
      tvaCentimes: null, // le fichier ne donne pas de TVA retenue
    });
  });

  it('1 mois : la vente 1006 n’a pas de frais, donc pas de gains devinés', () => {
    expect(calculerResume(ventes, '1m', maintenant)).toMatchObject({
      ventesCentimes: 10950, // 69,70 + 19,90 (1005) + 19,90 (1006)
      commandes: 5,
      panierMoyenCentimes: 2190,
      nbRemboursements: 1,
      fraisCentimes: 650,
      ventesSansFrais: 1,
      gainsCentimes: null,
    });
  });

  it('3 mois : ajoute 1007, pas 1008 (trop ancienne)', () => {
    expect(calculerResume(ventes, '3m', maintenant)).toMatchObject({
      ventesCentimes: 12940,
      commandes: 6,
      panierMoyenCentimes: 2157, // 129,40 / 6 = 21,566…
      gainsCentimes: null,
    });
  });

  it('TVA retenue par la boutique : additionnée sur les ventes gardées seulement', () => {
    const v = (numero: string, tva: number | undefined, rembourse = false) => ({
      plateforme: 'stripe',
      numeroCommande: numero,
      instant: '2026-10-05T08:00:00.000Z',
      montantCentimes: 1990,
      fraisCentimes: null,
      ...(tva !== undefined ? { tvaCentimes: tva } : {}),
      rembourse,
      produit: 'Guide detailing',
    });
    const r = calculerResume([v('a', 109), v('b', 109), v('c', 109, true), v('d', undefined)], '7j', maintenant);
    expect(r.tvaCentimes).toBe(218);
    expect(r.ventesCentimes).toBe(5970);
  });

  it('aucune vente : panier moyen et gains vides, jamais 0 € inventé pour le panier', () => {
    expect(calculerResume([], '7j', maintenant)).toMatchObject({
      ventesCentimes: 0,
      commandes: 0,
      panierMoyenCentimes: null,
      gainsCentimes: 0,
    });
  });
});
