import { MS_HEURE } from '../temps';
import type { Vente } from '../ventes/modele';

/** Durée pendant laquelle on regarde les ventes après une vidéo. */
export const FENETRE_VIDEO_MS = 48 * MS_HEURE;

/** Ventes non remboursées faites à partir de `debut` (inclus) et avant `fin` (exclu). */
export function ventesEntre(ventes: Vente[], debut: Date, fin: Date): Vente[] {
  const d = debut.getTime();
  const f = fin.getTime();
  return ventes.filter((v) => {
    const t = Date.parse(v.instant);
    return !v.rembourse && t >= d && t < f;
  });
}
