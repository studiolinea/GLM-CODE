import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { DepotSupabase } from '../src/donnees/depotSupabase';
import { calculerResume } from '../src/calculs/resume';
import { preparerImportFichier } from '../src/ecrans/AjoutFichier';
import { donneesVides } from '../src/donnees/actions';
import { Synchro } from '../src/donnees/synchro';

const maintenant = new Date('2026-10-06T12:00:00Z');

describe('fiabilité des données', () => {
  it('ordonne chaque pagination sur la clé unique du business', async () => {
    const ordres: Record<string, string[]> = {};
    const client = { from(table: string) {
      ordres[table] = [];
      const requete = {
        select: () => requete, eq: () => requete,
        order: (colonne: string) => { ordres[table]!.push(colonne); return requete; },
        range: async () => ({ data: [], error: null }),
      };
      return requete;
    }};
    await new DepotSupabase(client as unknown as SupabaseClient, 'user', 'business').charger();
    expect(ordres).toEqual({ ventes: ['plateforme', 'numero_commande'], videos: ['id'], etats_alertes: ['alerte_id'], reglages: ['business_id'] });
  });

  it('lit plus de 1 000 ventes sans doublon entre les pages', async () => {
    const lignes = Array.from({ length: 1001 }, (_, i) => ({ user_id: 'user', plateforme: 'stripe', numero_commande: `ch_${String(i).padStart(4, '0')}`, instant: maintenant.toISOString(), montant_centimes: 100, frais_centimes: null, rembourse: false, produit: '' }));
    const client = { from(table: string) {
      let ordonnee = false;
      const requete = {
        select: () => requete, eq: () => requete,
        order: () => { ordonnee = true; return requete; },
        range: async (debut: number, fin: number) => ({ data: table === 'ventes' ? (ordonnee || debut === 0 ? lignes : [...lignes].reverse()).slice(debut, fin + 1) : [], error: null }),
      };
      return requete;
    }};
    const compte = await new DepotSupabase(client as unknown as SupabaseClient, 'user', 'business').charger();
    expect(compte.ventes).toHaveLength(1001);
    expect(new Set(compte.ventes.map((v) => v.numeroCommande)).size).toBe(1001);
  });

  it('un remboursement Stripe ne produit pas de faux gains sans date ni frais de remboursement', () => {
    const resume = calculerResume([{ plateforme: 'stripe', numeroCommande: 'ch_1', instant: '2026-10-05T08:00:00Z', montantCentimes: 1990, fraisCentimes: 125, rembourse: true, produit: '' }], '7j', maintenant);
    expect(resume.gainsCentimes).toBeNull();
  });

  it('refuse tout import partiel sans avancer la couverture', () => {
    const texte = 'numero_commande,date,montant\n1,2026-10-05,19.90\n2,illisible,19.90';
    const resultat = preparerImportFichier(texte, '2026-10-06T13:00', maintenant);
    expect(resultat.ok).toBe(false);
  });

  it('demande une borne explicite au lieu de deviner depuis la date du fichier', () => {
    const texte = 'numero_commande,date,montant\n1,2026-10-05,19.90';
    expect(preparerImportFichier(texte, '', maintenant).ok).toBe(false);
    expect(preparerImportFichier(texte, '2026-10-06T13:00', maintenant)).toMatchObject({ ok: true, couverture: '2026-10-06T11:00:00.000Z' });
    expect(preparerImportFichier(texte, '2026-10-07T13:00', maintenant).ok).toBe(false);
  });

  it('relit la base après un échec partiel au lieu de prétendre tout annuler', async () => {
    const avant = donneesVides();
    const video = { id: 'v1', instant: maintenant.toISOString(), reseau: 'tiktok' as const };
    const surEchec = vi.fn();
    const depot = {
      appliquer: async () => { throw new Error('second lot refusé'); },
      charger: async () => ({ ventes: [], videos: [video], etatsAlertes: {}, reglages: { objectifParJour: 1, couverture: null, exempleTermine: true } }),
    };
    const synchro = new Synchro(depot, avant, surEchec);
    expect(await synchro.enregistrer(avant, { ...avant, videos: [video] })).toBe(false);
    expect(surEchec.mock.calls[0]![0].videos).toEqual([video]);
  });
});

it('garde la copie confirmée si la relecture échoue aussi', async () => {
  const avant = donneesVides();
  const surEchec = vi.fn();
  const depot = { appliquer: async () => { throw new Error('hors ligne'); }, charger: async () => { throw new Error('hors ligne'); } };
  const synchro = new Synchro(depot, avant, surEchec);
  expect(await synchro.enregistrer(avant, { ...avant, reglages: { objectifParJour: 2 } })).toBe(false);
  expect(surEchec.mock.calls[0]![0]).toEqual(avant);
});
