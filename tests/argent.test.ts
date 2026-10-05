import { describe, expect, it } from 'vitest';
import { formatEuros, lireMontant } from '../src/argent';

describe('lireMontant', () => {
  it('lit les écritures françaises et anglaises', () => {
    expect(lireMontant('19,90')).toBe(1990);
    expect(lireMontant('19.90')).toBe(1990);
    expect(lireMontant('19,9')).toBe(1990);
    expect(lireMontant('19')).toBe(1900);
    expect(lireMontant('1 234,50 €')).toBe(123450);
    expect(lireMontant('1 234,50 €')).toBe(123450);
    expect(lireMontant('€1,234.50')).toBe(123450);
    expect(lireMontant('1.234,50')).toBe(123450);
    expect(lireMontant('1,234')).toBe(123400);
    expect(lireMontant('-0,75')).toBe(-75);
    expect(lireMontant('0,5')).toBe(50);
  });

  it('refuse ce qui n’est pas un montant', () => {
    expect(lireMontant('')).toBeNull();
    expect(lireMontant('abc')).toBeNull();
    expect(lireMontant('€')).toBeNull();
    expect(lireMontant('12a')).toBeNull();
  });
});

describe('formatEuros', () => {
  it('écrit des euros à la française', () => {
    expect(formatEuros(1990).replace(/\s/g, ' ')).toBe('19,90 €');
  });
});
