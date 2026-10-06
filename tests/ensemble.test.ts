import { describe, expect, it } from 'vitest';
import { calculerEnsemble, type DonneesBusiness } from '../src/calculs/ensemble';
import type { Vente } from '../src/ventes/modele';

// Mardi 6 octobre 2026, 10 h à Paris.
const maintenant = new Date('2026-10-06T08:00:00Z');

const vente = (numero: string, instant: string, autres: Partial<Vente> = {}): Vente => ({
  plateforme: 'stripe',
  numeroCommande: numero,
  instant,
  montantCentimes: 1990,
  fraisCentimes: 56,
  rembourse: false,
  produit: 'Guide',
  ...autres,
});

const business = (id: string, nom: string, autres: Partial<DonneesBusiness> = {}): DonneesBusiness => ({
  id,
  nom,
  ventes: [],
  videos: [],
  ...autres,
});

describe('vue d’ensemble de tous les business', () => {
  it('additionne les ventes, les gains et les vidéos de chaque business', () => {
    const e = calculerEnsemble(
      [
        business('a', 'Guide detailing', {
          ventes: [vente('1', '2026-10-05T10:00:00Z'), vente('2', '2026-10-06T07:00:00Z', { tvaCentimes: 109 })],
          videos: [{ id: 'v1', instant: '2026-10-05T18:00:00Z', reseau: 'tiktok' }],
        }),
        business('b', 'Deuxième', {
          ventes: [vente('3', '2026-10-04T10:00:00Z', { montantCentimes: 2990, fraisCentimes: 100 })],
          videos: [
            { id: 'v2', instant: '2026-10-03T18:00:00Z', reseau: 'tiktok' },
            { id: 'v3', instant: '2026-09-01T18:00:00Z', reseau: 'tiktok' }, // hors des 7 jours
          ],
        }),
      ],
      '7j',
      maintenant,
    );
    expect(e.lignes.map((l) => [l.nom, l.resume.ventesCentimes, l.resume.gainsCentimes, l.videos])).toEqual([
      ['Guide detailing', 3980, 3868, 1],
      ['Deuxième', 2990, 2890, 1],
    ]);
    expect(e.total).toEqual({
      ventesCentimes: 6970,
      commandes: 3,
      fraisCentimes: 212,
      gainsCentimes: 6758,
      businessSansGains: [],
      tvaCentimes: 109,
      remboursementsCentimes: 0,
      videos: 2,
    });
  });

  it('frais inconnus dans un business : pas de total des gains deviné, et on dit lequel', () => {
    const e = calculerEnsemble(
      [
        business('a', 'Avec frais', { ventes: [vente('1', '2026-10-05T10:00:00Z')] }),
        business('b', 'Sans frais', { ventes: [vente('2', '2026-10-05T10:00:00Z', { fraisCentimes: null })] }),
      ],
      '7j',
      maintenant,
    );
    expect(e.total.gainsCentimes).toBeNull();
    expect(e.total.businessSansGains).toEqual(['Sans frais']);
    expect(e.total.ventesCentimes).toBe(3980);
  });

  it('un business vide est signalé, et compte pour 0 vente', () => {
    const e = calculerEnsemble([business('a', 'Tout neuf')], '1m', maintenant);
    expect(e.lignes[0]).toMatchObject({ vide: true, videos: 0 });
    expect(e.total).toMatchObject({ ventesCentimes: 0, commandes: 0, gainsCentimes: 0, tvaCentimes: null });
  });
});
