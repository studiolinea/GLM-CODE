import { describe, expect, it } from 'vitest';
import { alertesVisibles, calculerAlertes, NOTE_DATES, type ContexteAlertes } from '../src/alertes/alertes';
import { MS_HEURE } from '../src/temps';
import type { Video } from '../src/modele';
import type { Vente } from '../src/ventes/modele';

// Lundi 5 octobre 2026, 18 h à Paris.
const maintenant = new Date('2026-10-05T16:00:00Z');
const ilYA = (heures: number) => new Date(maintenant.getTime() - heures * MS_HEURE).toISOString();

function vente(numero: string, instant: string, rembourse = false): Vente {
  return {
    plateforme: 'exemple',
    numeroCommande: numero,
    instant,
    montantCentimes: 1990,
    fraisCentimes: 150,
    rembourse,
    produit: 'Guide',
  };
}

function video(id: string, instant: string, autres: Partial<Video> = {}): Video {
  return { id, instant, reseau: 'tiktok', ...autres };
}

function contexte(autres: Partial<ContexteAlertes> = {}): ContexteAlertes {
  return {
    ventes: [],
    videos: [],
    reglages: { objectifParJour: 1 },
    couverture: maintenant.toISOString(),
    exemple: false,
    maintenant,
    ...autres,
  };
}

const parType = (ctx: ContexteAlertes, type: string) => calculerAlertes(ctx).filter((a) => a.type === type);

describe('Alerte A : « Tu n’as pas publié aujourd’hui »', () => {
  it('aucune vidéo notée', () => {
    const [a] = parType(contexte(), 'publication');
    expect(a).toMatchObject({
      id: 'publication-2026-10-05',
      titre: 'Tu n’as pas publié aujourd’hui',
      dapres: 'D’après : Aucune vidéo notée pour l’instant. Ton objectif : 1 par jour.',
      action: { cible: 'saisie-video', libelle: 'J’ai publié' },
    });
  });

  it('dernière vidéo il y a 3 jours', () => {
    const [a] = parType(contexte({ videos: [video('v1', '2026-10-02T10:00:00Z')] }), 'publication');
    expect(a?.dapres).toBe('D’après : Ton dernier post date de 3 jours. Ton objectif : 1 par jour.');
  });

  it('dernière vidéo hier soir, en heure de Paris', () => {
    // 4 octobre, 23 h 30 à Paris.
    const [a] = parType(contexte({ videos: [video('v1', '2026-10-04T21:30:00Z')] }), 'publication');
    expect(a?.dapres).toContain('Ton dernier post date d’hier.');
  });

  it('pas d’alerte si l’objectif du jour est atteint', () => {
    expect(parType(contexte({ videos: [video('v1', ilYA(2))] }), 'publication')).toEqual([]);
  });

  it('objectif de 2 par jour avec 1 vidéo publiée', () => {
    const [a] = parType(contexte({ reglages: { objectifParJour: 2 }, videos: [video('v1', ilYA(2))] }), 'publication');
    expect(a?.titre).toBe('Encore 1 vidéo pour ton objectif du jour');
    expect(a?.dapres).toBe('D’après : Tu as publié 1 vidéo aujourd’hui. Ton objectif : 2 par jour.');
  });

  it('objectif à 0 : pas de rappel', () => {
    expect(parType(contexte({ reglages: { objectifParJour: 0 } }), 'publication')).toEqual([]);
  });
});

describe('Alerte B : ce qu’a donné chaque vidéo', () => {
  it('une vente dans les 48 h : bonne nouvelle, avec la précaution', () => {
    const v = video('v1', '2026-10-03T10:00:00Z', { vues: 850, lien: 'https://www.tiktok.com/@kevin/video/1' });
    const [a] = parType(contexte({ videos: [v], ventes: [vente('1', '2026-10-04T09:00:00Z')] }), 'video');
    expect(a).toMatchObject({
      id: 'video-v1-ventes',
      ton: 'bonne-nouvelle',
      titre: 'Ta vidéo TikTok du 03/10 a ramené des ventes',
      dapres: 'D’après : 850 vues, 1 vente dans les 48 h suivantes.',
      note: NOTE_DATES,
      action: { cible: 'lien', url: 'https://www.tiktok.com/@kevin/video/1' },
    });
  });

  it('à 47 h : trop tôt ; à 49 h : on conclut', () => {
    const tot = parType(contexte({ videos: [video('v1', ilYA(47))] }), 'video');
    expect(tot[0]).toMatchObject({ id: 'video-v1-tot', ton: 'info' });
    expect(tot[0]?.titre).toContain('trop tôt pour conclure');

    const fini = parType(contexte({ videos: [video('v1', ilYA(49))] }), 'video');
    expect(fini[0]?.id).toBe('video-v1-zero');
  });

  it('ventes pas chargées jusqu’à la fin des 48 h : trop tôt', () => {
    const [a] = parType(contexte({ videos: [video('v1', ilYA(60))], couverture: ilYA(20) }), 'video');
    expect(a?.id).toBe('video-v1-tot');
    expect(a?.dapres).toContain('il manque la fin des 48 h');
  });

  it('compte la vente au début de la fenêtre, pas celle pile à la fin', () => {
    const debut = ilYA(60);
    const fin = ilYA(12);
    const ctx = contexte({ videos: [video('v1', debut)], ventes: [vente('1', debut), vente('2', fin)] });
    expect(parType(ctx, 'video')[0]?.dapres).toContain('1 vente dans les 48 h');
  });

  it('ne compte pas une vente remboursée', () => {
    const ctx = contexte({ videos: [video('v1', ilYA(60))], ventes: [vente('1', ilYA(50), true)] });
    expect(parType(ctx, 'video')[0]?.id).toBe('video-v1-zero');
  });

  it('des vues mais 0 vente', () => {
    const [a] = parType(contexte({ videos: [video('v1', ilYA(60), { vues: 1200, reseau: 'instagram' })] }), 'video');
    expect(a).toMatchObject({
      id: 'video-v1-vues-zero',
      ton: 'attention',
      titre: 'Ta vidéo Instagram du 03/10 a fait des vues mais 0 vente',
      action: { cible: 'modifier-video', videoId: 'v1' },
    });
    expect(a?.dapres.replace(/\s/g, ' ')).toBe('D’après : 1 200 vues, 0 vente dans les 48 h suivantes.');
  });

  it('0 vente sans vues notées : invite à ajouter les vues', () => {
    const [a] = parType(contexte({ videos: [video('v1', ilYA(60))] }), 'video');
    expect(a?.dapres).toBe('D’après : 0 vente dans les 48 h suivantes. Ajoute les vues pour mieux comparer.');
  });

  it('deux vidéos à moins de 48 h : ni l’une ni l’autre ne prend les ventes', () => {
    const ctx = contexte({
      videos: [video('v1', ilYA(80)), video('v2', ilYA(70))],
      ventes: [vente('1', ilYA(65))],
    });
    const alertes = parType(ctx, 'video');
    expect(alertes.map((a) => a.id)).toEqual(['video-v2-chevauchement', 'video-v1-chevauchement']);
    for (const a of alertes) {
      expect(a.ton).toBe('info');
      expect(a.titre).toContain('impossible de dire quelle vidéo a fait vendre');
      expect(a.dapres).toContain('1 vente dans les 48 h suivantes sur cette période');
    }
    expect(alertes.some((a) => a.ton === 'bonne-nouvelle')).toBe(false);
  });

  it('ignore les vidéos de plus de 7 jours', () => {
    expect(parType(contexte({ videos: [video('v1', '2026-09-28T10:00:00Z')] }), 'video')).toEqual([]);
  });
});

describe('Alerte C : le fichier de ventes', () => {
  it('aucun fichier encore ajouté', () => {
    const [a] = parType(contexte({ couverture: null }), 'fichier');
    expect(a).toMatchObject({ titre: 'Ajoute ton premier fichier de ventes', action: { cible: 'import' } });
  });

  it('ventes chargées il y a 3 jours', () => {
    const [a] = parType(contexte({ couverture: ilYA(72) }), 'fichier');
    expect(a?.titre).toBe('Ajoute ton fichier de ventes');
    expect(a?.dapres).toBe('D’après : dernières ventes chargées le 02/10. Les chiffres s’arrêtent là.');
  });

  it('ventes chargées hier : rien à signaler', () => {
    expect(parType(contexte({ couverture: ilYA(24) }), 'fichier')).toEqual([]);
  });

  it('pas d’alerte de fichier en mode exemple', () => {
    expect(parType(contexte({ couverture: null, exemple: true }), 'fichier')).toEqual([]);
  });
});

describe('ordre et rangement des alertes', () => {
  it('fichier d’abord, puis publication, puis vidéos', () => {
    // Vidéo publiée aujourd'hui : objectif atteint, donc pas d'alerte de publication.
    const ctx = contexte({ couverture: null, videos: [video('v1', ilYA(2))] });
    expect(calculerAlertes(ctx).map((a) => a.type)).toEqual(['fichier', 'video']);
    const ctx2 = contexte({ couverture: null, videos: [video('v1', '2026-10-03T10:00:00Z')] });
    expect(calculerAlertes(ctx2).map((a) => a.type)).toEqual(['fichier', 'publication', 'video']);
  });

  it('« Fait » range l’alerte ; « Plus tard » la cache jusqu’au lendemain', () => {
    const alertes = calculerAlertes(contexte({ couverture: null }));
    expect(alertes.map((a) => a.id)).toEqual(['fichier-premier', 'publication-2026-10-05']);

    const etats = {
      'fichier-premier': { statut: 'plus-tard' as const, le: '2026-10-05' },
      'publication-2026-10-05': { statut: 'fait' as const, le: '2026-10-05' },
    };
    expect(alertesVisibles(alertes, etats, '2026-10-05')).toEqual([]);
    expect(alertesVisibles(alertes, etats, '2026-10-06').map((a) => a.id)).toEqual(['fichier-premier']);
  });
});
