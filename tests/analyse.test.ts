import { describe, expect, it } from 'vitest';
import { analyserPeriode } from '../src/calculs/analyse';
import { calculerResume } from '../src/calculs/resume';

const maintenant = new Date('2026-10-06T12:00:00Z');
const base = { resume: calculerResume([], '7j', maintenant), rythme: { publiees: 2, objectif: 7 }, couverture: null, automatique: true, sources: { boutique: false, videos: false } };

describe('lecture locale', () => {
  it('ne conclut pas à zéro vente sans couverture et guide vers la boutique', () => {
    const lecture = analyserPeriode(base);
    expect(lecture.constats[0]!.preuve).toContain('impossible de conclure à zéro vente');
    expect(lecture.prochaine.action).toEqual({ libelle: 'Relier ma boutique', cible: 'comptes', compte: 'boutique' });
    expect(lecture.periode).toContain('30/09');
  });
  it('attend la liste des sources avant de demander une liaison', () => {
    expect(analyserPeriode({ ...base, sources: null }).prochaine.action).toBeUndefined();
  });
  it('ne fabrique pas de gain si les frais manquent', () => {
    const resume = calculerResume([{ plateforme: 'stripe', numeroCommande: '1', instant: maintenant.toISOString(), montantCentimes: 1990, fraisCentimes: null, rembourse: false, produit: 'Guide' }], '7j', maintenant);
    const lecture = analyserPeriode({ ...base, resume, couverture: maintenant.toISOString(), sources: { boutique: true, videos: true } });
    expect(lecture.constats[1]!.titre).toBe('Les gains restent incomplets');
    expect(lecture.constats[1]!.preuve).toContain('1 vente');
    expect(lecture.prochaine.action?.cible).toBe('comptes');
  });
  it('montre une soustraction exacte et exclut les remboursements des ventes', () => {
    const resume = calculerResume([
      { plateforme: 'exemple', numeroCommande: '1', instant: maintenant.toISOString(), montantCentimes: 1990, fraisCentimes: 150, rembourse: false, produit: 'Guide' },
      { plateforme: 'exemple', numeroCommande: '2', instant: maintenant.toISOString(), montantCentimes: 1990, fraisCentimes: 150, rembourse: true, produit: 'Guide' },
    ], '1m', maintenant);
    const lecture = analyserPeriode({ ...base, resume, couverture: maintenant.toISOString() });
    expect(lecture.constats[0]!.titre).toBe('1 commande enregistrée');
    expect(lecture.constats[1]!.titre).toContain('18,40');
    expect(lecture.constats[1]!.preuve).toContain('19,90');
    expect(lecture.constats[2]!.preuve).toContain('quelle que soit la période');
  });
  it('ne convertit pas en zéro les gains inconnus après remboursement Stripe', () => {
    const resume = calculerResume([
      { plateforme: 'stripe', numeroCommande: '1', instant: maintenant.toISOString(), montantCentimes: 1990, fraisCentimes: 150, rembourse: false, produit: 'Guide' },
      { plateforme: 'stripe', numeroCommande: '2', instant: maintenant.toISOString(), montantCentimes: 1990, fraisCentimes: 150, rembourse: true, produit: 'Guide' },
    ], '7j', maintenant);
    const lecture = analyserPeriode({ ...base, resume, couverture: maintenant.toISOString() });
    expect(resume.gainsCentimes).toBeNull();
    expect(lecture.constats[1]!.titre).toBe('Les gains après remboursement sont inconnus');
    expect(lecture.constats[1]!.titre).not.toContain('0,00');
  });
  it('guide vers un import en mode appareil sans couverture', () => {
    expect(analyserPeriode({ ...base, automatique: false }).prochaine.action?.cible).toBe('import');
  });
});
