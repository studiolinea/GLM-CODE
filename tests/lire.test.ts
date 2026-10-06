import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fusionnerVentes, lireFichierVentes } from '../src/ventes/lire';
import type { Vente } from '../src/ventes/modele';

const fichierExemple = readFileSync(new URL('./fichiers/ventes-exemple.csv', import.meta.url), 'utf8');

function lireOk(texte: string) {
  const r = lireFichierVentes(texte);
  if (!r.ok) throw new Error(r.erreur);
  return r;
}

describe('lireFichierVentes', () => {
  it('lit le fichier d’exemple', () => {
    const r = lireOk(fichierExemple);
    expect(r.plateforme).toBe('exemple');
    expect(r.ventes).toHaveLength(8);
    expect(r.lignesIgnorees).toEqual([]);

    const v1001 = r.ventes.find((v) => v.numeroCommande === '1001')!;
    expect(v1001).toEqual({
      plateforme: 'exemple',
      numeroCommande: '1001',
      instant: '2026-10-05T08:15:00.000Z',
      montantCentimes: 1990,
      fraisCentimes: 150,
      rembourse: false,
      produit: 'Guide detailing',
    });
    expect(r.ventes.find((v) => v.numeroCommande === '1004')!.rembourse).toBe(true);
    expect(r.ventes.find((v) => v.numeroCommande === '1006')!.fraisCentimes).toBeNull();
  });

  it('lit l’heure en heure de Paris', () => {
    const v = lireOk(fichierExemple).ventes.find((x) => x.numeroCommande === '1002')!;
    expect(v.instant).toBe('2026-09-28T22:30:00.000Z');
  });

  it('accepte les points-virgules et la marque BOM d’Excel', () => {
    const texte = '﻿numero_commande;date;montant;frais;rembourse;produit\nA1;05/10/2026 10:15;19,90;1,50;non;Guide\n';
    const r = lireOk(texte);
    expect(r.ventes).toHaveLength(1);
    expect(r.ventes[0]!.montantCentimes).toBe(1990);
  });

  it('refuse un fichier d’une autre forme sans rien lire', () => {
    const r = lireFichierVentes('nom,email,total\nJean,jean@example.com,10\n');
    expect(r.ok).toBe(false);
  });

  it('refuse un fichier vide', () => {
    expect(lireFichierVentes('').ok).toBe(false);
  });

  it('écarte les lignes illisibles et garde les autres', () => {
    const texte = [
      'numero_commande,date,montant,frais,rembourse,produit',
      '1,2026-10-05 10:00,"19,90",,non,Guide',
      '2,2026-10-05 11:00,abc,,non,Guide',
      ',2026-10-05 12:00,"19,90",,non,Guide',
      '4,demain,"19,90",,non,Guide',
      '5,2026-10-05 13:00,"19,90",,peut-être,Guide',
    ].join('\n');
    const r = lireOk(texte);
    expect(r.ventes.map((v) => v.numeroCommande)).toEqual(['1']);
    expect(r.lignesIgnorees.map((l) => l.ligne)).toEqual([3, 4, 5, 6]);
  });

  it('refuse un fichier dont aucune ligne n’est lisible', () => {
    const r = lireFichierVentes('numero_commande,date,montant\n1,demain,abc\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erreur.replace(/\s/g, ' ')).toContain('(1 ligne refusée)');
    const deux = lireFichierVentes('numero_commande,date,montant\n1,demain,abc\n2,hier,xyz\n');
    if (!deux.ok) expect(deux.erreur.replace(/\s/g, ' ')).toContain('(2 lignes refusées)');
    expect(deux.ok).toBe(false);
  });

  it('ne garde qu’une fois une commande répétée dans le même fichier', () => {
    const texte = 'numero_commande,date,montant\n1,2026-10-05 10:00,10\n1,2026-10-05 10:00,10\n';
    expect(lireOk(texte).ventes).toHaveLength(1);
  });
});

describe('fusionnerVentes', () => {
  it('recharger le même fichier ne crée pas de doublon', () => {
    const ventes = lireOk(fichierExemple).ventes;
    const premier = fusionnerVentes([], ventes);
    expect(premier.ajoutees).toBe(8);
    const second = fusionnerVentes(premier.ventes, ventes);
    expect(second).toMatchObject({ ajoutees: 0, misesAJour: 0, inchangees: 8 });
    expect(second.ventes).toHaveLength(8);
  });

  it('met à jour une vente remboursée depuis', () => {
    const vente: Vente = {
      plateforme: 'exemple',
      numeroCommande: '1',
      instant: '2026-10-05T08:00:00.000Z',
      montantCentimes: 1990,
      fraisCentimes: 150,
      rembourse: false,
      produit: 'Guide',
    };
    const r = fusionnerVentes([vente], [{ ...vente, rembourse: true }]);
    expect(r).toMatchObject({ ajoutees: 0, misesAJour: 1, inchangees: 0 });
    expect(r.ventes[0]!.rembourse).toBe(true);
  });
});
