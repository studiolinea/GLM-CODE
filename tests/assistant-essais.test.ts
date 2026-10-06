import { describe, expect, it, vi } from 'vitest';
import { analyserBusiness } from '../src/serveur/assistant';
const env = { SUPABASE_URL: 'https://base.test', SUPABASE_CLE_PUBLIQUE: 'publique', SUPABASE_CLE_SERVEUR: 'serveur', IA_ACTIVEE: 'oui', IA_MODE: 'groq-gratuit', IA_PLAN_VERIFIE: 'free', IA_TRANSFERT_AUTORISE: 'oui', IA_CLE: 'secret', IA_ESSAIS_ACTIVES: 'oui' };
function recuperateur(options: { possede?: boolean; budget?: boolean } = {}) {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit) => {
    const adresse = String(url);
    if (adresse.includes('/business?')) return Response.json(options.possede === false ? [] : [{ id: 'business' }]);
    if (adresse.includes('/rpc/reserver_analyse_assistant')) return Response.json(options.budget !== false);
    if (adresse.includes('api.groq.com')) return Response.json({ choices: [{ message: { content: '{"texte":"ESSAI SYNTHÉTIQUE : frais et remboursements incomplets.","actions":[]}' } }] });
    throw new Error('Lecture réelle interdite dans cet essai');
  });
}

describe('essai IA synthétique borné', () => {
  it('refuse avant toute inférence sans autorisation serveur', async () => {
    const fetcher = recuperateur();
    await expect(analyserBusiness({ ...env, IA_ESSAIS_ACTIVES: undefined }, 'session', 'user', 'business', '7j', 'essai-synthetique', fetcher, new Date('2026-10-06T12:00:00Z'), () => true)).rejects.toMatchObject({ statut: 403 });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('envoie trois cas fixes en une seule inférence, sans lire ou écrire de données réelles', async () => {
    const fetcher = recuperateur();
    const reponse = await analyserBusiness(env, 'session', 'user', 'business', '7j', 'essai-synthetique', fetcher, new Date('2026-10-06T12:00:00Z'), () => true);
    expect(reponse.texte).toContain('SYNTHÉTIQUE');
    expect(fetcher).toHaveBeenCalledTimes(3);
    const appelsIA = fetcher.mock.calls.filter(([url]) => String(url).includes('api.groq.com'));
    expect(appelsIA).toHaveLength(1);
    const corps = JSON.parse(String(appelsIA[0]![1]?.body));
    expect(corps.max_completion_tokens).toBe(1800);
    expect(corps.reasoning_effort).toBe('low');
    expect(corps.max_tokens).toBeUndefined();
    const contexte = JSON.parse(corps.messages[1].content);
    expect(contexte.donnees.essaisSynthetiques).toHaveLength(3);
    const cas = contexte.donnees.essaisSynthetiques;
    expect(cas[0].resume.commandes).toBe(0);
    expect(cas[1].resume.ventesCentimes).toBe(2000);
    expect(cas[1].resume.gainsCentimes).toBeNull();
    expect(cas[2].resume.remboursementsCentimes).toBe(2000);
    expect(cas[2].resume.gainsCentimes).toBeNull();
    expect(JSON.stringify(contexte)).not.toContain('business');
  });
  it('refuse le business d’un autre compte avant de réserver ou appeler le modèle', async () => {
    const fetcher = recuperateur({ possede: false });
    await expect(analyserBusiness(env, 'session', 'user', 'business', '7j', 'essai-synthetique', fetcher, new Date(), () => true)).rejects.toMatchObject({ statut: 403 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('consomme le même budget réservé et ne contourne pas un quota épuisé', async () => {
    const fetcher = recuperateur({ budget: false });
    await expect(analyserBusiness(env, 'session', 'user', 'business', '7j', 'essai-synthetique', fetcher, new Date(), () => true)).rejects.toMatchObject({ statut: 429 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes('api.groq.com'))).toBe(false);
  });
  it('respecte le limiteur normal avant l’inférence', async () => {
    const fetcher = recuperateur();
    await expect(analyserBusiness(env, 'session', 'user', 'business', '7j', 'essai-synthetique', fetcher, new Date(), () => false)).rejects.toMatchObject({ statut: 429 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
