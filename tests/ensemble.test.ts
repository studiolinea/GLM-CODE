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

describe('vue d’ensemble : l’état réel de chaque business', () => {
  const rien = { boutique: false, reseau: false, derniereSynchro: null };
  const etat = (b: DonneesBusiness) => calculerEnsemble([b], '7j', maintenant).lignes[0]!;

  it('boutique reliée mais aucune vente : on le dit, avec l’heure de la dernière actualisation (Paris)', () => {
    const l = etat(
      business('a', 'Kit', {
        couverture: '2026-10-06T07:30:00Z',
        exempleTermine: true,
        relies: { boutique: true, reseau: false, derniereSynchro: '2026-10-06T07:30:00Z' },
      }),
    );
    expect(l.etatVide).toBe('Boutique reliée, aucune vente pour l’instant.');
    expect(l.aJour).toBe('à jour le 06/10 à 09h30');
  });

  it('rien de relié : on invite à relier, sans « à jour »', () => {
    const l = etat(business('a', 'Tout neuf', { couverture: null, exempleTermine: true, relies: rien }));
    expect(l.etatVide).toBe('Rien de relié pour l’instant : relie sa boutique et ses comptes.');
    expect(l.aJour).toBeNull();
  });

  it('jamais commencé (son écran montre l’exemple) : « Données d’exemple seulement. »', () => {
    const l = etat(business('a', 'Mon premier business', { couverture: null, exempleTermine: false, relies: rien }));
    expect(l.etatVide).toBe('Données d’exemple seulement.');
  });

  it('seulement TikTok relié, sans vidéo : sa boutique n’est pas reliée', () => {
    const l = etat(
      business('a', 'Kit', { couverture: null, exempleTermine: true, relies: { boutique: false, reseau: true, derniereSynchro: null } }),
    );
    expect(l.etatVide).toBe('Aucune vidéo pour l’instant, et sa boutique n’est pas reliée.');
    expect(l.aJour).toBe('pas encore actualisé');
  });

  it('un business avec des ventes n’a pas de phrase « vide », mais garde son « à jour »', () => {
    const l = etat(
      business('a', 'Guide', {
        ventes: [vente('1', '2026-10-05T10:00:00Z')],
        couverture: '2026-10-05T12:00:00Z',
        relies: { boutique: true, reseau: true, derniereSynchro: '2026-10-05T12:00:00Z' },
      }),
    );
    expect(l.etatVide).toBeNull();
    expect(l.aJour).toBe('à jour le 05/10 à 14h00');
  });

  it('sans savoir ce qui est relié, on ne dit rien de faux', () => {
    expect(etat(business('a', 'Inconnu')).etatVide).toBe('Pas encore de données : relie sa boutique et ses comptes.');
  });
});
