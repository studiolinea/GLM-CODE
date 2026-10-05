import Papa from 'papaparse';
import { adaptateurExemple } from './adaptateurs/exemple';
import { cleVente, type Adaptateur, type LigneIgnoree, type ResultatLecture, type Vente } from './modele';

/** Les plateformes que l'appli sait lire. On ajoutera ici celle de la boutique. */
export const ADAPTATEURS: Adaptateur[] = [adaptateurExemple];

/**
 * Lit le contenu d'un fichier de ventes (CSV, séparé par virgules, points-virgules ou
 * tabulations). Ne modifie rien : c'est à l'appelant de fusionner le résultat.
 */
export function lireFichierVentes(texte: string, adaptateurs: Adaptateur[] = ADAPTATEURS): ResultatLecture {
  const analyse = Papa.parse<Record<string, string>>(texte.replace(/^﻿/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (entete) => entete.trim(),
  });
  const entetes = analyse.meta.fields ?? [];
  if (entetes.length === 0) return { ok: false, erreur: 'Fichier vide ou illisible. Rien n’a été modifié.' };

  const adaptateur = adaptateurs.find((a) => a.reconnait(entetes));
  if (!adaptateur) {
    return {
      ok: false,
      erreur: 'Ce fichier ne ressemble pas à un export de ventes que l’appli sait lire. Rien n’a été modifié.',
    };
  }

  const parCle = new Map<string, Vente>();
  const lignesIgnorees: LigneIgnoree[] = [];
  analyse.data.forEach((ligne, i) => {
    const resultat = adaptateur.lireLigne(ligne);
    if (typeof resultat === 'string') lignesIgnorees.push({ ligne: i + 2, raison: resultat });
    else parCle.set(cleVente(resultat), resultat);
  });

  if (parCle.size === 0 && lignesIgnorees.length > 0) {
    return {
      ok: false,
      erreur: `Aucune vente lisible dans ce fichier (${lignesIgnorees.length} ligne(s) refusée(s)). Rien n’a été modifié.`,
    };
  }

  return {
    ok: true,
    plateforme: adaptateur.plateforme,
    nomPlateforme: adaptateur.nom,
    ventes: [...parCle.values()],
    lignesIgnorees,
  };
}

export interface ResultatFusion {
  ventes: Vente[];
  ajoutees: number;
  /** Ventes déjà connues dont une information a changé (par exemple, remboursée depuis). */
  misesAJour: number;
  inchangees: number;
}

/** Ajoute les nouvelles ventes aux ventes connues, sans doublon. Le fichier le plus récent fait foi. */
export function fusionnerVentes(existantes: Vente[], nouvelles: Vente[]): ResultatFusion {
  const parCle = new Map(existantes.map((v) => [cleVente(v), v]));
  let ajoutees = 0;
  let misesAJour = 0;
  let inchangees = 0;
  for (const v of nouvelles) {
    const avant = parCle.get(cleVente(v));
    if (!avant) ajoutees++;
    else if (JSON.stringify(avant) !== JSON.stringify(v)) misesAJour++;
    else inchangees++;
    parCle.set(cleVente(v), v);
  }
  const ventes = [...parCle.values()].sort((a, b) => a.instant.localeCompare(b.instant));
  return { ventes, ajoutees, misesAJour, inchangees };
}
