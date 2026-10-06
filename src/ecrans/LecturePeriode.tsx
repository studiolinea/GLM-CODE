import type { Action } from '../alertes/alertes';
import { ETAPES_PREPARATION, preparationFaite, type EtapePreparation } from '../donnees/preparation';
import type { EtatAlerte } from '../modele';
import type { LectureLocale } from '../calculs/analyse';

export function LecturePeriode({ lecture, exemple, preparation, sources, objectif, etatsPreparation, onPreparation, onAction }: { etatsPreparation: Record<string, EtatAlerte>; onPreparation: (etape: EtapePreparation, fait: boolean) => void; preparation: boolean; sources: { boutique: boolean; videos: boolean } | null; objectif: number; lecture: LectureLocale; exemple: boolean; onAction: (action: Action) => void }) {
  return (
    <section className="lecture-periode" aria-labelledby="titre-lecture">
      <div className="titre-section"><h2 id="titre-lecture">Lecture de la période</h2></div>
      <p className="lecture-origine">Analyse locale{exemple ? ' · données d’exemple' : ''}</p>
      <p className="note">{lecture.periode}</p>
      {preparation && <div className="preparation-business"><h3>Préparer ton lancement</h3><ol>{ETAPES_PREPARATION.map((etape) => {
        const fait = preparationFaite(etatsPreparation, etape);
        const nom = { boutique: 'Boutique', paiement: 'Paiement test', publications: 'Publications', rythme: 'Rythme' }[etape];
        const description = {
          boutique: sources === null ? 'État des comptes en cours de lecture.' : sources.boutique ? 'Boutique reliée.' : 'Boutique à préparer et à relier.',
          paiement: 'Vérifie le prix, la TVA et les frais dans la boutique. Les ventes test restent séparées des vrais résultats.',
          publications: sources === null ? 'État des comptes en cours de lecture.' : sources.videos ? 'Compte de publication relié.' : 'TikTok à relier ; Instagram disponible à la main en secours.',
          rythme: `${objectif > 0 ? `Objectif réglé à ${objectif} vidéos par semaine` : 'Aucun objectif de publication réglé'}. Ajuste-le à ce que tu peux tenir.`,
        }[etape];
        return <li key={etape}><div className="preparation-etape"><span><strong>{nom}</strong> · {fait ? 'Fait' : 'À préparer'}</span><button className="bouton discret" aria-label={`${nom} : ${fait ? 'marquer à revoir' : 'marquer fait'}`} onClick={() => onPreparation(etape, !fait)}>{fait ? 'À revoir' : 'Fait'}</button></div><p className="note">{description}</p></li>;
      })}</ol><button className="bouton discret" onClick={() => onAction({ libelle: 'Préparer mes réglages', cible: 'comptes' })}>Préparer mes réglages</button><p className="note">Ces étapes ne sont pas marquées comme faites automatiquement : une liaison ne prouve pas que ta boutique est prête à vendre.</p></div>}
      <ul className="lecture-constats">
        {lecture.constats.map((constat) => <li key={constat.titre}><h3>{constat.titre}</h3><p className="dapres">D’après : {constat.preuve}</p></li>)}
      </ul>
      <div className="lecture-prochaine"><h3>Prochaine étape</h3><p>{lecture.prochaine.texte}</p>{lecture.prochaine.action && <button className="bouton contour" onClick={() => onAction(lecture.prochaine.action!)}>{lecture.prochaine.action.libelle}</button>}</div>
      <p className="note">Lecture des chiffres enregistrés, sans appel à une IA distante. Aucun revenu prévu.</p>
    </section>
  );
}
