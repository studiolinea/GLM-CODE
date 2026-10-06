import { describe, expect, it } from 'vitest';
import { lireMemoireBusiness } from '../src/donnees/business';

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
