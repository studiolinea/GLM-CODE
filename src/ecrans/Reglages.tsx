import { useState } from 'react';
import { lireSauvegarde, versSauvegarde } from '../donnees/actions';
import type { Donnees } from '../modele';
import { dateParis } from '../temps';
import { Feuille, telecharger } from './Feuille';

export function Reglages({
  donnees,
  maintenant,
  onObjectif,
  onRestaurer,
  onRemettreExemple,
  onFermer,
}: {
  donnees: Donnees;
  maintenant: Date;
  onObjectif: (objectifParJour: number) => void;
  onRestaurer: (donnees: Donnees) => void;
  onRemettreExemple: () => void;
  onFermer: () => void;
}) {
  const [objectif, setObjectif] = useState(String(donnees.reglages.objectifParJour));
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; texte: string } | null>(null);
  const [confirmer, setConfirmer] = useState(false);

  const changerObjectif = (texte: string) => {
    setObjectif(texte);
    const n = Number(texte);
    if (texte.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= 20) onObjectif(n);
  };

  const restaurer = async (fichier: File) => {
    const resultat = lireSauvegarde(await fichier.text());
    if (typeof resultat === 'string') return setMessage({ type: 'erreur', texte: resultat });
    onRestaurer(resultat);
    setObjectif(String(resultat.reglages.objectifParJour));
    setMessage({ type: 'succes', texte: 'Sauvegarde restaurée.' });
  };

  return (
    <Feuille titre="Réglages" onFermer={onFermer}>
      <label className="champ">
        <span>Objectif : combien de vidéos par jour ? (0 = pas de rappel)</span>
        <input
          id="objectif-par-jour"
          type="number"
          inputMode="numeric"
          min={0}
          max={20}
          value={objectif}
          onChange={(e) => changerObjectif(e.target.value)}
        />
      </label>

      <hr className="separateur" />
      <p className="texte-doux">
        Tes données sont gardées sur cet appareil. La sauvegarde en fait une copie dans un fichier, au cas où.
      </p>
      {message && <p className={message.type}>{message.texte}</p>}
      <div className="pied" style={{ justifyContent: 'flex-start' }}>
        <button
          type="button"
          className="bouton"
          onClick={() =>
            telecharger(`pilotage-sauvegarde-${dateParis(maintenant)}.json`, versSauvegarde(donnees), 'application/json')
          }
        >
          Sauvegarder
        </button>
        <label className="bouton" style={{ display: 'inline-block' }}>
          Restaurer
          <input
            id="restaurer-sauvegarde"
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const fichier = e.target.files?.[0];
              if (fichier) void restaurer(fichier);
              e.target.value = '';
            }}
          />
        </label>
        {!donnees.exemple && !confirmer && (
          <button type="button" className="bouton discret" onClick={() => setConfirmer(true)}>
            Revoir l’exemple
          </button>
        )}
      </div>

      {confirmer && (
        <div role="alert" style={{ marginTop: 14 }}>
          <p className="erreur">
            Tes données seront remplacées par l’exemple. Fais une sauvegarde avant si tu veux les garder.
          </p>
          <div className="pied" style={{ justifyContent: 'flex-start' }}>
            <button
              type="button"
              className="bouton danger"
              onClick={() => {
                onRemettreExemple();
                setConfirmer(false);
                setMessage({ type: 'succes', texte: 'Les données d’exemple sont de retour.' });
              }}
            >
              Remplacer par l’exemple
            </button>
            <button type="button" className="bouton discret" onClick={() => setConfirmer(false)}>
              Annuler
            </button>
          </div>
        </div>
      )}

      <div className="pied">
        <button type="button" className="bouton principal" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </Feuille>
  );
}
