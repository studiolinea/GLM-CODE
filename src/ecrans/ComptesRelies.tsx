import { useState, type ReactNode } from 'react';
import { formatEuros } from '../argent';
import type { CompteRelie, MouvementBoutique, SourceBoutique } from '../donnees/comptesRelies';
import type { SynchroBoutique } from '../donnees/useSynchroBoutique';
import { quandParis } from '../temps';

interface FicheBoutique {
  source: SourceBoutique;
  nom: string;
  placeholder: string;
  aide: ReactNode;
  /** La boutique sait montrer ses derniers mouvements d'argent (frais, TVA). */
  verification?: boolean;
}

const FICHES: FicheBoutique[] = [
  {
    source: 'stripe',
    nom: 'Boutique Stripe',
    placeholder: 'Colle ici ta clé limitée (rk_…)',
    aide: (
      <>
        Où la trouver : dans Stripe, « Développeurs », puis « Clés API », puis « Créer une clé limitée ». Nom :
        « Pilotage ». Mets « Lecture » pour « Charges » et pour « Balance », et « Aucune » pour tout le reste. Copie
        la clé, qui commence par « rk_ ». Elle ne peut que lire, rien modifier, et elle est chiffrée avant d’être
        enregistrée.
      </>
    ),
    verification: true,
  },
  {
    source: 'lemonsqueezy',
    nom: 'Boutique Lemon Squeezy',
    placeholder: 'Colle ici ta clé d’accès',
    aide: (
      <>
        Où la trouver : dans Lemon Squeezy, « Settings », puis « API », puis le bouton « + ». Donne-lui le nom
        « Pilotage », puis copie la clé. Elle est chiffrée avant d’être enregistrée.
      </>
    ),
  },
];

/** « Mes comptes reliés » : chacun relie et déconnecte lui-même ses propres comptes. */
export function ComptesRelies({ boutique }: { boutique: SynchroBoutique }) {
  return (
    <section aria-labelledby="titre-comptes-relies">
      <h3 id="titre-comptes-relies" className="titre-reglage">
        Mes comptes reliés
      </h3>
      {boutique.comptes === null && !boutique.erreur && <p className="texte-doux">Chargement…</p>}
      {boutique.erreur && <p className="erreur">{boutique.erreur}</p>}
      {FICHES.map((fiche) => (
        <Boutique key={fiche.source} fiche={fiche} boutique={boutique} />
      ))}
      <CompteTikTok boutique={boutique} />
      <Bientot nom="Instagram" />
    </section>
  );
}

function Boutique({ fiche, boutique }: { fiche: FicheBoutique; boutique: SynchroBoutique }) {
  const relie = boutique.comptes?.find((c) => c.source === fiche.source);
  const [cle, setCle] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const relier = async () => {
    setMessage(null);
    if (!cle.trim()) return setMessage({ type: 'erreur', texte: 'Colle d’abord ta clé d’accès.' });
    setOccupe(true);
    try {
      const libelle = await boutique.relier(fiche.source, cle.trim());
      setCle('');
      setMessage({ type: 'succes', texte: `Reliée : « ${libelle} ».` });
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'La liaison a échoué. Réessaie.' });
    } finally {
      setOccupe(false);
    }
  };

  const deconnecter = async () => {
    setOccupe(true);
    try {
      await boutique.deconnecter(fiche.source);
      setConfirmer(false);
      setMessage({ type: 'succes', texte: 'Boutique déconnectée. Tes ventes déjà chargées restent.' });
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'La déconnexion a échoué. Réessaie.' });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <div className="compte-relie">
      <div className="compte-entete">
        <span className="compte-nom">{fiche.nom}</span>
        <span className={`puce ${relie ? 'puce-on' : ''}`}>{relie ? 'Reliée' : 'Pas reliée'}</span>
      </div>

      {relie ? (
        <>
          <p className="texte-doux">
            « {relie.libelle} » ·{' '}
            {boutique.enCours
              ? 'synchronisation…'
              : relie.derniereSynchro
                ? `ventes à jour le ${quandParis(new Date(relie.derniereSynchro))}`
                : 'pas encore synchronisée'}
          </p>
          {relie.derniereErreur && <p className="erreur">{relie.derniereErreur}</p>}
          {!confirmer ? (
            <>
              <div className="pied" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="bouton" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
                  Synchroniser maintenant
                </button>
                <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
                  Déconnecter la boutique
                </button>
              </div>
              {fiche.verification && <Verification source={fiche.source} boutique={boutique} />}
            </>
          ) : (
            <div role="alert">
              <p className="erreur">Déconnecter la boutique ? Ta clé sera effacée. Tes ventes déjà chargées restent.</p>
              <div className="pied" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="bouton danger" disabled={occupe} onClick={() => void deconnecter()}>
                  Oui, déconnecter
                </button>
                <button type="button" className="bouton discret" onClick={() => setConfirmer(false)}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <p className="texte-doux">Relie ta boutique : tes ventes arriveront toutes seules à chaque ouverture de l’appli.</p>
          <label className="champ">
            <span>Clé d’accès</span>
            <input
              id={`cle-${fiche.source}`}
              type="password"
              autoComplete="off"
              placeholder={fiche.placeholder}
              value={cle}
              onChange={(e) => setCle(e.target.value)}
            />
          </label>
          <p className="note">{fiche.aide}</p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton principal" disabled={occupe} onClick={() => void relier()}>
              {occupe ? 'Vérification…' : 'Relier'}
            </button>
          </div>
        </>
      )}
      {message && (
        <p className={message.type} role="status">
          {message.texte}
        </p>
      )}
    </div>
  );
}

/** Noms en français des mouvements les plus courants ; le type exact donné par la plateforme reste visible. */
const NOMS_TYPES: Record<string, string> = {
  charge: 'paiement',
  payment: 'paiement',
  refund: 'remboursement',
  payment_refund: 'remboursement',
  stripe_fee: 'frais Stripe',
  tax: 'taxe',
  withheld_tax: 'TVA retenue par Stripe',
  payout: 'virement vers ta banque',
  adjustment: 'ajustement',
  application_fee: 'commission',
  transfer: 'transfert',
};

function nomType(type: string): string {
  if (!type) return '—';
  const nom = NOMS_TYPES[type];
  return nom ? `${nom} (${type})` : type;
}

function somme(centimes: number | null, devise: string): string {
  if (centimes === null) return '—';
  if (devise === 'eur') return formatEuros(centimes);
  return `${(centimes / 100).toFixed(2).replace('.', ',')}\u00a0${devise.toUpperCase()}`;
}

/** Ce que la boutique a enregistré, mouvement par mouvement : sert à vérifier les frais et la TVA. */
function Verification({ source, boutique }: { source: SourceBoutique; boutique: SynchroBoutique }) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState<MouvementBoutique[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const lire = async () => {
    setOuvert(true);
    setErreur(null);
    setEnCours(true);
    try {
      setListe(await boutique.mouvements(source));
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'La lecture a échoué. Réessaie.');
    } finally {
      setEnCours(false);
    }
  };

  if (!ouvert) {
    return (
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="bouton discret" onClick={() => void lire()}>
          Vérifier les frais et la TVA
        </button>
      </div>
    );
  }
  return (
    <div className="verification">
      <p className="note">
        Ce que la boutique a enregistré : ses 25 derniers mouvements d’argent, du plus récent au plus ancien. Rien
        n’est gardé.
      </p>
      {enCours && <p className="texte-doux">Lecture…</p>}
      {erreur && <p className="erreur">{erreur}</p>}
      {!enCours && liste?.length === 0 && <p className="texte-doux">Aucun mouvement pour l’instant.</p>}
      {liste && liste.length > 0 && (
        <ul className="mouvements">
          {liste.map((m, i) => (
            <li key={i}>
              <div className="mouvement-tete">
                <span>{m.instant ? quandParis(new Date(m.instant)) : '—'}</span>
                <span>{nomType(m.type)}</span>
              </div>
              <div>
                montant {somme(m.montantCentimes, m.devise)} · frais {somme(m.fraisCentimes, m.devise)} · net{' '}
                {somme(m.netCentimes, m.devise)}
              </div>
              {m.detailFrais.map((f, j) => (
                <div key={j} className="texte-doux">
                  dont {nomType(f.type)} : {somme(f.montantCentimes, m.devise)}
                  {f.description && ` (« ${f.description} »)`}
                </div>
              ))}
              {m.description && <div className="texte-doux">« {m.description} »</div>}
              <div className="note">
                origine : {m.origine ?? '—'} · catégorie : {m.categorie ?? '—'}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="bouton discret" disabled={enCours} onClick={() => void lire()}>
          Relire
        </button>
        <button type="button" className="bouton discret" onClick={() => setOuvert(false)}>
          Masquer
        </button>
      </div>
    </div>
  );
}

/**
 * TikTok se relie par un accord donné sur le site de TikTok : pas de clé à copier.
 * Un business peut relier plusieurs comptes TikTok ; leurs vidéos s'additionnent.
 */
function CompteTikTok({ boutique }: { boutique: SynchroBoutique }) {
  const relies = boutique.comptes?.filter((c) => c.source === 'tiktok') ?? [];
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  const affiche = message ?? boutique.messageTikTok;

  const relier = async () => {
    setMessage(null);
    setOccupe(true);
    try {
      await boutique.relierTikTok(); // la page part sur TikTok
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Impossible d’ouvrir TikTok. Réessaie.' });
      setOccupe(false);
    }
  };

  return (
    <div className="compte-relie">
      <div className="compte-entete">
        <span className="compte-nom">TikTok</span>
        <span className={`puce ${relies.length > 0 ? 'puce-on' : ''}`}>
          {relies.length === 0 ? 'Pas relié' : relies.length === 1 ? 'Relié' : `${relies.length} comptes`}
        </span>
      </div>
      {relies.length === 0 ? (
        <p className="texte-doux">Relie ton compte : tes vidéos et leurs vues arriveront toutes seules, sans rien noter.</p>
      ) : (
        <>
          {relies.map((c) => (
            <CompteTikTokRelie key={c.identifiant} compte={c} boutique={boutique} onMessage={setMessage} />
          ))}
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
              Synchroniser maintenant
            </button>
          </div>
        </>
      )}
      <p className="note">
        TikTok te demandera ton accord. Pilotage lit seulement tes vidéos publiques et leurs vues : il ne publie rien.
        Pendant le mode test, seul un compte ajouté dans « Target Users » chez TikTok peut se relier.
      </p>
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className={`bouton ${relies.length === 0 ? 'principal' : 'contour'}`}
          disabled={occupe}
          onClick={() => void relier()}
        >
          {occupe ? 'Ouverture de TikTok…' : relies.length === 0 ? 'Relier un compte TikTok' : 'Ajouter un autre compte TikTok'}
        </button>
      </div>
      {affiche && (
        <p className={affiche.type} role="status">
          {affiche.texte}
        </p>
      )}
    </div>
  );
}

function CompteTikTokRelie({
  compte,
  boutique,
  onMessage,
}: {
  compte: CompteRelie;
  boutique: SynchroBoutique;
  onMessage: (m: { type: 'succes' | 'erreur'; texte: string }) => void;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const deconnecter = async () => {
    setOccupe(true);
    try {
      await boutique.deconnecter('tiktok', compte.identifiant);
      onMessage({ type: 'succes', texte: `« ${compte.libelle} » déconnecté. Ses vidéos déjà chargées restent.` });
    } catch (e) {
      onMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'La déconnexion a échoué. Réessaie.' });
      setOccupe(false);
    }
  };

  return (
    <div className="compte-reseau">
      <p className="texte-doux">
        « {compte.libelle} » ·{' '}
        {boutique.enCours
          ? 'synchronisation…'
          : compte.derniereSynchro
            ? `vidéos à jour le ${quandParis(new Date(compte.derniereSynchro))}`
            : 'pas encore synchronisé'}
      </p>
      {compte.derniereErreur && <p className="erreur">{compte.derniereErreur}</p>}
      {!confirmer ? (
        <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
          Déconnecter ce compte
        </button>
      ) : (
        <div role="alert">
          <p className="erreur">Déconnecter « {compte.libelle} » ? L’accès sera effacé. Ses vidéos déjà chargées restent.</p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton danger" disabled={occupe} onClick={() => void deconnecter()}>
              Oui, déconnecter
            </button>
            <button type="button" className="bouton discret" onClick={() => setConfirmer(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Bientot({ nom }: { nom: string }) {
  return (
    <div className="compte-relie">
      <div className="compte-entete">
        <span className="compte-nom">{nom}</span>
        <span className="puce">Bientôt</span>
      </div>
      <p className="texte-doux">Se reliera ici dès que ton compte {nom} existera.</p>
    </div>
  );
}
