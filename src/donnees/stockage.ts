// Enregistrement sur l'appareil (étapes 3 et 4). L'étape 5 remplacera ce fichier par la
// base en ligne, pour avoir les mêmes données sur le Mac et le téléphone.

import type { Donnees } from '../modele';
import { donneesValides } from './actions';
import { donneesExemple } from './exemple';

const CLE = 'pilotage:donnees:v1';

export function chargerDonnees(maintenant: Date): Donnees {
  try {
    const texte = localStorage.getItem(CLE);
    const donnees = texte ? donneesValides(JSON.parse(texte)) : null;
    if (donnees) return donnees;
  } catch {
    // Stockage indisponible ou abîmé : on repart de l'exemple.
  }
  return donneesExemple(maintenant);
}

export function enregistrerDonnees(donnees: Donnees): boolean {
  try {
    localStorage.setItem(CLE, JSON.stringify(donnees));
    return true;
  } catch {
    return false;
  }
}
