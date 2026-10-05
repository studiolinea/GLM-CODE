import { describe, expect, it } from 'vitest';
import { ajouterJours, dateParis, heureParis, instantParis, joursEntre, lireDateHeure, quandParis } from '../src/temps';

describe('heure de Paris', () => {
  it('convertit une heure de Paris en instant, été comme hiver', () => {
    expect(instantParis('2026-07-15', '12:00').toISOString()).toBe('2026-07-15T10:00:00.000Z');
    expect(instantParis('2026-01-15', '12:00').toISOString()).toBe('2026-01-15T11:00:00.000Z');
  });

  it('gère le jour du passage à l’heure d’hiver', () => {
    // 25 octobre 2026 : à 3 h, on revient à 2 h. 12 h est déjà en heure d'hiver.
    expect(instantParis('2026-10-25', '12:00').toISOString()).toBe('2026-10-25T11:00:00.000Z');
  });

  it('donne la date de Paris, même quand celle d’UTC est différente', () => {
    expect(dateParis(new Date('2026-09-28T22:30:00Z'))).toBe('2026-09-29');
    expect(heureParis(new Date('2026-09-28T22:30:00Z'))).toBe('00:30');
  });

  it('compte les jours de calendrier', () => {
    expect(ajouterJours('2026-10-05', -89)).toBe('2026-07-08');
    expect(ajouterJours('2026-02-28', 1)).toBe('2026-03-01');
    expect(joursEntre('2026-10-02', '2026-10-05')).toBe(3);
  });

  it('écrit un instant pour un humain', () => {
    expect(quandParis(new Date('2026-10-05T16:00:00Z'))).toBe('05/10 à 18h00');
  });
});

describe('lireDateHeure', () => {
  it('lit les formats courants', () => {
    expect(lireDateHeure('2026-10-05 10:15')?.toISOString()).toBe('2026-10-05T08:15:00.000Z');
    expect(lireDateHeure('2026-10-05T10:15')?.toISOString()).toBe('2026-10-05T08:15:00.000Z');
    expect(lireDateHeure('05/10/2026 10:15')?.toISOString()).toBe('2026-10-05T08:15:00.000Z');
    expect(lireDateHeure('2026-10-05T10:15:00Z')?.toISOString()).toBe('2026-10-05T10:15:00.000Z');
    expect(lireDateHeure('2026-10-05T10:15:00+02:00')?.toISOString()).toBe('2026-10-05T08:15:00.000Z');
  });

  it('met une date sans heure à midi', () => {
    expect(lireDateHeure('2026-10-05')?.toISOString()).toBe('2026-10-05T10:00:00.000Z');
  });

  it('refuse ce qui n’est pas une date', () => {
    expect(lireDateHeure('hier')).toBeNull();
    expect(lireDateHeure('2026-02-30 10:00')).toBeNull();
    expect(lireDateHeure('')).toBeNull();
  });
});
