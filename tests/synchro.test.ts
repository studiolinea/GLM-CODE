import { describe, expect, it } from 'vitest';
import { donneesVides, enregistrerVideo, importerVentes, quitterExemple, rangerAlerte, supprimerVideo } from '../src/donnees/actions';
import { calculerChangements, versDonnees, type Changements, type Depot, type DonneesCompte } from '../src/donnees/depot';
import { donneesExemple } from '../src/donnees/exemple';
import { ligneVersVente, ligneVersVideo, venteVersLigne, videoVersLigne } from '../src/donnees/lignes';
import { Synchro } from '../src/donnees/synchro';
import type { Donnees, Video } from '../src/modele';
import type { Vente } from '../src/ventes/modele';

const maintenant = new Date('2026-10-05T16:00:00Z');
const video: Video = { id: 'v1', instant: '2026-10-05T14:00:00.000Z', reseau: 'tiktok' };
const vente: Vente = {
  plateforme: 'exemple',
  numeroCommande: '1',
  instant: '2026-10-04T10:00:00.000Z',
  montantCentimes: 1990,
  fraisCentimes: 150,
  rembourse: false,
  produit: 'Guide',
};
const compteVide: DonneesCompte = { ventes: [], videos: [], etatsAlertes: {}, reglages: null };

/** Une base en mémoire, qui peut simuler une coupure de connexion. */
class DepotMemoire implements Depot {
  compte: DonneesCompte = structuredClone(compteVide);
  envois: Changements[] = [];
  enPanne = false;

  async charger() {
    return structuredClone(this.compte);
  }

  async appliquer(c: Changements) {
    await Promise.resolve();
    if (this.enPanne) throw new Error('Pas de connexion');
    this.envois.push(c);
    const cle = (v: Pick<Vente, 'plateforme' | 'numeroCommande'>) => `${v.plateforme}:${v.numeroCommande}`;
    const supprimees = new Set(c.ventes.supprimer.map(cle));
    const ventes = new Map(this.compte.ventes.filter((v) => !supprimees.has(cle(v))).map((v) => [cle(v), v]));
    for (const v of c.ventes.enregistrer) ventes.set(cle(v), v);
    const videos = new Map(this.compte.videos.filter((v) => !c.videos.supprimer.includes(v.id)).map((v) => [v.id, v]));
    for (const v of c.videos.enregistrer) videos.set(v.id, v);
    const etats = { ...this.compte.etatsAlertes };
    for (const id of c.etatsAlertes.supprimer) delete etats[id];
    for (const e of c.etatsAlertes.enregistrer) etats[e.id] = e.etat;
    this.compte = {
      ventes: [...ventes.values()],
      videos: [...videos.values()],
      etatsAlertes: etats,
      reglages: c.reglages ?? this.compte.reglages,
    };
  }
}

describe('versDonnees', () => {
  it('compte vide et jamais commencé : on montre l’exemple', () => {
    expect(versDonnees(compteVide, maintenant).exemple).toBe(true);
  });

  it('compte vide mais déjà commencé : pas d’exemple, des chiffres vides', () => {
    const d = versDonnees({ ...compteVide, reglages: { objectifParJour: 2, couverture: null, exempleTermine: true } }, maintenant);
    expect(d).toEqual({ ...donneesVides({ objectifParJour: 2 }) });
  });
});

describe('calculerChangements', () => {
  it('une action sur l’exemple ne s’écrit jamais dans la base', () => {
    const exemple = donneesExemple(maintenant);
    expect(calculerChangements(exemple, rangerAlerte(exemple, 'x', 'fait', '2026-10-05'))).toBeNull();
  });

  it('quitter l’exemple écrit seulement les vraies données et marque l’exemple comme terminé', () => {
    const exemple = donneesExemple(maintenant);
    const c = calculerChangements(exemple, enregistrerVideo(exemple, video))!;
    expect(c.videos.enregistrer).toEqual([video]);
    expect(c.ventes.enregistrer).toEqual([]);
    expect(c.reglages).toEqual({ objectifParJour: 1, couverture: null, exempleTermine: true });
  });

  it('« Commencer avec mes vraies données » écrit juste les réglages', () => {
    const exemple = donneesExemple(maintenant);
    const c = calculerChangements(exemple, quitterExemple(exemple))!;
    expect(c.reglages?.exempleTermine).toBe(true);
    expect(c.videos.enregistrer).toEqual([]);
  });

  it('n’envoie que ce qui a changé', () => {
    const avant = importerVentes(donneesVides(), [vente], maintenant.toISOString()).donnees;
    const apres = enregistrerVideo(avant, video);
    const c = calculerChangements(avant, apres)!;
    expect(c.videos.enregistrer).toEqual([video]);
    expect(c.ventes.enregistrer).toEqual([]);
    expect(c.reglages).toBeNull();
  });

  it('supprimer une vidéo envoie sa suppression', () => {
    const avant = enregistrerVideo(donneesVides(), video);
    expect(calculerChangements(avant, supprimerVideo(avant, 'v1'))?.videos.supprimer).toEqual(['v1']);
  });

  it('rien de changé : rien à envoyer', () => {
    const d = enregistrerVideo(donneesVides(), video);
    expect(calculerChangements(d, d)).toBeNull();
  });
});

describe('lignes de la base', () => {
  it('une vente fait l’aller-retour sans changer', () => {
    const ligne = { ...venteVersLigne(vente, 'u1'), instant: '2026-10-04T10:00:00+00:00' };
    expect(ligneVersVente(ligne)).toEqual(vente);
  });

  it('une vidéo sans lien ni vues revient sans ces champs', () => {
    const ligne = { ...videoVersLigne(video, 'u1'), instant: '2026-10-05T14:00:00+00:00' };
    expect(ligne.lien).toBeNull();
    expect(ligneVersVideo(ligne)).toEqual(video);
  });
});

describe('Synchro', () => {
  it('envoie les changements dans l’ordre, et la base finit comme l’appli', async () => {
    const depot = new DepotMemoire();
    let etat: Donnees = versDonnees(await depot.charger(), maintenant);
    const synchro = new Synchro(depot, etat, () => {
      throw new Error('ne doit pas échouer');
    });
    const modifier = (f: (d: Donnees) => Donnees) => {
      const avant = etat;
      etat = f(avant);
      synchro.enregistrer(avant, etat);
    };

    modifier((d) => enregistrerVideo(d, video));
    modifier((d) => importerVentes(d, [vente], maintenant.toISOString()).donnees);
    modifier((d) => rangerAlerte(d, 'publication-2026-10-05', 'fait', '2026-10-05'));
    expect(synchro.occupee).toBe(true);
    await synchro.attendre();
    expect(synchro.occupee).toBe(false);

    expect(versDonnees(await depot.charger(), maintenant)).toEqual(etat);
    expect(depot.envois).toHaveLength(3);
  });

  it('coupure : retour au dernier état confirmé, et les envois suivants sont abandonnés', async () => {
    const depot = new DepotMemoire();
    let etat: Donnees = donneesVides();
    let revenuA: Donnees | null = null;
    const synchro = new Synchro(depot, etat, (e) => (revenuA = e));
    const modifier = (f: (d: Donnees) => Donnees) => {
      const avant = etat;
      etat = f(avant);
      synchro.enregistrer(avant, etat);
    };

    modifier((d) => enregistrerVideo(d, video));
    await synchro.attendre();
    const confirme = etat;

    depot.enPanne = true;
    modifier((d) => enregistrerVideo(d, { ...video, id: 'v2' }));
    modifier((d) => enregistrerVideo(d, { ...video, id: 'v3' }));
    await synchro.attendre();

    expect(revenuA).toEqual(confirme);
    expect(depot.envois).toHaveLength(1);
    expect(depot.compte.videos.map((v) => v.id)).toEqual(['v1']);
  });
});
