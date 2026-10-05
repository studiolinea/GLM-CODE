import { describe, expect, it } from 'vitest';
import { rythmeSemaine } from '../src/calculs/rythme';
import { donneesExemple } from '../src/donnees/exemple';
import type { Video } from '../src/modele';

// Lundi 5 octobre 2026, 18 h à Paris.
const maintenant = new Date('2026-10-05T16:00:00Z');
const video = (id: string, instant: string): Video => ({ id, instant, reseau: 'tiktok' });

describe('rythmeSemaine', () => {
  it('données d’exemple : 3 vidéos sur 7', () => {
    expect(rythmeSemaine(donneesExemple(maintenant).videos, 1, maintenant)).toEqual({ publiees: 3, objectif: 7 });
  });

  it('compte du mardi 29/09 au lundi 05/10, en heure de Paris', () => {
    const videos = [
      video('trop-vieille', '2026-09-28T21:00:00Z'), // 28/09 à 23 h à Paris : hors des 7 jours
      video('premier-jour', '2026-09-28T22:30:00Z'), // 29/09 à 0 h 30 à Paris : compte
      video('aujourdhui', '2026-10-05T08:00:00Z'),
    ];
    expect(rythmeSemaine(videos, 1, maintenant).publiees).toBe(2);
  });

  it('l’objectif suit le réglage par jour', () => {
    expect(rythmeSemaine([], 2, maintenant)).toEqual({ publiees: 0, objectif: 14 });
    expect(rythmeSemaine([], 0, maintenant).objectif).toBe(0);
  });
});
