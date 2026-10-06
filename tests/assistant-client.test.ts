import { beforeEach, describe, expect, it, vi } from 'vitest';
const { appeler } = vi.hoisted(() => ({ appeler: vi.fn() }));
vi.mock('../src/donnees/comptesRelies', () => ({ appelerServeur: appeler }));
import { analyserAvecIA, empreinteAnalyse } from '../src/donnees/assistant';

describe('demande IA depuis le navigateur', () => {
  beforeEach(() => { appeler.mockReset(); });
  it('envoie uniquement le business, la période et une question prédéfinie', async () => {
    const reponse = { texte: 'Vérifie les frais.', genereLe: '2026-10-06T12:00:00Z', modele: 'modele-configure' };
    appeler.mockResolvedValue(reponse);
    expect(await analyserAvecIA('business-1', '7j', 'frais')).toEqual(reponse);
    expect(appeler).toHaveBeenCalledWith('/api/assistant/analyser', { business: 'business-1', periode: '7j', question: 'frais' });
  });
  it('refuse une réponse sans texte ou date exploitable', async () => {
    appeler.mockResolvedValue({ texte: '', genereLe: 'date-invalide', modele: 'modele' });
    await expect(analyserAvecIA('business-1', '1m', 'ventes')).rejects.toThrow('réponse illisible');
  });
  it('refuse une action arbitraire hors des écrans de préparation', async () => {
    appeler.mockResolvedValue({ texte: 'Plan', genereLe: '2026-10-06T12:00:00Z', modele: 'modele', actions: [{ id: 'payer', raison: 'Faire un paiement' }] });
    await expect(analyserAvecIA('business-1', '7j', 'priorites')).rejects.toThrow('plan proposé');
  });
  it('conserve le message de configuration absent fourni par le serveur', async () => {
    appeler.mockRejectedValue(new Error('L’IA n’est pas configurée côté serveur.'));
    await expect(analyserAvecIA('business-1', '3m', 'videos')).rejects.toThrow('L’IA n’est pas configurée côté serveur.');
  });
});


describe('empreinte données pour analyse automatique', () => {
  const vente = { plateforme: 'stripe', numeroCommande: '1', instant: '2026-10-06T12:00:00Z', montantCentimes: 1990, fraisCentimes: null, rembourse: false, produit: 'Guide' };
  const video = { id: 'v1', instant: '2026-10-06T12:00:00Z', reseau: 'tiktok' as const, vues: 10 };
  it('change quand les frais, remboursement ou vues changent sans ajout de ligne', () => {
    const avant = empreinteAnalyse([vente], [video], null, 1);
    expect(empreinteAnalyse([{ ...vente, fraisCentimes: 150 }], [video], null, 1)).not.toBe(avant);
    expect(empreinteAnalyse([{ ...vente, rembourse: true }], [video], null, 1)).not.toBe(avant);
    expect(empreinteAnalyse([vente], [{ ...video, vues: 20 }], null, 1)).not.toBe(avant);
  });
  it('reste stable si les mêmes données arrivent dans un ordre différent', () => {
    const autre = { ...vente, numeroCommande: '2' };
    expect(empreinteAnalyse([vente, autre], [video], null, 1)).toBe(empreinteAnalyse([autre, vente], [video], null, 1));
  });
});

it('un essai synthétique ne peut jamais proposer de modifier la vraie checklist', async () => {
  const { actionsApplicables } = await import('../src/donnees/assistant');
  const reponse = { texte: 'Essai', genereLe: '2026-10-06T12:00:00Z', modele: 'modele', actions: [{ id: 'paiement' as const, raison: 'Synthétique' }] };
  expect(actionsApplicables('essai-synthetique', reponse)).toEqual([]);
  expect(actionsApplicables('frais', reponse)).toEqual(reponse.actions);
});
