import { useState, type ReactNode } from 'react';
import type { SourceBoutique } from '../donnees/comptesRelies';
import type { SynchroBoutique } from '../donnees/useSynchroBoutique';
import { quandParis } from '../temps';

interface FicheBoutique {
  source: SourceBoutique;
  nom: string;
  placeholder: string;
  aide: ReactNode;
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
      <Bientot nom="TikTok" />
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
            <div className="pied" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="bouton" disabled={boutique.enCours} onClick={() => void boutique.synchroniser()}>
                Synchroniser maintenant
              </button>
              <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
                Déconnecter la boutique
              </button>
            </div>
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
