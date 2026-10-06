import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatEuros } from '../argent';
import { calculerEnsemble, type DonneesBusiness } from '../calculs/ensemble';
import { PERIODES, type Periode } from '../calculs/resume';
import { Feuille } from './Feuille';

const COURTS: Record<Periode, string> = { '7j': '7 J', '1m': '1 M', '3m': '3 M' };

/** La vue d'ensemble : le total de tous les business, puis le détail de chacun. */
export function VueEnsemble({
  charger,
  actuelId,
  maintenant,
  onOuvrir,
  onFermer,
}: {
  charger: () => Promise<DonneesBusiness[]>;
  actuelId: string;
  maintenant: Date;
  onOuvrir: (id: string) => void;
  onFermer: () => void;
}) {
  const [donnees, setDonnees] = useState<DonneesBusiness[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [periode, setPeriode] = useState<Periode>('7j');

  const lire = useCallback(async () => {
    setErreur(null);
    try {
      setDonnees(await charger());
    } catch (e) {
      setErreur(e instanceof Error ? e.message : 'Impossible de lire tes business. Réessaie.');
    }
  }, [charger]);

  useEffect(() => {
    void lire();
  }, [lire]);

  const ensemble = useMemo(() => (donnees ? calculerEnsemble(donnees, periode, maintenant) : null), [donnees, periode, maintenant]);
  const euros = (centimes: number | null) => (centimes === null ? '—' : formatEuros(centimes));

  return (
    <Feuille titre="Vue d’ensemble" onFermer={onFermer}>
      <p className="texte-doux">Tous tes business additionnés, puis le détail de chacun.</p>
      <div className="boite" role="group" aria-label="Période">
        {(Object.keys(PERIODES) as Periode[]).map((p) => (
          <button
            key={p}
            type="button"
            className="rapport"
            aria-pressed={p === periode}
            aria-label={PERIODES[p].libelle}
            onClick={() => setPeriode(p)}
          >
            {COURTS[p]}
          </button>
        ))}
      </div>

      {erreur && (
        <>
          <p className="erreur">{erreur}</p>
          <button type="button" className="bouton" onClick={() => void lire()}>
            Réessayer
          </button>
        </>
      )}
      {!ensemble && !erreur && <p className="texte-doux">Lecture de tes business…</p>}

      {ensemble && (
        <>
          <section className="total-ensemble" aria-label="Total de tous tes business">
            <div className="etiquette">Total · {PERIODES[periode].libelle}</div>
            <div className="chiffres-ensemble">
              <Chiffre nom="Ventes" valeur={euros(ensemble.total.ventesCentimes)} />
              <Chiffre nom="Commandes" valeur={String(ensemble.total.commandes)} />
              <Chiffre nom="Gains réels" valeur={euros(ensemble.total.gainsCentimes)} gains />
              <Chiffre nom="Vidéos" valeur={String(ensemble.total.videos)} />
            </div>
            {ensemble.total.businessSansGains.length > 0 && (
              <p className="note alerte-note">
                Gains inconnus pour {ensemble.total.businessSansGains.map((n) => `« ${n} »`).join(', ')} : des frais ne
                sont pas fournis par la boutique, donc pas de total deviné.
              </p>
            )}
            {ensemble.total.tvaCentimes !== null && (
              <p className="note">
                TVA retenue par les boutiques : {formatEuros(ensemble.total.tvaCentimes)}, pas comptée dans les ventes.
              </p>
            )}
            {ensemble.total.remboursementsCentimes > 0 && (
              <p className="note">Remboursé : {formatEuros(ensemble.total.remboursementsCentimes)}.</p>
            )}
          </section>

          <ul className="tableau-business" aria-label="Chaque business">
            {ensemble.lignes.map((l) => (
              <li key={l.id} className={`ligne-business ${l.id === actuelId ? 'ouvert' : ''}`}>
                <div className="ligne-business-tete">
                  <span className="ligne-business-nom">{l.nom}</span>
                  {l.id === actuelId && <span className="puce puce-on">Ouvert</span>}
                </div>
                {l.vide ? (
                  <p className="texte-doux">Pas encore de données : relie sa boutique et ses comptes.</p>
                ) : (
                  <div className="chiffres-ensemble">
                    <Chiffre nom="Ventes" valeur={euros(l.resume.ventesCentimes)} />
                    <Chiffre nom="Commandes" valeur={String(l.resume.commandes)} />
                    <Chiffre nom="Gains réels" valeur={euros(l.resume.gainsCentimes)} gains />
                    <Chiffre nom="Vidéos" valeur={String(l.videos)} />
                  </div>
                )}
                {l.id !== actuelId && (
                  <div className="pied" style={{ justifyContent: 'flex-start' }}>
                    <button type="button" className="bouton" onClick={() => onOuvrir(l.id)}>
                      Ouvrir
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <p className="note">Gains = ventes moins commissions et frais, avant impôts et cotisations.</p>
        </>
      )}
    </Feuille>
  );
}

function Chiffre({ nom, valeur, gains = false }: { nom: string; valeur: string; gains?: boolean }) {
  return (
    <div className={`lecture ${gains ? 'gains' : ''}`}>
      <span className="etiquette">{nom}</span>
      <b>{valeur}</b>
    </div>
  );
}
