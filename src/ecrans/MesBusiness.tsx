import { useState } from 'react';
import type { ChoixBusiness } from '../App';
import type { Business } from '../donnees/business';
import { NOM_MAX } from '../donnees/business';
import { Feuille } from './Feuille';

type Message = { type: 'succes' | 'erreur'; texte: string };

/** « Mes business » : le tableau de tous les business, pour ouvrir, renommer, supprimer ou en créer un. */
export function MesBusiness({
  business,
  onEnsemble,
  onFermer,
}: {
  business: ChoixBusiness;
  onEnsemble: () => void;
  onFermer: () => void;
}) {
  const [nouveau, setNouveau] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const agir = async (action: () => Promise<void>, succes?: string): Promise<boolean> => {
    setMessage(null);
    setOccupe(true);
    try {
      await action();
      if (succes) setMessage({ type: 'succes', texte: succes });
      return true;
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Ça n’a pas marché. Réessaie.' });
      return false;
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Feuille titre="Mes business" onFermer={onFermer}>
      <p className="texte-doux">
        Chaque business a ses ventes, ses vidéos, ses voyants et ses comptes reliés. Appuie sur « Ouvrir » pour passer
        de l’un à l’autre.
      </p>
      {business.liste.length > 1 && (
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="bouton contour" onClick={onEnsemble}>
            Voir la vue d’ensemble
          </button>
        </div>
      )}

      <ul className="tableau-business" aria-label="Tes business">
        {business.liste.map((b) => (
          <LigneBusiness
            key={b.id}
            b={b}
            ouvert={b.id === business.actuel.id}
            seul={business.liste.length <= 1}
            occupe={occupe}
            onOuvrir={() => {
              business.choisir(b.id);
              onFermer();
            }}
            onRenommer={(nom) => agir(() => business.renommer(b.id, nom), 'Nom enregistré.')}
            onSupprimer={() => agir(() => business.supprimer(b.id), `« ${b.nom} » est supprimé.`)}
          />
        ))}
      </ul>

      <h3 className="titre-reglage">Nouveau business</h3>
      <label className="champ">
        <span>Son nom</span>
        <input
          id="nouveau-business"
          maxLength={NOM_MAX}
          placeholder="Par exemple : Guide detailing"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
        />
      </label>
      <p className="note">Il commence vide : relie sa boutique et ses comptes dans les réglages.</p>
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="bouton principal"
          disabled={occupe || !nouveau.trim()}
          onClick={() =>
            void agir(async () => {
              await business.creer(nouveau);
              setNouveau('');
              onFermer();
            })
          }
        >
          Créer et ouvrir ce business
        </button>
      </div>
      {message && (
        <p className={message.type} role="status">
          {message.texte}
        </p>
      )}
    </Feuille>
  );
}

function LigneBusiness({
  b,
  ouvert,
  seul,
  occupe,
  onOuvrir,
  onRenommer,
  onSupprimer,
}: {
  b: Business;
  ouvert: boolean;
  seul: boolean;
  occupe: boolean;
  onOuvrir: () => void;
  onRenommer: (nom: string) => Promise<boolean>;
  onSupprimer: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'voir' | 'renommer' | 'supprimer'>('voir');
  const [nom, setNom] = useState(b.nom);

  return (
    <li className={`ligne-business ${ouvert ? 'ouvert' : ''}`}>
      <div className="ligne-business-tete">
        <span className="ligne-business-nom">{b.nom}</span>
        {ouvert && <span className="puce puce-on">Ouvert</span>}
      </div>

      {mode === 'voir' && (
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          {!ouvert && (
            <button type="button" className="bouton principal" onClick={onOuvrir}>
              Ouvrir
            </button>
          )}
          <button
            type="button"
            className="bouton discret"
            onClick={() => {
              setNom(b.nom);
              setMode('renommer');
            }}
          >
            Renommer
          </button>
          <button type="button" className="bouton discret" onClick={() => setMode('supprimer')}>
            Supprimer
          </button>
        </div>
      )}

      {mode === 'renommer' && (
        <>
          <label className="champ">
            <span>Nouveau nom</span>
            <input maxLength={NOM_MAX} value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="bouton principal"
              disabled={occupe || !nom.trim() || nom.trim() === b.nom}
              onClick={() => void onRenommer(nom).then((ok) => ok && setMode('voir'))}
            >
              Enregistrer
            </button>
            <button type="button" className="bouton discret" onClick={() => setMode('voir')}>
              Annuler
            </button>
          </div>
        </>
      )}

      {mode === 'supprimer' &&
        (seul ? (
          <div role="alert">
            <p className="erreur">Il te faut au moins un business : crée-en un autre avant de supprimer celui-ci.</p>
            <button type="button" className="bouton discret" onClick={() => setMode('voir')}>
              D’accord
            </button>
          </div>
        ) : (
          <div role="alert">
            <p className="erreur">
              Supprimer « {b.nom} » ? Ses ventes, ses vidéos, ses voyants et ses comptes reliés seront effacés pour de
              bon. Ça ne peut pas être annulé.
            </p>
            <div className="pied" style={{ justifyContent: 'flex-start' }}>
              <button type="button" className="bouton danger" disabled={occupe} onClick={() => void onSupprimer()}>
                Oui, supprimer définitivement
              </button>
              <button type="button" className="bouton discret" onClick={() => setMode('voir')}>
                Annuler
              </button>
            </div>
          </div>
        ))}
    </li>
  );
}
