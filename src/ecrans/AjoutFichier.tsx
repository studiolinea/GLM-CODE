import { useState } from 'react';
import { fichierEssai } from '../donnees/exemple';
import { dateParis } from '../temps';
import { ADAPTATEURS, lireFichierVentes } from '../ventes/lire';
import type { Vente } from '../ventes/modele';
import { Feuille, telecharger } from './Feuille';

export interface BilanImport {
  ajoutees: number;
  misesAJour: number;
  inchangees: number;
  exempleRetire: boolean;
}

/** « Ajouter le fichier de ventes » : lire l'export de la boutique et l'ajouter aux ventes connues. */
export function AjoutFichier({
  maintenant,
  onImporter,
  onFermer,
}: {
  maintenant: Date;
  onImporter: (ventes: Vente[], couverture: string) => BilanImport;
  onFermer: () => void;
}) {
  const [message, setMessage] = useState<{ type: 'succes' | 'erreur'; lignes: string[] } | null>(null);

  const lireFichier = async (fichier: File) => {
    const lecture = lireFichierVentes(await fichier.text());
    if (!lecture.ok) return setMessage({ type: 'erreur', lignes: [lecture.erreur] });

    // Le fichier vient d'être téléchargé : sa date est celle de l'export.
    const date = fichier.lastModified ? new Date(Math.min(fichier.lastModified, maintenant.getTime())) : maintenant;
    const bilan = onImporter(lecture.ventes, date.toISOString());
    const lignes = [
      `${bilan.ajoutees} vente(s) ajoutée(s), ${bilan.misesAJour} mise(s) à jour, ${bilan.inchangees} déjà connue(s).`,
    ];
    if (bilan.exempleRetire) lignes.push('Les données d’exemple ont été retirées.');
    if (lecture.lignesIgnorees.length > 0) {
      lignes.push(`${lecture.lignesIgnorees.length} ligne(s) refusée(s) :`);
      for (const l of lecture.lignesIgnorees.slice(0, 5)) lignes.push(`• ligne ${l.ligne} : ${l.raison}`);
    }
    setMessage({ type: 'succes', lignes });
  };

  return (
    <Feuille titre="Ajouter le fichier de ventes" onFermer={onFermer}>
      <p className="texte-doux">
        Télécharge l’export des ventes depuis ta boutique, puis choisis le fichier ici. Recharger le même fichier ne crée
        pas de doublon.
      </p>
      <p className="texte-doux">
        Formats lus pour l’instant : {ADAPTATEURS.map((a) => a.nom).join(', ')}. Celui de ta boutique sera ajouté quand
        on l’aura choisie.
      </p>
      <label className="champ">
        <span>Fichier (.csv)</span>
        <input
          type="file"
          accept=".csv,text/csv,text/plain"
          onChange={(e) => {
            const fichier = e.target.files?.[0];
            if (fichier) void lireFichier(fichier);
            e.target.value = '';
          }}
        />
      </label>
      {message && (
        <div className={message.type}>
          {message.lignes.map((l, i) => (
            <p key={i} style={{ margin: '0 0 4px' }}>
              {l}
            </p>
          ))}
        </div>
      )}
      <hr className="separateur" />
      <p className="texte-doux">Pour essayer : télécharge un petit fichier d’essai, puis choisis-le juste au-dessus.</p>
      <div className="pied">
        <button
          type="button"
          className="bouton"
          onClick={() => telecharger(`ventes-essai-${dateParis(maintenant)}.csv`, fichierEssai(maintenant), 'text/csv')}
        >
          Télécharger un fichier d’essai
        </button>
        <button type="button" className="bouton principal" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </Feuille>
  );
}
