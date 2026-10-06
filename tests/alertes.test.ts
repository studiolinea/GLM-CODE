import { describe, expect, it } from 'vitest';
import { alertesVisibles, calculerAlertes, compteurVoyants, NOTE_DATES, type ContexteAlertes } from '../src/alertes/alertes';
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
      dapres: 'D’après : aucune vidéo notée pour l’instant. Ton objectif : 1 par jour.',
      action: { cible: 'saisie-video', libelle: 'J’ai publié' },
    });
  });

  it('dernière vidéo il y a 3 jours', () => {
    const [a] = parType(contexte({ videos: [video('v1', '2026-10-02T10:00:00Z')] }), 'publication');
    expect(a?.dapres).toBe('D’après : ta dernière vidéo remonte à 3 jours. Ton objectif : 1 par jour.');
  });

  it('dernière vidéo hier soir, en heure de Paris', () => {
    // 4 octobre, 23 h 30 à Paris.
    const [a] = parType(contexte({ videos: [video('v1', '2026-10-04T21:30:00Z')] }), 'publication');
    expect(a?.dapres).toContain('ta dernière vidéo date d’hier.');
  });

  it('pas d’alerte si l’objectif du jour est atteint', () => {
    expect(parType(contexte({ videos: [video('v1', ilYA(2))] }), 'publication')).toEqual([]);
  });

  it('objectif de 2 par jour avec 1 vidéo publiée', () => {
    const [a] = parType(contexte({ reglages: { objectifParJour: 2 }, videos: [video('v1', ilYA(2))] }), 'publication');
    expect(a?.titre).toBe('Encore 1 vidéo pour ton objectif du jour');
    expect(a?.dapres).toBe('D’après : tu as publié 1 vidéo aujourd’hui. Ton objectif : 2 par jour.');
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
      titre: 'Des ventes après ta vidéo TikTok du 03/10',
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
    expect(a?.dapres).toMatch(/^D’après : ventes chargées jusqu’au /);
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

describe('avec la base en ligne : tout arrive des comptes reliés, rien à noter à la main', () => {
  const relie = { boutique: true, videos: true };

  it('boutique pas reliée : on propose de la relier, pas d’ajouter un fichier', () => {
    const [a] = parType(contexte({ couverture: null, comptes: { boutique: false, videos: true } }), 'fichier');
    expect(a).toMatchObject({ id: 'boutique-a-relier', titre: 'Relie ta boutique', action: { cible: 'comptes', libelle: 'Relier ma boutique' } });
  });

  it('boutique reliée, ventes lues hier : rien à signaler ; il y a 3 jours : la synchro ne marche plus', () => {
    expect(parType(contexte({ couverture: ilYA(24), comptes: relie }), 'fichier')).toEqual([]);
    expect(parType(contexte({ couverture: null, comptes: relie }), 'fichier')).toEqual([]);
    const [a] = parType(contexte({ couverture: ilYA(72), comptes: relie }), 'fichier');
    expect(a).toMatchObject({
      titre: 'Tes ventes ne se mettent plus à jour',
      dapres: 'D’après : dernières ventes lues le 02/10. Regarde la boutique reliée dans les réglages.',
      action: { cible: 'comptes' },
    });
  });

  it('pas publié aujourd’hui : « Actualiser » si TikTok est relié, sinon « Relier TikTok »', () => {
    const [avec] = parType(contexte({ comptes: relie }), 'publication');
    expect(avec).toMatchObject({
      dapres: 'D’après : aucune vidéo pour l’instant. Ton objectif : 1 par jour.',
      action: { cible: 'actualiser', libelle: 'Actualiser' },
    });
    const [sans] = parType(contexte({ comptes: { boutique: true, videos: false } }), 'publication');
    // Les réglages s'ouvrent directement sur la carte TikTok.
    expect(sans?.action).toEqual({ cible: 'comptes', libelle: 'Relier TikTok', compte: 'tiktok' });
  });

  it('une vidéo TikTok sans lien, TikTok relié : pas de bouton (elle se met à jour toute seule)', () => {
    const [a] = parType(contexte({ comptes: relie, videos: [video('v1', ilYA(2))] }), 'video');
    expect(a).toBeDefined();
    expect(a?.action).toBeUndefined();
  });

  it('une vidéo Instagram sans lien se complète à la main, même avec TikTok relié', () => {
    const [a] = parType(contexte({ comptes: relie, videos: [video('v1', ilYA(2), { reseau: 'instagram' })] }), 'video');
    expect(a?.action).toEqual({ cible: 'modifier-video', libelle: 'Compléter la vidéo', videoId: 'v1' });
  });

  it('une vidéo avec son lien garde « Voir la vidéo »', () => {
    const v = video('v1', ilYA(2), { lien: 'https://www.tiktok.com/@kevin/video/9' });
    const [a] = parType(contexte({ comptes: relie, videos: [v] }), 'video');
    expect(a?.action).toEqual({ cible: 'lien', libelle: 'Voir la vidéo', url: 'https://www.tiktok.com/@kevin/video/9' });
  });

  it('pas encore de vente chargée : le constat commence par une minuscule', () => {
    const [a] = parType(contexte({ couverture: null, comptes: relie, videos: [video('v1', ilYA(60))] }), 'video');
    expect(a?.dapres).toMatch(/^D’après : aucune vente chargée, il manque la fin des 48 h/);
  });
});

describe('le compteur des voyants', () => {
  it('ne compte que les voyants à traiter, pas les infos ni les bonnes nouvelles', () => {
    // Pas assez publié (à traiter), une vidéo trop récente (info), une vidéo qui a fait vendre (bonne nouvelle).
    const alertes = calculerAlertes(
      contexte({
        videos: [video('v1', ilYA(100)), video('v2', ilYA(2))],
        ventes: [vente('1', ilYA(90))],
        reglages: { objectifParJour: 2 },
      }),
    );
    expect(alertes.map((a) => a.ton).sort()).toEqual(['attention', 'bonne-nouvelle', 'info']);
    expect(compteurVoyants(alertes)).toBe('1 à traiter');
  });

  it('« rien à traiter » quand il n’y a que des infos, ou aucun voyant', () => {
    const infos = calculerAlertes(contexte({ videos: [video('v1', ilYA(2))], reglages: { objectifParJour: 0 } }));
    expect(infos.map((a) => a.ton)).toEqual(['info']);
    expect(compteurVoyants(infos)).toBe('rien à traiter');
    expect(compteurVoyants([])).toBe('rien à traiter');
  });

  it('plusieurs voyants à traiter', () => {
    const alertes = calculerAlertes(contexte({ couverture: null, comptes: { boutique: false, videos: false } }));
    expect(alertes.filter((a) => a.ton === 'attention').length).toBe(2);
    expect(compteurVoyants(alertes)).toBe('2 à traiter');
  });
});

describe('les boutons des voyants mènent à la bonne carte des réglages', () => {
  it('« Relie ta boutique » ouvre la carte de la boutique', () => {
    const [a] = parType(contexte({ couverture: null, comptes: { boutique: false, videos: true } }), 'fichier');
    expect(a?.action).toEqual({ cible: 'comptes', libelle: 'Relier ma boutique', compte: 'boutique' });
  });

  it('« Tes ventes ne se mettent plus à jour » ouvre aussi la carte de la boutique', () => {
    const [a] = parType(contexte({ couverture: ilYA(72), comptes: { boutique: true, videos: true } }), 'fichier');
    expect(a?.action).toEqual({ cible: 'comptes', libelle: 'Voir la boutique reliée', compte: 'boutique' });
  });

  it('vidéo « trop tôt pour conclure » faute de ventes, sans boutique reliée : « Relier ma boutique »', () => {
    const v = video('v1', ilYA(60), { lien: 'https://www.tiktok.com/@kevin/video/9' });
    const [a] = parType(contexte({ couverture: null, comptes: { boutique: false, videos: true }, videos: [v] }), 'video');
    expect(a?.titre).toMatch(/trop tôt pour conclure$/);
    expect(a?.action).toEqual({ cible: 'comptes', libelle: 'Relier ma boutique', compte: 'boutique' });
  });

  it('même vidéo, boutique reliée : on garde « Voir la vidéo » (les ventes arrivent toutes seules)', () => {
    const v = video('v1', ilYA(60), { lien: 'https://www.tiktok.com/@kevin/video/9' });
    const [a] = parType(contexte({ couverture: null, comptes: { boutique: true, videos: true }, videos: [v] }), 'video');
    expect(a?.action).toEqual({ cible: 'lien', libelle: 'Voir la vidéo', url: 'https://www.tiktok.com/@kevin/video/9' });
  });

  it('vidéo de moins de 48 h, sans boutique reliée : rien à conclure, on garde « Voir la vidéo »', () => {
    const v = video('v1', ilYA(2), { lien: 'https://www.tiktok.com/@kevin/video/9' });
    const [a] = parType(contexte({ couverture: null, comptes: { boutique: false, videos: true }, videos: [v] }), 'video');
    expect(a?.action?.cible).toBe('lien');
  });

  it('sur l’appareil seul, rien ne change : « Compléter la vidéo »', () => {
    const [a] = parType(contexte({ couverture: null, videos: [video('v1', ilYA(60))] }), 'video');
    expect(a?.action).toEqual({ cible: 'modifier-video', libelle: 'Compléter la vidéo', videoId: 'v1' });
  });
});
