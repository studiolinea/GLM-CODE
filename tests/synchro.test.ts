import { describe, expect, it } from 'vitest';
import { donneesVides, enregistrerVideo, importerVentes, quitterExemple, rangerAlerte, supprimerVideo } from '../src/donnees/actions';
import { calculerChangements, versDonnees, type Changements, type Depot, type DonneesCompte } from '../src/donnees/depot';
import { donneesExemple } from '../src/donnees/exemple';
import { businessAOuvrir, nomValide } from '../src/donnees/business';
import { resumeVentesTest } from '../src/calculs/ventesTest';
import { avecNomCompte, ConnexionExpiree } from '../src/donnees/comptesRelies';
import { ligneVersVente, ligneVersVideo, venteVersLigne, videoVersLigne } from '../src/donnees/lignes';
import { messageEchecEnregistrement, Synchro } from '../src/donnees/synchro';
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

  it('TVA retenue : envoyée seulement si la vente en a une, et relue à l’identique', () => {
    expect('tva_centimes' in venteVersLigne(vente, 'u1')).toBe(false);
    // La base renvoie null pour une vente sans TVA : la vente relue doit être exactement la même.
    expect(JSON.stringify(ligneVersVente({ ...venteVersLigne(vente, 'u1'), tva_centimes: null }))).toBe(JSON.stringify(vente));

    const avecTva = {
      plateforme: 'stripe',
      numeroCommande: 'ch_1',
      instant: '2026-10-04T10:00:00.000Z',
      montantCentimes: 1990,
      fraisCentimes: null,
      tvaCentimes: 109,
      rembourse: false,
      produit: 'Guide detailing',
    };
    const ligne = venteVersLigne(avecTva, 'u1');
    expect(ligne.tva_centimes).toBe(109);
    // Même ordre des champs : sinon l'appli croirait la vente modifiée et la renverrait à chaque fois.
    expect(JSON.stringify(ligneVersVente(ligne))).toBe(JSON.stringify(avecTva));
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

  it('dit à l’écran si le changement est enregistré : vrai, puis faux pendant une coupure', async () => {
    const depot = new DepotMemoire();
    const synchro = new Synchro(depot, donneesVides(), () => undefined);
    const avecVideo = enregistrerVideo(donneesVides(), video);
    await expect(synchro.enregistrer(donneesVides(), avecVideo)).resolves.toBe(true);
    depot.enPanne = true;
    const premier = synchro.enregistrer(avecVideo, enregistrerVideo(avecVideo, { ...video, id: 'v2' }));
    // Abandonné, car le précédent a échoué : pas enregistré non plus.
    const suivant = synchro.enregistrer(avecVideo, enregistrerVideo(avecVideo, { ...video, id: 'v3' }));
    await expect(premier).resolves.toBe(false);
    await expect(suivant).resolves.toBe(false);
    // Rien à changer : rien à attendre.
    await expect(synchro.enregistrer(avecVideo, avecVideo)).resolves.toBe(true);
  });
});

describe('ventes reçues de la boutique reliée', () => {
  const venteBoutique = (numero: string, plateforme = 'lemonsqueezy'): Vente => ({ ...vente, plateforme, numeroCommande: numero });

  it('une vraie vente fait disparaître l’exemple', async () => {
    const { appliquerVentesBoutique } = await import('../src/donnees/useSynchroBoutique');
    const d = appliquerVentesBoutique(donneesExemple(maintenant), [venteBoutique('1')], maintenant.toISOString());
    expect(d.exemple).toBe(false);
    expect(d.ventes.map((v) => v.numeroCommande)).toEqual(['1']);
  });

  it('les paiements Stripe en mode test restent aussi hors des vraies données', async () => {
    const { appliquerVentesBoutique } = await import('../src/donnees/useSynchroBoutique');
    const sansTest = appliquerVentesBoutique(donneesVides(), [venteBoutique('ch_t', 'stripe-test')], maintenant.toISOString());
    expect(sansTest.ventes).toEqual([]);
  });

  it('les ventes du mode test restent dans l’exemple, jamais dans les vraies données', async () => {
    const { appliquerVentesBoutique } = await import('../src/donnees/useSynchroBoutique');
    const exemple = donneesExemple(maintenant);
    const avecTest = appliquerVentesBoutique(exemple, [venteBoutique('T1', 'lemonsqueezy-test')], maintenant.toISOString());
    expect(avecTest.exemple).toBe(true);
    expect(calculerChangements(exemple, avecTest)).toBeNull();

    const reelles = donneesVides();
    const sansTest = appliquerVentesBoutique(reelles, [venteBoutique('T1', 'lemonsqueezy-test')], maintenant.toISOString());
    expect(sansTest.ventes).toEqual([]);
    expect(sansTest.couverture).toBe(maintenant.toISOString());
  });

  it('boutique vide pendant l’exemple : l’exemple reste', async () => {
    const { appliquerVentesBoutique } = await import('../src/donnees/useSynchroBoutique');
    const exemple = donneesExemple(maintenant);
    expect(appliquerVentesBoutique(exemple, [], maintenant.toISOString())).toBe(exemple);
  });
});

describe('plusieurs business', () => {
  it('un nom propre, ni vide ni trop long', () => {
    expect(nomValide('  Guide   detailing ')).toBe('Guide detailing');
    expect(nomValide('   ')).toBeNull();
    expect(nomValide('x'.repeat(61))).toBeNull();
  });

  it('rouvre le business retenu s’il existe encore, sinon le premier', () => {
    const liste = [
      { id: 'a', nom: 'Premier' },
      { id: 'b', nom: 'Deuxième' },
    ];
    expect(businessAOuvrir(liste, 'b')?.nom).toBe('Deuxième');
    expect(businessAOuvrir(liste, 'disparu')?.nom).toBe('Premier');
    expect(businessAOuvrir(liste, null)?.nom).toBe('Premier');
    expect(businessAOuvrir([], 'a')).toBeNull();
  });
});

describe('ventes du mode test : on dit ce qui a été reçu, sans le compter', () => {
  const test = (numero: string, autres: Partial<Vente> = {}): Vente => ({
    ...vente,
    plateforme: 'stripe-test',
    numeroCommande: numero,
    fraisCentimes: 125,
    tvaCentimes: 332,
    ...autres,
  });

  it('une vente : singulier, montant, frais et TVA', () => {
    expect(resumeVentesTest([test('ch_1')])).toBe(
      '1 vente en mode test reçue, pas comptée dans tes vrais chiffres : 19,90 €, frais 1,25 €, TVA 3,32 €.',
    );
  });

  it('plusieurs ventes : vrai pluriel, et les sommes', () => {
    expect(resumeVentesTest([test('ch_1'), test('ch_2', { rembourse: true })])).toBe(
      '2 ventes en mode test reçues, pas comptées dans tes vrais chiffres : 39,80 €, frais 2,50 €, TVA 6,64 € (dont 1 remboursée).',
    );
  });

  it('frais manquants : « frais inconnus », jamais un total deviné ; TVA absente : pas écrite', () => {
    const sansFrais = test('ch_1', { fraisCentimes: null, tvaCentimes: undefined });
    expect(resumeVentesTest([sansFrais, test('ch_2', { tvaCentimes: undefined })])).toBe(
      '2 ventes en mode test reçues, pas comptées dans tes vrais chiffres : 39,80 €, frais inconnus.',
    );
    expect(resumeVentesTest([])).toBeNull();
  });

  it('lireComptesRelies garde les ventes de test de chaque boutique, à part des vraies', async () => {
    const { lireComptesRelies } = await import('../src/donnees/useSynchroBoutique');
    let d: Donnees = donneesVides();
    const bilan = await lireComptesRelies(
      'b1',
      [{ source: 'stripe', identifiant: '', libelle: 'Stripe', relieLe: '', derniereSynchro: null, derniereErreur: null }],
      {
        boutique: async () => ({ ventes: [test('ch_t'), { ...vente, plateforme: 'stripe', numeroCommande: 'ch_r' }], ignorees: [], synchroniseLe: maintenant.toISOString() }),
        tiktok: async () => ({ videos: [] }),
      },
      (f) => (d = f(d)),
    );
    expect(bilan.ventesTest.stripe?.map((v) => v.numeroCommande)).toEqual(['ch_t']);
    expect(d.ventes.map((v) => v.numeroCommande)).toEqual(['ch_r']);
  });
});

describe('erreurs d’actualisation : chaque message dit le compte concerné', () => {
  const stripe = { source: 'stripe' as const, identifiant: '', libelle: 'Stripe', relieLe: '', derniereSynchro: null, derniereErreur: null };
  const tiktok = { source: 'tiktok' as const, identifiant: 'o1', libelle: 'kevin', relieLe: '', derniereSynchro: null, derniereErreur: null };

  it('« Stripe : … », « TikTok : … », et le message de chaque carte sans le nom', async () => {
    const { lireComptesRelies } = await import('../src/donnees/useSynchroBoutique');
    const bilan = await lireComptesRelies(
      'b1',
      [stripe, tiktok],
      {
        boutique: async () => {
          throw new Error('Le serveur a eu un problème. Réessaie dans un moment.');
        },
        tiktok: async () => {
          throw new Error('Accès refusé.');
        },
      },
      () => {},
    );
    expect(bilan.erreurs).toEqual(['Stripe : Le serveur a eu un problème. Réessaie dans un moment.', 'TikTok : Accès refusé.']);
    expect(bilan.parCompte).toEqual({ stripe: 'Le serveur a eu un problème. Réessaie dans un moment.', tiktok: 'Accès refusé.' });
    expect(bilan.expiree).toBe(false);
  });

  it('session expirée : on le sait, pour proposer de se reconnecter', async () => {
    const { lireComptesRelies } = await import('../src/donnees/useSynchroBoutique');
    const bilan = await lireComptesRelies(
      'b1',
      [stripe],
      {
        boutique: async () => {
          throw new ConnexionExpiree();
        },
        tiktok: async () => ({ videos: [] }),
      },
      () => {},
    );
    expect(bilan.expiree).toBe(true);
    expect(bilan.erreurs).toEqual(['Stripe : Ta connexion a expiré : reconnecte-toi.']);
  });

  it('un message qui nomme déjà le compte n’est pas doublé', () => {
    expect(avecNomCompte('stripe', 'Stripe refuse cette clé.')).toBe('Stripe refuse cette clé.');
    expect(avecNomCompte('lemonsqueezy', 'Clé refusée.')).toBe('Lemon Squeezy : Clé refusée.');
  });

  it('les ventes reçues automatiquement sont marquées comme telles (pas « ta dernière action »)', async () => {
    const { lireComptesRelies } = await import('../src/donnees/useSynchroBoutique');
    const origines: (string | undefined)[] = [];
    await lireComptesRelies(
      'b1',
      [stripe, tiktok],
      {
        boutique: async () => ({ ventes: [], ignorees: [], synchroniseLe: maintenant.toISOString() }),
        tiktok: async () => ({ videos: [] }),
      },
      (_f, origine) => origines.push(origine),
    );
    expect(origines).toEqual(['ventes', 'videos']);
  });
});

describe('enregistrement qui échoue : le message dit ce qui n’a pas été enregistré', () => {
  it('une action de la personne, ou une actualisation automatique', () => {
    expect(messageEchecEnregistrement()).toBe('Ta dernière action n’a pas été enregistrée. Vérifie ta connexion, puis réessaie.');
    expect(messageEchecEnregistrement('ventes')).toBe('Tes dernières ventes n’ont pas pu être enregistrées. Réessaie dans un moment.');
    expect(messageEchecEnregistrement('videos')).toBe('Tes dernières vidéos n’ont pas pu être enregistrées. Réessaie dans un moment.');
  });

  it('Synchro transmet l’origine du changement qui a échoué', async () => {
    const depot = new DepotMemoire();
    depot.enPanne = true;
    const origines: (string | undefined)[] = [];
    const synchro = new Synchro(depot, donneesVides(), (_e, origine) => origines.push(origine));
    synchro.enregistrer(donneesVides(), importerVentes(donneesVides(), [vente], maintenant.toISOString()).donnees, 'ventes');
    await synchro.attendre();
    synchro.enregistrer(donneesVides(), enregistrerVideo(donneesVides(), video));
    await synchro.attendre();
    expect(origines).toEqual(['ventes', undefined]);
  });
});
