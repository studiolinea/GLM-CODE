import { describe, expect, it } from 'vitest';
import { calculerAlertes } from '../src/alertes/alertes';
import {
  donneesVides,
  enregistrerVideo,
  importerVentes,
  lireSauvegarde,
  rangerAlerte,
  supprimerVideo,
  versSauvegarde,
} from '../src/donnees/actions';
import { donneesExemple, fichierEssai } from '../src/donnees/exemple';
import { lireFichierVentes } from '../src/ventes/lire';

const maintenant = new Date('2026-10-05T16:00:00Z');

describe('données d’exemple', () => {
  const exemple = donneesExemple(maintenant);

  it('sont signalées comme exemple et toujours identiques', () => {
    expect(exemple.exemple).toBe(true);
    expect(donneesExemple(maintenant)).toEqual(exemple);
  });

  it('montrent les trois cas de vidéo et le rappel de publication', () => {
    const ids = calculerAlertes({ ...exemple, maintenant }).map((a) => a.id);
    expect(ids).toEqual([
      'publication-2026-10-05',
      'video-exemple-3-tot',
      'video-exemple-2-ventes',
      'video-exemple-1-vues-zero',
    ]);
  });

  it('n’ont aucune vente dans le futur', () => {
    expect(exemple.ventes.every((v) => Date.parse(v.instant) < maintenant.getTime())).toBe(true);
  });
});

describe('vidéos', () => {
  const video = { id: 'v1', instant: '2026-10-05T14:00:00.000Z', reseau: 'tiktok' as const };

  it('une nouvelle vidéo fait disparaître l’exemple, mais garde les réglages', () => {
    const exemple = { ...donneesExemple(maintenant), reglages: { objectifParJour: 2 } };
    const d = enregistrerVideo(exemple, video);
    expect(d.exemple).toBe(false);
    expect(d.ventes).toEqual([]);
    expect(d.videos).toEqual([video]);
    expect(d.reglages.objectifParJour).toBe(2);
  });

  it('compléter une vidéo d’exemple ne retire pas l’exemple', () => {
    const exemple = donneesExemple(maintenant);
    const d = enregistrerVideo(exemple, { ...exemple.videos[0]!, vues: 2000 });
    expect(d.exemple).toBe(true);
    expect(d.videos[0]!.vues).toBe(2000);
  });

  it('se modifie et se supprime', () => {
    let d = enregistrerVideo(donneesVides(), video);
    d = enregistrerVideo(d, { ...video, vues: 300 });
    expect(d.videos).toEqual([{ ...video, vues: 300 }]);
    expect(supprimerVideo(d, 'v1').videos).toEqual([]);
  });
});

describe('importerVentes', () => {
  const lecture = lireFichierVentes(fichierEssai(maintenant));
  if (!lecture.ok) throw new Error(lecture.erreur);

  it('le premier vrai fichier remplace l’exemple', () => {
    const r = importerVentes(donneesExemple(maintenant), lecture.ventes, maintenant.toISOString());
    expect(r.exempleRetire).toBe(true);
    expect(r.donnees.exemple).toBe(false);
    expect(r.donnees.videos).toEqual([]);
    expect(r.donnees.ventes).toHaveLength(4);
    expect(r.fusion.ajoutees).toBe(4);
  });

  it('garde la couverture la plus récente', () => {
    const recent = '2026-10-05T16:00:00.000Z';
    const ancien = '2026-10-01T16:00:00.000Z';
    const d = importerVentes(donneesVides(), lecture.ventes, recent).donnees;
    expect(importerVentes(d, lecture.ventes, ancien).donnees.couverture).toBe(recent);
  });
});

describe('rangement des alertes et sauvegarde', () => {
  it('retient « Fait » avec la date', () => {
    const d = rangerAlerte(donneesVides(), 'publication-2026-10-05', 'fait', '2026-10-05');
    expect(d.etatsAlertes).toEqual({ 'publication-2026-10-05': { statut: 'fait', le: '2026-10-05' } });
  });

  it('une sauvegarde se relit à l’identique', () => {
    const d = donneesExemple(maintenant);
    expect(lireSauvegarde(versSauvegarde(d))).toEqual(d);
  });

  it('refuse un fichier qui n’est pas une sauvegarde', () => {
    expect(typeof lireSauvegarde('{"bonjour": 1}')).toBe('string');
    expect(typeof lireSauvegarde('pas du json')).toBe('string');
    expect(typeof lireSauvegarde('{"format":"pilotage-sauvegarde","donnees":{"ventes":3}}')).toBe('string');
  });
});
