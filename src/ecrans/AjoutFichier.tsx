import { useState } from 'react';
import { fichierEssai } from '../donnees/exemple';
import { fr, nombre } from '../texte';
import { lireFichierVentes } from '../ventes/lire';
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
    `${nombre(bilan.ajoutees, 'vente ajoutée', 'ventes ajoutées')}, ${nombre(bilan.misesAJour, 'mise à jour', 'mises à jour')}, ${nombre(bilan.inchangees, 'déjà connue', 'déjà connues')}.`,
  ];
  if (bilan.exempleRetire) lignes.push('Les données d’exemple ont été retirées.');
  if (lignesIgnorees.length > 0) {
    lignes.push(`${nombre(lignesIgnorees.length, 'ligne refusée', 'lignes refusées')} :`);
    for (const l of lignesIgnorees.slice(0, 5)) lignes.push(`• ligne ${l.ligne} : ${l.raison}`);
  }
  return lignes;
}

/** « Fichier de ventes » : lire l'export de la boutique et l'ajouter aux ventes connues. */
export function AjoutFichier({
  maintenant,
  exemple,
  enLigne = false,
  onImporter,
  onFermer,
}: {
  maintenant: Date;
  exemple: boolean;
  /** Avec la base en ligne, la boutique Stripe se relie dans les réglages : pas besoin de fichier. */
  enLigne?: boolean;
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
      lignes: [...decrire(bilan, lecture.lignesIgnorees), 'Ce sont des ventes d’essai : tout reste marqué comme exemple.'],
    });
  };

  return (
    <Feuille titre="Fichier de ventes" onFermer={onFermer}>
      <p className="texte-doux">
        Télécharge l’export des ventes depuis ta boutique, puis choisis le fichier ici. Recharger le même fichier ne crée
        pas de doublon.
      </p>
      <p className="texte-doux">
        Pour l’instant, seul le format d’exemple est lu.
        {enLigne && ' Ta boutique Stripe, elle, se relie dans les réglages : pas besoin de fichier.'}
      </p>
      {/* Le champ reste dans la page (caché à l'œil) : on l'atteint aussi au clavier, avec Tab. */}
      <label className="bouton principal choix-fichier fichier-ventes">
        Choisir le fichier (.csv)
        <input
          id="fichier-ventes"
          className="cache"
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
        <div className={`${message.type} bilan-fichier`} role="status">
          {message.lignes.map((l, i) => (
            <p key={i} style={{ margin: '0 0 4px' }}>
              {fr(l)}
            </p>
          ))}
        </div>
      )}
      {exemple && (
        <>
          <hr className="separateur" />
          <p className="texte-doux">
            Pas encore de fichier ? Ajoute quelques ventes d’essai pour voir les chiffres et les alertes changer. Elles
            restent marquées comme exemple.
          </p>
        </>
      )}
      {exemple && (
        <div className="pied" style={{ justifyContent: 'flex-start' }}>
          <button type="button" className="bouton" onClick={essayer}>
            Essayer avec des ventes d’essai
          </button>
        </div>
      )}
    </Feuille>
  );
}
