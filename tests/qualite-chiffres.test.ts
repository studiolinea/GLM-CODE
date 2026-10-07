import { describe, expect, it } from 'vitest';
import { calculerResume } from '../src/calculs/resume';
import { qualifierChiffres, qualifierChiffresVentes } from '../src/serveur/qualiteChiffres';
import { contexteEssaisSynthetiques } from '../src/serveur/essais';
import { empreinteContexteAssistant, VERSION_CONSIGNES_ASSISTANT } from '../src/serveur/assistant';
const maintenant = new Date('2026-10-07T12:00:00Z');
const vente = { plateforme: 'stripe', numeroCommande: '', produit: '', instant: maintenant.toISOString(), montantCentimes: 2000, fraisCentimes: 0, rembourse: false };

describe('qualité factuelle des chiffres IA', () => {
  it('zéro frais connu permet de calculer les gains, frais absents non', () => {
    const connu = qualifierChiffres(calculerResume([vente], '7j', maintenant), maintenant.toISOString(), false);
    const absent = qualifierChiffres(calculerResume([{ ...vente, fraisCentimes: null }], '7j', maintenant), maintenant.toISOString(), false);
    expect(connu).toMatchObject({ frais: 'connus', fraisConnusCentimes: 0, gains: 'calcules', raisonGainsNonCalculables: null });
    expect(absent).toMatchObject({ frais: 'incomplets', fraisConnusCentimes: 0, gains: 'non_calculables', raisonGainsNonCalculables: 'frais_absents' });
  });
  it('ignore un remboursement Stripe de la marge hors période pour expliquer les frais absents actuels', () => {
    const ventes = [{ ...vente, fraisCentimes: null }, { ...vente, rembourse: true, fraisCentimes: 300, instant: '2026-09-30T12:00:00Z' }];
    const resume = calculerResume(ventes, '7j', maintenant);
    expect(resume.debut).toBe('2026-10-01');
    expect(qualifierChiffresVentes(resume, maintenant.toISOString(), ventes).raisonGainsNonCalculables).toBe('frais_absents');
  });
  it('sépare frais origine 300 du net inconnu après remboursement synthétique', () => {
    const cas = contexteEssaisSynthetiques('7j', maintenant).essaisSynthetiques[2]!;
    expect(cas).toMatchObject({ fraisOrigineCentimes: 300, fraisRetenusApresRemboursementCentimes: null, qualiteChiffres: { raisonGainsNonCalculables: 'mouvements_remboursement_stripe_inconnus' } });
    expect(cas.resume.gainsCentimes).toBeNull();
  });
  it('l’empreinte inclut explicitement la version des consignes', async () => {
    const donnees = { fraisCentimes: 0 };
    const octets = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ versionConsignes: VERSION_CONSIGNES_ASSISTANT, sujet: 'frais', donnees })));
    const attendu = Array.from(new Uint8Array(octets), (octet) => octet.toString(16).padStart(2, '0')).join('');
    expect(await empreinteContexteAssistant('frais', donnees)).toBe(attendu);
    const ancien = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ sujet: 'frais', donnees })));
    expect(attendu).not.toBe(Array.from(new Uint8Array(ancien), (o) => o.toString(16).padStart(2, '0')).join(''));
  });
});
