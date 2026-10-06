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

/** `refusees` : les lignes du fichier qui n'ont pas été lues, à part (en orange) : ce n'est pas un succès. */
type Message = { type: 'succes' | 'erreur'; lignes: string[]; refusees?: string[] };

function decrire(bilan: BilanImport, lignesIgnorees: LigneIgnoree[]): Pick<Message, 'lignes' | 'refusees'> {
  const lignes = [
    `${nombre(bilan.ajoutees, 'vente ajoutée', 'ventes ajoutées')}, ${nombre(bilan.misesAJour, 'mise à jour', 'mises à jour')}, ${nombre(bilan.inchangees, 'déjà connue', 'déjà connues')}.`,
  ];
  if (bilan.exempleRetire) lignes.push('Les données d’exemple ont été retirées.');
  const refusees: string[] = [];
  if (lignesIgnorees.length > 0) {
    refusees.push(`${nombre(lignesIgnorees.length, 'ligne refusée', 'lignes refusées')} :`);
    for (const l of lignesIgnorees.slice(0, 5)) refusees.push(`• ligne ${l.ligne} : ${l.raison}`);
  }
  return { lignes, refusees };
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
    setMessage({ type: 'succes', ...decrire(bilan, lecture.lignesIgnorees) });
  };

  const essayer = () => {
    const lecture = lireFichierVentes(fichierEssai(maintenant));
    if (!lecture.ok) return setMessage({ type: 'erreur', lignes: [lecture.erreur] });
    const bilan = onImporter(lecture.ventes, maintenant.toISOString(), true);
    const { lignes, refusees } = decrire(bilan, lecture.lignesIgnorees);
    setMessage({ type: 'succes', lignes: [...lignes, 'Ce sont des ventes d’essai : tout reste marqué comme exemple.'], refusees });
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
        <div className="bilan-fichier" role="status">
          <div className={message.type}>
            {message.lignes.map((l, i) => (
              <p key={i} style={{ margin: '0 0 4px' }}>
                {fr(l)}
              </p>
            ))}
          </div>
          {message.refusees && message.refusees.length > 0 && (
            <div className="avertissement">
              {message.refusees.map((l, i) => (
                <p key={i} style={{ margin: '0 0 4px' }}>
                  {fr(l)}
                </p>
              ))}
            </div>
          )}
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
