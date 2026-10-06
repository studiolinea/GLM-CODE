import { useState } from 'react';
import type { ChoixBusiness } from '../App';
import { NOM_MAX } from '../donnees/business';
import { Feuille } from './Feuille';

/** « Mes business » : passer de l'un à l'autre, renommer celui ouvert, en créer un nouveau. */
export function MesBusiness({ business, onFermer }: { business: ChoixBusiness; onFermer: () => void }) {
  const [nom, setNom] = useState(business.actuel.nom);
  const [nouveau, setNouveau] = useState('');
  const [occupe, setOccupe] = useState(false);
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);

  const agir = async (action: () => Promise<void>, succes: string) => {
    setMessage(null);
    setOccupe(true);
    try {
      await action();
      setMessage({ type: 'succes', texte: succes });
    } catch (e) {
      setMessage({ type: 'erreur', texte: e instanceof Error ? e.message : 'Ça n’a pas marché. Réessaie.' });
    } finally {
      setOccupe(false);
    }
  };

  return (
    <Feuille titre="Mes business" onFermer={onFermer}>
      <p className="texte-doux">Chaque business a ses ventes, ses vidéos, ses voyants et ses comptes reliés.</p>
      <ul className="liste-business">
        {business.liste.map((b) => (
          <li key={b.id}>
            <button
              type="button"
              className={`bouton large ${b.id === business.actuel.id ? 'principal' : ''}`}
              aria-current={b.id === business.actuel.id ? 'true' : undefined}
              onClick={() => {
                if (b.id !== business.actuel.id) business.choisir(b.id);
                onFermer();
              }}
            >
              {b.nom}
            </button>
          </li>
        ))}
      </ul>

      <hr className="separateur" />
      <label className="champ">
        <span>Nom du business ouvert</span>
        <input id="nom-business" maxLength={NOM_MAX} value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="bouton"
          disabled={occupe || nom.trim() === business.actuel.nom}
          onClick={() => void agir(() => business.renommer(business.actuel.id, nom), 'Nom enregistré.')}
        >
          Renommer
        </button>
      </div>

      <hr className="separateur" />
      <label className="champ">
        <span>Nouveau business</span>
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
            }, 'Business créé.')
          }
        >
          Créer ce business
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
