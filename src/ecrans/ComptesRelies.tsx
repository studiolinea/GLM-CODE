import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatEuros } from '../argent';
import { resumeVentesTest } from '../calculs/ventesTest';
import {
  apportLibelle,
  MESSAGE_CONNEXION_EXPIREE,
  type CompteRelie,
  type MouvementBoutique,
  type SourceBoutique,
} from '../donnees/comptesRelies';
import type { MessageCompte, SynchroBoutique } from '../donnees/useSynchroBoutique';
import { quandParis } from '../temps';
import { fr, majuscule } from '../texte';
import { avecSouris } from './Feuille';
import { IconeChevron } from './Icones';

/** Les cartes vers lesquelles les réglages peuvent s'ouvrir directement. */
export type CarteCompte = 'boutique' | 'tiktok' | 'comptes';
export const ID_CARTES: Record<CarteCompte, string> = {
  boutique: 'carte-stripe',
  tiktok: 'carte-tiktok',
  comptes: 'titre-comptes-relies',
};

interface FicheBoutique {
  source: SourceBoutique;
  nom: string;
  /** Le nom de la plateforme, tel qu'il apparaît dans le libellé du compte relié (« Stripe (mode test) »). */
  plateforme: string;
  placeholder: string;
  aide: ReactNode;
  /** La boutique sait montrer ses derniers mouvements d'argent (frais, TVA). */
  verification?: boolean;
  /** Pas reliée, la carte est repliée sur une ligne (Kévin ne s'en sert pas). */
  repliable?: boolean;
}

const FICHES: FicheBoutique[] = [
  {
    source: 'stripe',
    nom: 'Boutique Stripe',
    plateforme: 'Stripe',
    placeholder: 'Colle ici ta clé limitée (rk_…)',
    aide: (
      <>
        Où la trouver : dans Stripe, « Développeurs », puis « Clés API », puis « Créer une clé limitée ». Nom :
        « Pilotage ». Mets « Lecture » pour « Charges » et pour « Balance », et « Aucune » pour tout le reste. Copie
        la clé, qui commence par « rk_ ». Elle ne peut que lire, rien modifier, et elle est chiffrée avant d’être
        enregistrée.
      </>
    ),
    verification: true,
  },
  {
    source: 'lemonsqueezy',
    nom: 'Boutique Lemon Squeezy',
    plateforme: 'Lemon Squeezy',
    placeholder: 'Colle ici ta clé d’accès',
    aide: (
      <>
        Où la trouver : dans Lemon Squeezy, « Settings », puis « API », puis le bouton « + ». Donne-lui le nom
        « Pilotage », puis copie la clé. Elle est chiffrée avant d’être enregistrée.
      </>
    ),
    repliable: true,
  },
];

/** « Mes comptes reliés » : chacun relie et déconnecte lui-même ses propres comptes. */
export function ComptesRelies({ boutique, onReconnecter }: { boutique: SynchroBoutique; onReconnecter?: () => void }) {
  const comptes = boutique.comptes;
  // Le message d'un compte s'affiche sur sa carte ; en haut, seulement ce qui ne concerne aucun compte en particulier.
  const surUneCarte = Object.values(boutique.erreursComptes).some(Boolean);
  const erreur = boutique.connexionExpiree ? null : boutique.erreur && !surUneCarte ? boutique.erreur : null;
  return (
    <section aria-labelledby="titre-comptes-relies">
      <h3 id="titre-comptes-relies" className="titre-reglage">
        Mes comptes reliés
      </h3>
      {comptes === null && !boutique.erreur && <p className="texte-doux">Lecture de tes comptes reliés…</p>}
      {boutique.connexionExpiree && (
        <div role="alert">
          <p className="erreur">{fr(MESSAGE_CONNEXION_EXPIREE)}</p>
          {onReconnecter && (
            <div className="pied pied-haut" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="bouton principal" onClick={onReconnecter}>
                Me reconnecter
              </button>
            </div>
          )}
        </div>
      )}
      {erreur && <p className="erreur">{fr(erreur)}</p>}
      {comptes === null && boutique.erreur && (
        <button type="button" className="bouton" onClick={() => void boutique.synchroniser()}>
          Réessayer
        </button>
      )}
      {comptes !== null && comptes.length > 0 && (
        <div className="pied pied-haut" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="bouton" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
            {boutique.enCours ? 'Actualisation…' : 'Actualiser maintenant'}
          </button>
        </div>
      )}
      {boutique.ignorees.length > 0 && (
        <div className="note alerte-note" role="status">
          <p>
            {boutique.ignorees.length} vente{boutique.ignorees.length > 1 ? 's' : ''} de ta boutique{' '}
            {boutique.ignorees.length > 1 ? 'ne sont pas comptées' : 'n’est pas comptée'} dans tes chiffres :
          </p>
          {boutique.ignorees.slice(0, 5).map((i) => (
            <p key={i.numero}>
              • {i.numero} : {fr(i.raison)}
            </p>
          ))}
        </div>
      )}
      {/* Tant que la liste n'est pas arrivée, on n'affiche rien : sinon tout paraîtrait « pas relié ». */}
      {comptes !== null && (
        <>
          {FICHES.map((fiche) => (
            <Boutique key={fiche.source} fiche={fiche} boutique={boutique} />
          ))}
          <CompteTikTok boutique={boutique} />
          <Bientot nom="Instagram" />
        </>
      )}
    </section>
  );
}

function Boutique({ fiche, boutique }: { fiche: FicheBoutique; boutique: SynchroBoutique }) {
  const relie = boutique.comptes?.find((c) => c.source === fiche.source);
  // La liaison (et son résultat) est gardée par l'appli : elle continue, et reste affichée, si la fenêtre est fermée.
  const liaison = boutique.liaisons[fiche.source];
  const [cle, setCle] = useState('');
  const [occupe, setOccupe] = useState(false);
  // Les messages de la carte elle-même : clé manquante, déconnexion.
  const [message, setMessage] = useState<MessageCompte | null>(null);
  const [confirmer, setConfirmer] = useState(false);
  const [deplie, setDeplie] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const ligneRepliee = useRef<HTMLButtonElement>(null);
  const revenirSurLaLigne = useRef(false);
  const enLiaison = liaison?.enCours ?? false;
  const affiche = message ?? liaison?.message ?? null;
  const erreurActualisation = boutique.connexionExpiree ? undefined : boutique.erreursComptes[fiche.source];
  const ventesTest = boutique.ventesTest[fiche.source];
  const resumeTest = ventesTest ? resumeVentesTest(ventesTest) : null;

  // Carte dépliée au clavier ou à la souris : le curseur va dans le champ de la clé.
  // Repliée avec « Annuler » : il revient sur la ligne repliée (le bouton « Annuler » a disparu).
  useEffect(() => {
    if (deplie && avecSouris()) champ.current?.focus();
    if (!deplie && revenirSurLaLigne.current) {
      revenirSurLaLigne.current = false;
      if (avecSouris()) ligneRepliee.current?.focus({ preventScroll: true });
    }
  }, [deplie]);

  // « Annuler » : la carte se replie, sans garder la clé ni les messages.
  const annuler = () => {
    revenirSurLaLigne.current = true;
    setCle('');
    setMessage(null);
    boutique.effacerLiaison(fiche.source);
    setDeplie(false);
  };

  const relier = async () => {
    setMessage(null);
    if (!cle.trim()) return setMessage({ type: 'erreur', texte: 'Colle d’abord ta clé d’accès.' });
    if (await boutique.relier(fiche.source, cle.trim())) setCle('');
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

  const apport = relie ? apportLibelle(relie.libelle, fiche.plateforme) : null;
  const etat = boutique.enCours
    ? 'actualisation…'
    : relie?.derniereSynchro
      ? `ventes à jour le ${quandParis(new Date(relie.derniereSynchro))}`
      : 'pas encore lue';

  // Pas reliée et rarement utilisée : une seule ligne, qui se déplie au toucher.
  if (fiche.repliable && !relie && !deplie && !affiche && !enLiaison) {
    return (
      <button
        ref={ligneRepliee}
        type="button"
        id={`carte-${fiche.source}`}
        className="compte-relie compte-replie"
        aria-expanded="false"
        onClick={() => setDeplie(true)}
      >
        <span className="compte-nom">{fiche.nom}</span>
        <span className="puce">Pas reliée</span>
        <span className="compte-deplier">
          Relier
          <IconeChevron taille={16} />
        </span>
      </button>
    );
  }

  return (
    <div className="compte-relie" id={`carte-${fiche.source}`}>
      <div className="compte-entete">
        <span className="compte-nom">{fiche.nom}</span>
        <span className={`puce ${relie ? 'puce-on' : ''}`}>{relie ? 'Reliée' : 'Pas reliée'}</span>
      </div>

      {relie ? (
        <>
          <p className="texte-doux">{majuscule(apport ? `${apport} · ${etat}` : etat)}</p>
          {/* L'erreur de cette actualisation, sinon la dernière notée par le serveur. */}
          {erreurActualisation ? (
            <p className="erreur">{fr(erreurActualisation)}</p>
          ) : (
            relie.derniereErreur && <p className="erreur">{fr(relie.derniereErreur)}</p>
          )}
          {resumeTest && <p className="note alerte-note">{fr(resumeTest)}</p>}
          {!confirmer ? (
            <>
              {fiche.verification && <Verification source={fiche.source} plateforme={fiche.plateforme} boutique={boutique} />}
              <div className="pied" style={{ justifyContent: 'flex-start' }}>
                <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
                  Déconnecter la boutique
                </button>
              </div>
            </>
          ) : (
            <div role="alert">
              <p className="erreur">Déconnecter la boutique ? Ta clé sera effacée. Tes ventes déjà chargées restent.</p>
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
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void relier();
          }}
        >
          <p className="texte-doux">Relie ta boutique : tes ventes arriveront toutes seules à chaque ouverture de l’appli.</p>
          <label className="champ">
            <span>Clé d’accès</span>
            <input
              ref={champ}
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
            <button type="submit" className="bouton principal" disabled={enLiaison}>
              {enLiaison ? 'Vérification…' : 'Relier'}
            </button>
            {fiche.repliable && (
              <button type="button" className="bouton discret" disabled={enLiaison} onClick={annuler}>
                Annuler
              </button>
            )}
          </div>
        </form>
      )}
      {affiche && (
        <p className={affiche.type} role="status">
          {fr(affiche.texte)}
        </p>
      )}
    </div>
  );
}

/** Noms en français des mouvements les plus courants ; le type exact donné par la plateforme reste dans le détail. */
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
  return Object.hasOwn(NOMS_TYPES, type) ? NOMS_TYPES[type]! : type;
}

/** Les descriptions anglaises connues de Stripe, en français. Les autres restent dans le détail, telles quelles. */
const DESCRIPTIONS: [RegExp, string][] = [
  [/^vat$/i, 'TVA'],
  [/^stripe processing fees$/i, 'frais de paiement Stripe'],
  [/^stripe payout$/i, 'virement Stripe'],
  [/^withheld sales tax$/i, 'TVA retenue'],
  [/^managed payments transaction fee/i, 'frais Managed Payments'],
];

function traduire(description: string | null): string | null {
  if (!description) return null;
  return DESCRIPTIONS.find(([motif]) => motif.test(description.trim()))?.[1] ?? null;
}

function somme(centimes: number | null, devise: string): string {
  if (centimes === null) return '—';
  if (devise === 'eur') return formatEuros(centimes);
  return `${(centimes / 100).toFixed(2).replace('.', ',')}\u00a0${devise.toUpperCase()}`;
}

/** Les codes bruts de la plateforme, en petit : ils servent à comprendre comment elle compte ses frais. */
function detailBrut(m: MouvementBoutique): string {
  const type = m.type || '—';
  const morceaux = [m.categorie && m.categorie !== m.type ? `${type} (${m.categorie})` : type, m.description ?? '—', m.origine ?? '—'];
  for (const f of m.detailFrais) morceaux.push(`frais ${f.type || '—'}${f.description ? ` « ${f.description} »` : ''}`);
  return morceaux.join(' · ');
}

/** Ce que la boutique a enregistré, mouvement par mouvement : sert à vérifier les frais et la TVA. */
function Verification({ source, plateforme, boutique }: { source: SourceBoutique; plateforme: string; boutique: SynchroBoutique }) {
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
        <button type="button" className="bouton" onClick={() => void lire()}>
          Vérifier les frais et la TVA
        </button>
      </div>
    );
  }
  return (
    <div className="verification">
      <p className="note">
        Ce que la boutique a enregistré : ses 25 derniers mouvements d’argent, du plus récent au plus ancien. Rien
        n’est gardé.
      </p>
      {enCours && <p className="texte-doux">Lecture…</p>}
      {erreur && <p className="erreur">{fr(erreur)}</p>}
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
                  dont {traduire(f.description) ?? nomType(f.type)} : {somme(f.montantCentimes, m.devise)}
                </div>
              ))}
              {traduire(m.description) && <div className="texte-doux">{traduire(m.description)}</div>}
              <div className="note detail-brut">
                Détail {plateforme} : {detailBrut(m)}
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
  const [message, setMessage] = useState<MessageCompte | null>(null);
  const affiche = message ?? boutique.messageTikTok;
  // Le serveur note aussi l'erreur sur chaque compte en panne : elle est déjà écrite sous ce compte, pas une deuxième fois.
  const erreurActualisation =
    boutique.connexionExpiree || relies.some((c) => c.derniereErreur === boutique.erreursComptes.tiktok)
      ? undefined
      : boutique.erreursComptes.tiktok;

  const relier = async () => {
    setMessage(null);
    boutique.effacerMessageTikTok();
    setOccupe(true);
    try {
      await boutique.relierTikTok(); // la page part sur TikTok
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Impossible d’ouvrir TikTok. Réessaie.' });
      setOccupe(false);
    }
  };

  return (
    <div className="compte-relie" id="carte-tiktok">
      <div className="compte-entete">
        <span className="compte-nom">TikTok</span>
        <span className={`puce ${relies.length > 0 ? 'puce-on' : ''}`}>
          {relies.length === 0 ? 'Pas relié' : relies.length === 1 ? 'Relié' : `${relies.length} comptes`}
        </span>
      </div>
      {relies.length === 0 ? (
        <p className="texte-doux">Relie ton compte : tes vidéos et leurs vues arriveront toutes seules, sans rien noter.</p>
      ) : (
        relies.map((c) => <CompteTikTokRelie key={c.identifiant} compte={c} boutique={boutique} onMessage={setMessage} />)
      )}
      {erreurActualisation && <p className="erreur">{fr(erreurActualisation)}</p>}
      <p className="note">
        TikTok te demandera ton accord. Pilotage lit seulement tes vidéos publiques et leurs vues : il ne publie rien.
      </p>
      {relies.length === 0 && (
        <p className="note">
          Pendant la phase de test, seuls les comptes ajoutés dans ton espace TikTok pour développeurs (liste « Target
          Users ») peuvent se relier.
        </p>
      )}
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
          {fr(affiche.texte)}
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
  onMessage: (m: MessageCompte) => void;
}) {
  const [confirmer, setConfirmer] = useState(false);
  const [occupe, setOccupe] = useState(false);

  const deconnecter = async () => {
    setOccupe(true);
    try {
      await boutique.deconnecter('tiktok', compte.identifiant);
      onMessage({ type: 'succes', texte: `« ${compte.libelle} » déconnecté. Ses vidéos déjà chargées restent.` });
    } catch (e) {
      onMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'La déconnexion a échoué. Réessaie.' });
      setOccupe(false);
    }
  };

  return (
    <div className="compte-reseau">
      <p className="texte-doux">
        « {compte.libelle} » ·{' '}
        {boutique.enCours
          ? 'actualisation…'
          : compte.derniereSynchro
            ? `vidéos à jour le ${quandParis(new Date(compte.derniereSynchro))}`
            : 'pas encore lu'}
      </p>
      {compte.derniereErreur && <p className="erreur">{fr(compte.derniereErreur)}</p>}
      {!confirmer ? (
        <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
          Déconnecter ce compte
        </button>
      ) : (
        <div role="alert">
          <p className="erreur">Déconnecter « {compte.libelle} » ? L’accès sera effacé. Ses vidéos déjà chargées restent.</p>
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
      <p className="texte-doux">Bientôt : tu pourras relier ton compte {nom} ici.</p>
    </div>
  );
}
