import { expect, it } from 'vitest';
import { instantParis, lireDateHeure } from '../src/temps';

it('refuse les heures impossibles au lieu de déplacer une vente au lendemain', () => {
  for (const date of ['2026-10-05 25:99', '05/10/2026 12:60', '2026-02-30T10:00:00Z']) {
    expect(lireDateHeure(date)).toBeNull();
  }
  expect(() => instantParis('2026-10-05', '24:00')).toThrow();
});
