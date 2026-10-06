import { describe, expect, it } from 'vitest';
import { changerPreparation, preparationFaite } from '../src/donnees/preparation';
import { donneesExemple } from '../src/donnees/exemple';

describe('préparation du business', () => {
  it('retient une validation explicite sans modifier les ventes ou les autres états', () => {
    const donnees = donneesExemple(new Date('2026-10-06T12:00:00Z'));
    const avant = { ...donnees, etatsAlertes: { 'voyant-1': { statut: 'fait' as const, le: '2026-10-05' } } };
    const apres = changerPreparation(avant, 'paiement', true, '2026-10-06');
    expect(preparationFaite(apres.etatsAlertes, 'paiement')).toBe(true);
    expect(apres.etatsAlertes['preparation:paiement']).toEqual({ statut: 'fait', le: '2026-10-06' });
    expect(apres.etatsAlertes['voyant-1']).toEqual(avant.etatsAlertes['voyant-1']);
    expect(apres.ventes).toBe(avant.ventes);
    expect(avant.etatsAlertes).not.toHaveProperty('preparation:paiement');
  });
  it('permet de remettre à revoir sans toucher les autres étapes', () => {
    const initial = donneesExemple(new Date('2026-10-06T12:00:00Z'));
    const boutique = changerPreparation(initial, 'boutique', true, '2026-10-06');
    const paiement = changerPreparation(boutique, 'paiement', true, '2026-10-06');
    const revoir = changerPreparation(paiement, 'paiement', false, '2026-10-06');
    expect(preparationFaite(revoir.etatsAlertes, 'paiement')).toBe(false);
    expect(preparationFaite(revoir.etatsAlertes, 'boutique')).toBe(true);
  });
});
