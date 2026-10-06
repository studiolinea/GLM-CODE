import { useEffect, useRef, useState } from 'react';
import type { ChoixBusiness } from '../App';
import type { Business } from '../donnees/business';
import { NOM_MAX, premierBusinessARenommer } from '../donnees/business';
import { fr } from '../texte';
import { avecSouris, Feuille } from './Feuille';
import { demanderFocus, ID_SELECTEUR_BUSINESS } from './focus';

type Message = { type: 'succes' | 'erreur'; texte: string };
/** Où s'affiche le message d'une action : dans la ligne du business, en haut de la fenêtre, ou sous le champ de création. */
type Endroit = { ligne: string } | 'haut' | 'creation';
type MessagePlace = Message & { ou: Endroit };

const dansLigne = (m: MessagePlace | null, id: string) => (m && typeof m.ou === 'object' && m.ou.ligne === id ? m : null);

/** « Mes business » : le tableau de tous les business, pour ouvrir, renommer, supprimer ou en créer un. */
export function MesBusiness({
  business,
  exemple = false,
  onEnsemble,
  onFermer,
}: {
  business: ChoixBusiness;
  /** Vrai si le business ouvert montre les données d'exemple. */
  exemple?: boolean;
  /** Absent quand les chiffres du business ouvert ne sont pas là (sans réseau) : pas de vue d'ensemble. */
  onEnsemble?: () => void;
  onFermer: () => void;
}) {
  const [nouveau, setNouveau] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<MessagePlace | null>(null);
  const tableau = useRef<HTMLUListElement>(null);

  /** Lance une action ; son message (succès ou erreur) s'affiche à l'endroit donné, et s'efface à l'action suivante. */
  const agir = async (action: () => Promise<void>, ou: Endroit, succes?: { texte: string; ou?: Endroit }): Promise<boolean> => {
    setMessage(null);
    setOccupe(true);
    try {
      await action();
      if (succes) setMessage({ type: 'succes', texte: succes.texte, ou: succes.ou ?? ou });
      return true;
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Ça n’a pas marché. Réessaie.', ou });
      return false;
    } finally {
      setOccupe(false);
    }
  };

  const enHaut = message?.ou === 'haut' ? message : null;
  const sousCreation = message?.ou === 'creation' ? message : null;

  return (
    <Feuille titre="Mes business" onFermer={onFermer}>
      <p className="texte-doux">
        Chaque business a ses ventes, ses vidéos, ses voyants et ses comptes reliés.
        {business.liste.length > 1 && ' Appuie sur « Ouvrir » pour passer de l’un à l’autre.'}
      </p>
      {premierBusinessARenommer(business.liste, exemple) && (
        <p className="note alerte-note">
          C’est ton premier business&nbsp;: donne-lui le nom de ton vrai business (bouton «&nbsp;Renommer&nbsp;»).
        </p>
      )}
      {enHaut && (
        <p className={enHaut.type} role="status">
          {fr(enHaut.texte)}
        </p>
      )}
      {business.liste.length > 1 && onEnsemble && (
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="bouton contour" onClick={onEnsemble}>
            Voir la vue d’ensemble
          </button>
        </div>
      )}

      <ul ref={tableau} className="tableau-business" aria-label="Tes business">
        {business.liste.map((b) => (
          <LigneBusiness
            key={b.id}
            b={b}
            ouvert={b.id === business.actuel.id}
            // Sans réseau, seul un business déjà ouvert sur cet appareil a ses chiffres ici.
            sansCopie={business.horsLigne && !business.aUneCopie(b.id)}
            seul={business.liste.length <= 1}
            occupe={occupe}
            message={dansLigne(message, b.id)}
            onAction={() => setMessage(null)}
            onOuvrir={() => {
              demanderFocus(ID_SELECTEUR_BUSINESS);
              business.choisir(b.id);
              onFermer();
            }}
            onRenommer={(nom) => agir(() => business.renommer(b.id, nom), { ligne: b.id }, { texte: 'Nom enregistré.' })}
            // La ligne disparaît : le message s'affiche en haut de la fenêtre, et le curseur du clavier va au tableau.
            onSupprimer={async () => {
              const ok = await agir(() => business.supprimer(b.id), { ligne: b.id }, { texte: `« ${b.nom} » est supprimé.`, ou: 'haut' });
              if (ok && avecSouris()) tableau.current?.querySelector<HTMLButtonElement>('button')?.focus({ preventScroll: true });
              return ok;
            }}
          />
        ))}
      </ul>

      <h3 className="titre-reglage">Nouveau business</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (occupe || !nouveau.trim()) return;
          void agir(async () => {
            demanderFocus(ID_SELECTEUR_BUSINESS);
            try {
              await business.creer(nouveau);
            } catch (e) {
              demanderFocus(null);
              throw e;
            }
            setNouveau('');
            onFermer();
          }, 'creation');
        }}
      >
        <label className="champ">
          <span>Son nom</span>
          <input
            id="nouveau-business"
            maxLength={NOM_MAX}
            placeholder="Par exemple : Guide detailing"
            enterKeyHint="done"
            value={nouveau}
            onChange={(e) => setNouveau(e.target.value)}
          />
        </label>
        {sousCreation && (
          <p className={sousCreation.type} role="status">
            {fr(sousCreation.texte)}
          </p>
        )}
        <p className="note">Il commence vide : relie sa boutique et ses comptes dans les réglages.</p>
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="bouton principal" disabled={occupe || !nouveau.trim()}>
            Créer et ouvrir ce business
          </button>
        </div>
      </form>
    </Feuille>
  );
}

function LigneBusiness({
  b,
  ouvert,
  sansCopie,
  seul,
  occupe,
  message,
  onAction,
  onOuvrir,
  onRenommer,
  onSupprimer,
}: {
  b: Business;
  ouvert: boolean;
  sansCopie: boolean;
  seul: boolean;
  occupe: boolean;
  /** Le message de la dernière action sur cette ligne. */
  message: Message | null;
  /** Appelé à chaque bouton : le message de l'action précédente s'efface. */
  onAction: () => void;
  onOuvrir: () => void;
  onRenommer: (nom: string) => Promise<boolean>;
  onSupprimer: () => Promise<boolean>;
}) {
  const [mode, setMode] = useState<'voir' | 'renommer' | 'supprimer'>('voir');
  const [nom, setNom] = useState(b.nom);
  const champ = useRef<HTMLInputElement>(null);
  const inchange = occupe || !nom.trim() || nom.trim() === b.nom;
  const changerMode = (m: typeof mode) => {
    onAction();
    setMode(m);
  };

  // « Renommer » : avec une souris (Mac), le curseur va dans le champ, le nom déjà sélectionné. Sur téléphone, non.
  useEffect(() => {
    if (mode === 'renommer' && avecSouris()) champ.current?.select();
  }, [mode]);

  return (
    <li className={`ligne-business ${ouvert ? 'ouvert' : ''}`}>
      <div className="ligne-business-tete">
        <span className="ligne-business-nom">{b.nom}</span>
        {ouvert && <span className="puce puce-on">Ouvert</span>}
      </div>

      {mode === 'voir' && (
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          {!ouvert && (
            <button
              type="button"
              className="bouton contour"
              aria-disabled={sansCopie}
              aria-describedby={sansCopie ? `sans-copie-${b.id}` : undefined}
              onClick={() => {
                if (sansCopie) return;
                onAction();
                onOuvrir();
              }}
            >
              Ouvrir
            </button>
          )}
          <button
            type="button"
            className="bouton"
            onClick={() => {
              setNom(b.nom);
              changerMode('renommer');
            }}
          >
            Renommer
          </button>
          {/* Le dernier business ne se supprime pas : pas de bouton. */}
          {!seul && (
            <button type="button" className="bouton" onClick={() => changerMode('supprimer')}>
              Supprimer
            </button>
          )}
        </div>
      )}

      {mode === 'voir' && !ouvert && sansCopie && (
        <p id={`sans-copie-${b.id}`} className="note">
          Pas encore ouvert sur cet appareil&nbsp;: il s’ouvrira quand le réseau reviendra.
        </p>
      )}

      {mode === 'renommer' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!inchange) void onRenommer(nom).then((ok) => ok && setMode('voir'));
          }}
        >
          <label className="champ">
            <span>Nouveau nom</span>
            <input ref={champ} maxLength={NOM_MAX} enterKeyHint="done" value={nom} onChange={(e) => setNom(e.target.value)} />
          </label>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="submit" className="bouton principal" disabled={inchange}>
              Enregistrer
            </button>
            <button type="button" className="bouton discret" onClick={() => changerMode('voir')}>
              Annuler
            </button>
          </div>
        </form>
      )}

      {mode === 'supprimer' && !seul && (
        <div role="alert">
          <p className="erreur">
            Supprimer « {b.nom} » ? Ses ventes, ses vidéos, ses voyants et ses comptes reliés seront effacés pour de bon.
            Ça ne peut pas être annulé.
          </p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="bouton danger" disabled={occupe} onClick={() => void onSupprimer()}>
              Oui, supprimer définitivement
            </button>
            <button type="button" className="bouton discret" onClick={() => changerMode('voir')}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={message.type} role="status">
          {fr(message.texte)}
        </p>
      )}
    </li>
  );
}
