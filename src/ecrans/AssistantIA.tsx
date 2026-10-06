import { useEffect, useRef, useState } from 'react';
import type { Action } from '../alertes/alertes';
import { PERIODES, type Periode } from '../calculs/resume';
import { analyserAvecIA, type QuestionAssistant, type ReponseAssistant } from '../donnees/assistant';
import { appelerServeur } from '../donnees/comptesRelies';
import { preparationFaite, type EtapePreparation } from '../donnees/preparation';
import { useVeille } from '../donnees/useVeille';
import type { EtatAlerte } from '../modele';
import { quandParis } from '../temps';

const QUESTIONS: Record<QuestionAssistant, string> = { preparation: 'Préparer mon lancement', priorites: 'Que prioriser ?', ventes: 'Lire mes ventes', videos: 'Lire mon rythme', frais: 'Comprendre mes frais' };
interface Disponibilite { disponible: boolean; mode: 'cloudflare-gratuit' | 'groq-gratuit'; raison: string }

export function AssistantIA({ businessId, periode, exemple, etatsPreparation, onPreparation, onAction }: { businessId?: string; periode: Periode; exemple: boolean; etatsPreparation: Record<string, EtatAlerte>; onPreparation: (etape: EtapePreparation, fait: boolean) => void; onAction: (action: Action) => void }) {
  const [historique, setHistorique] = useState<{ question: QuestionAssistant; periode: Periode; reponse: ReponseAssistant }[]>([]);
  const [disponibilite, setDisponibilite] = useState<Disponibilite | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [erreur, setErreur] = useState('');
  const generation = useRef(0);
  const veille = useVeille(businessId, exemple);
  useEffect(() => {
    generation.current++;
    const courant = generation.current;
    setHistorique([]); setErreur(''); setOccupe(false); setDisponibilite(null);
    if (businessId && !exemple) void appelerServeur<Disponibilite>('/api/assistant/etat').then((etat) => { if (generation.current === courant) setDisponibilite(etat); }).catch(() => { if (generation.current === courant) setDisponibilite({ disponible: false, mode: 'cloudflare-gratuit', raison: 'Impossible de vérifier la disponibilité de l’IA gratuite.' }); });
    return () => { generation.current++; };
  }, [businessId, exemple]);
  const demander = async (question: QuestionAssistant) => {
    if (!businessId || exemple || occupe || !disponibilite?.disponible) return;
    const courant = generation.current;
    setOccupe(true); setErreur('');
    try {
      const reponse = await analyserAvecIA(businessId, periode, question);
      if (generation.current === courant) setHistorique((avant) => [...avant.slice(-3), { question, periode, reponse }]);
    } catch (e) {
      if (generation.current === courant) setErreur(e instanceof Error ? e.message : 'L’IA gratuite est indisponible.');
    } finally { if (generation.current === courant) setOccupe(false); }
  };
  const ouvrirEtape = (etape: EtapePreparation) => onAction({ libelle: 'Ouvrir les réglages', cible: 'comptes', ...(etape === 'boutique' || etape === 'paiement' ? { compte: 'boutique' as const } : etape === 'publications' ? { compte: 'tiktok' as const } : {}) });
  const plan = (actions: ReponseAssistant['actions']) => actions && actions.length > 0 && <div className="assistant-plan"><h3>Plan proposé</h3><ul>{actions.map((action) => <li key={action.id}><p>{action.raison}</p><div className="assistant-questions"><button className="bouton contour" onClick={() => ouvrirEtape(action.id)}>Ouvrir les réglages</button><button className="bouton discret" onClick={() => onPreparation(action.id, !preparationFaite(etatsPreparation, action.id))}>{preparationFaite(etatsPreparation, action.id) ? 'Fait · À revoir' : 'Marquer fait'}</button></div></li>)}</ul></div>;
  return <section className="lecture-periode assistant-ia" aria-labelledby="titre-assistant">
    <div className="titre-section"><h2 id="titre-assistant">Assistant IA</h2></div>
    <p className="texte-doux">Analyse à distance et veille de ton business, même lorsque ton Mac est éteint. Budget : 0 €. Aucun paiement ni publication automatique.</p>
    {exemple ? <p className="note">Commence avec un business vide pour préparer ton lancement. Les données d’exemple ne sont jamais envoyées à l’IA.</p> : !businessId ? <p className="note">La veille à distance nécessite un compte en ligne. La lecture locale reste disponible sur cet appareil.</p> : <>
      <p className="note">{disponibilite ? disponibilite.disponible ? `IA gratuite ${disponibilite.mode === 'groq-gratuit' ? 'Groq' : 'Cloudflare'} disponible, dans les limites du quota.` : disponibilite.raison : 'Vérification de l’IA gratuite…'}</p>
      <p className="note">Les ventes, frais et le rythme agrégés de ce business sont transmis à {disponibilite?.mode === 'groq-gratuit' ? 'Groq' : 'Cloudflare'}. Période à la demande : {PERIODES[periode].libelle}.</p>
      <div className="assistant-questions">{(Object.keys(QUESTIONS) as QuestionAssistant[]).map((question) => <button key={question} className="bouton contour" disabled={occupe || !disponibilite?.disponible} onClick={() => void demander(question)}>{QUESTIONS[question]}</button>)}</div>
      <div className="assistant-veille"><h3>Veille à distance</h3><label className="assistant-auto"><input type="checkbox" checked={veille.etat?.active ?? false} disabled={veille.occupe || (!veille.etat?.active && !disponibilite?.disponible)} onChange={(e) => void veille.activer(e.target.checked)} /><span>Activer les contrôles périodiques dans le cloud</span></label>
      <p className="note">En l’activant, tu autorises la lecture des comptes reliés et l’analyse des agrégats sur {disponibilite?.mode === 'groq-gratuit' ? 'Groq' : 'Cloudflare'}. Contrôles selon la file et les quotas. IA seulement quand les données changent : au maximum 4 analyses par jour pour ce business et 40 analyses par jour pour toute l’application, jours en UTC, sous réserve du quota gratuit du fournisseur. Les résultats apparaissent ici ; aucun message extérieur.</p>
      <button className="bouton discret" disabled={veille.occupe} onClick={() => void veille.lire()}>Lire le dernier résultat</button>
      {veille.etat && <><p className="note">Dernier passage : {veille.etat.dernier_scan ? quandParis(new Date(veille.etat.dernier_scan)) : 'pas encore passé'}. Analyses : {veille.etat.analyses_jour}/4{veille.etat.jour_quota ? ` le ${veille.etat.jour_quota}` : ''}.</p>{veille.etat.texte && <article className="assistant-reponse"><h3>Dernière analyse de veille · 7 jours</h3><p className="note">{veille.etat.derniere_analyse ? quandParis(new Date(veille.etat.derniere_analyse)) : 'Date non fournie'}</p><p className="assistant-texte">{veille.etat.texte}</p>{plan(veille.etat.actions)}</article>}{veille.etat.derniere_erreur && <p className="erreur" role="status">{veille.etat.derniere_erreur}</p>}</>}
      {veille.erreur && <p className="erreur" role="alert">{veille.erreur}</p>}</div>
    </>}
    <div role="status">{occupe && <p className="texte-doux">Analyse en cours…</p>}</div>
    {erreur && <p className="erreur" role="alert">{erreur} La lecture locale des chiffres reste disponible.</p>}
    <div className="assistant-historique" aria-live="polite">{historique.map((tour, i) => <article key={i} className="assistant-reponse"><h3>{QUESTIONS[tour.question]} · {PERIODES[tour.periode].libelle}</h3><p className="note">{quandParis(new Date(tour.reponse.genereLe))} · modèle : {tour.reponse.modele}</p><p className="assistant-texte">{tour.reponse.texte}</p>{plan(tour.reponse.actions)}{tour.reponse.avertissement && <p className="note">{tour.reponse.avertissement}</p>}<p className="note">Conseils à vérifier avec les chiffres. Historique temporaire effacé au changement de business.</p></article>)}</div>
  </section>;
}
