import { useState } from 'react';
import { fichierEssai } from '../donnees/exemple';
import { ADAPTATEURS, lireFichierVentes } from '../ventes/lire';
import type { LigneIgnoree, Vente } from '../ventes/modele';
import { Feuille } from './Feuille';

export interface BilanImport {
  ajoutees: number;
  misesAJour: number;
  inchangees: number;
  exempleRetire: boolean;
}

type Message = { type: 'succes' | 'erreur'; lignes: string[] };

function decrire(bilan: BilanImport, lignesIgnorees: LigneIgnoree[]): string[] {
  const lignes = [
    `${bilan.ajoutees} vente(s) ajoutée(s), ${bilan.misesAJour} mise(s) à jour, ${bilan.inchangees} déjà connue(s).`,
  ];
  if (bilan.exempleRetire) lignes.push('Les données d’exemple ont été retirées.');
  if (lignesIgnorees.length > 0) {
    lignes.push(`${lignesIgnorees.length} ligne(s) refusée(s) :`);
    for (const l of lignesIgnorees.slice(0, 5)) lignes.push(`• ligne ${l.ligne} : ${l.raison}`);
  }
  return lignes;
}

/** « Ajouter le fichier de ventes » : lire l'export de la boutique et l'ajouter aux ventes connues. */
export function AjoutFichier({
  maintenant,
  exemple,
  onImporter,
  onFermer,
}: {
  maintenant: Date;
  exemple: boolean;
  onImporter: (ventes: Vente[], couverture: string, essai: boolean) => BilanImport;
  onFermer: () => void;
}) {
  const [message, setMessage] = useState<Message | null>(null);

  const lireFichier = async (fichier: File) => {
    const lecture = lireFichierVentes(await fichier.text());
    if (!lecture.ok) return setMessage({ type: 'erreur', lignes: [lecture.erreur] });

    // Le fichier vient d'être téléchargé : sa date est celle de l'export.
    const date = fichier.lastModified ? new Date(Math.min(fichier.lastModified, maintenant.getTime())) : maintenant;
    const bilan = onImporter(lecture.ventes, date.toISOString(), false);
    setMessage({ type: 'succes', lignes: decrire(bilan, lecture.lignesIgnorees) });
  };

  const essayer = () => {
    const lecture = lireFichierVentes(fichierEssai(maintenant));
    if (!lecture.ok) return setMessage({ type: 'erreur', lignes: [lecture.erreur] });
    const bilan = onImporter(lecture.ventes, maintenant.toISOString(), true);
    setMessage({
      type: 'succes',
      lignes: [...decrire(bilan, lecture.lignesIgnorees), 'Ce sont des ventes d’essai : tout reste marqué comme exemple.'],
    });
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
          id="fichier-ventes"
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
        <div className={message.type} role="status">
          {message.lignes.map((l, i) => (
            <p key={i} style={{ margin: '0 0 4px' }}>
              {l}
            </p>
          ))}
        </div>
      )}
      {exemple && (
        <>
          <hr className="separateur" />
          <p className="texte-doux">
            Pas encore de fichier ? Ajoute quelques ventes d’essai pour voir les chiffres et les alertes changer. Elles
            restent marquées comme exemple.
          </p>
        </>
      )}
      <div className="pied">
        {exemple && (
          <button type="button" className="bouton" onClick={essayer}>
            Essayer avec des ventes d’essai
          </button>
        )}
        <button type="button" className="bouton principal" onClick={onFermer}>
          Fermer
        </button>
      </div>
    </Feuille>
  );
}
