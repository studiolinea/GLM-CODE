import { describe, expect, it } from 'vitest';
import { lireMemoireBusiness, messageNomPris, nomDejaPris, premierBusinessARenommer } from '../src/donnees/business';
import { memeNom } from '../src/texte';

describe('sans réseau : la liste des business gardée sur l’appareil', () => {
  it('relit la liste et le dernier business ouvert', () => {
    const texte = JSON.stringify({ actuel: 'b', liste: [{ id: 'a', nom: 'Guide' }, { id: 'b', nom: 'Kit', autre: 1 }] });
    expect(lireMemoireBusiness(texte)).toEqual({ actuel: 'b', liste: [{ id: 'a', nom: 'Guide' }, { id: 'b', nom: 'Kit' }] });
  });

  it('l’ancien format (l’identifiant seul) reste compris', () => {
    expect(lireMemoireBusiness('5b1c7f3e-0000-4000-8000-000000000000')).toEqual({
      actuel: '5b1c7f3e-0000-4000-8000-000000000000',
      liste: [],
    });
  });

  it('rien de gardé, ou un contenu abîmé : liste vide, sans planter', () => {
    expect(lireMemoireBusiness(null)).toEqual({ actuel: null, liste: [] });
    expect(lireMemoireBusiness('{"actuel": 3, "liste": [{"id": 1}]}')).toEqual({ actuel: null, liste: [] });
    expect(lireMemoireBusiness('[1, 2]')).toEqual({ actuel: null, liste: [] });
  });
});

describe('noms de business en double', () => {
  const liste = [
    { id: 'a', nom: 'Guide detailing' },
    { id: 'b', nom: 'Kit Alibaba' },
  ];

  it('refuse un nom déjà pris, sans tenir compte des majuscules ni des espaces', () => {
    expect(nomDejaPris('  guide   DETAILING ', liste)?.id).toBe('a');
    expect(nomDejaPris('Guidedetailing', liste)?.id).toBe('a');
    expect(nomDejaPris('Guide detailing 2', liste)).toBeNull();
    expect(messageNomPris(liste[0]!)).toBe('Tu as déjà un business qui s’appelle « Guide detailing ».');
  });

  it('renommer un business avec son propre nom (autres majuscules) reste possible', () => {
    expect(nomDejaPris('GUIDE detailing', liste, 'a')).toBeNull();
    expect(nomDejaPris('kit alibaba', liste, 'a')?.id).toBe('b');
  });

  it('memeNom ignore les majuscules et les espaces, pas les accents', () => {
    expect(memeNom('Été 2026', ' été  2026 ')).toBe(true);
    expect(memeNom('Ete 2026', 'Été 2026')).toBe(false);
  });
});

describe('premier business, encore avec l’exemple', () => {
  it('on propose de lui donner son vrai nom seulement dans ce cas', () => {
    const premier = [{ id: 'a', nom: 'Mon premier business' }];
    expect(premierBusinessARenommer(premier, true)).toBe(true);
    expect(premierBusinessARenommer(premier, false)).toBe(false);
    expect(premierBusinessARenommer([{ id: 'a', nom: 'Guide detailing' }], true)).toBe(false);
    expect(premierBusinessARenommer([...premier, { id: 'b', nom: 'Kit' }], true)).toBe(false);
  });
});
