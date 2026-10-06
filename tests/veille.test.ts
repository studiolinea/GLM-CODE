import { expect, it, vi } from 'vitest';
import { executerVeille, type ConfigurationVeille } from '../src/serveur/veille';
const UID = '11111111-1111-1111-1111-111111111111';
const BID = '22222222-2222-2222-2222-222222222222';
const maintenant = new Date('2026-10-06T10:00:00Z');
const job = { user_id: UID, business_id: BID, prochain_scan: '2026-10-06T09:00:00Z', empreinte: 'a'.repeat(64) };
const env: ConfigurationVeille = { SUPABASE_URL: 'https://base.example', SUPABASE_CLE_PUBLIQUE: 'publique', SUPABASE_CLE_SERVEUR: 'secret-serveur-test', IA_ACTIVEE: 'oui', IA_MODE: 'cloudflare-gratuit', IA_PLAN_VERIFIE: 'free', VEILLE_ACTIVEE: 'oui', AI: { run: async () => ({ response: 'test' }) } };
const json = (valeur: unknown) => new Response(JSON.stringify(valeur));
function scenario({ gagne = true, possede = true } = {}) {
  const ecrits: Record<string, unknown>[] = [];
  const recuperer = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/business')) return json(possede ? [{ id: BID }] : []);
    if (init?.method === 'PATCH') {
      const corps = JSON.parse(String(init.body)); ecrits.push(corps);
      return json(corps.prochain_scan ? (gagne ? [job] : []) : []);
    }
    return json([job]);
  });
  return { recuperer, ecrits };
}
function services(inchange = false) {
  return { synchroniser: vi.fn(async () => undefined), analyser: vi.fn(async () => ({ texte: 'Plan', genereLe: maintenant.toISOString(), modele: 'modèle-test', avertissement: 'À vérifier', actions: [], empreinte: 'b'.repeat(64), inchange })) };
}
it('ne fait aucun appel si la veille ou le plan gratuit ne sont pas confirmés', async () => {
  const s = scenario();
  await executerVeille({ ...env, VEILLE_ACTIVEE: undefined }, s.recuperer, maintenant);
  await executerVeille({ ...env, IA_PLAN_VERIFIE: 'paid' }, s.recuperer, maintenant);
  expect(s.recuperer).not.toHaveBeenCalled();
});
it('une réservation perdue empêche toute lecture de boutique et toute analyse', async () => {
  const s = scenario({ gagne: false }); const t = services();
  await executerVeille(env, s.recuperer, maintenant, t);
  expect(t.synchroniser).not.toHaveBeenCalled(); expect(t.analyser).not.toHaveBeenCalled();
});
it('vérifie le propriétaire même avec une clé serveur', async () => {
  const s = scenario({ possede: false }); const t = services();
  await executerVeille(env, s.recuperer, maintenant, t);
  expect(t.synchroniser).not.toHaveBeenCalled(); expect(t.analyser).not.toHaveBeenCalled();
  expect(s.ecrits.at(-1)).toHaveProperty('derniere_erreur');
});
it('relève les sources et conserve un plan par business avec son heure', async () => {
  const s = scenario(); const t = services();
  expect(await executerVeille(env, s.recuperer, maintenant, t)).toEqual({ active: true, traite: true });
  expect(t.synchroniser).toHaveBeenCalledOnce(); expect(t.analyser).toHaveBeenCalledOnce();
  expect(s.ecrits.at(-1)).toMatchObject({ texte: 'Plan', derniere_analyse: maintenant.toISOString() });
  for (const [input, init] of s.recuperer.mock.calls) if (init?.method === 'PATCH') {
    const url = new URL(String(input));
    expect(url.searchParams.get('user_id')).toBe(`eq.${UID}`);
    expect(url.searchParams.get('business_id')).toBe(`eq.${BID}`);
  }
});
it('sans changement, garde le précédent résultat et note seulement le passage', async () => {
  const s = scenario(); await executerVeille(env, s.recuperer, maintenant, services(true));
  expect(s.ecrits.at(-1)).toEqual({ dernier_scan: maintenant.toISOString(), derniere_erreur: null });
});
it('un échec de source empêche une analyse de données faussement fraîches', async () => {
  const s = scenario(); const t = services(); t.synchroniser.mockRejectedValueOnce(new Error('clé-secrète-ne-pas-garder'));
  await executerVeille(env, s.recuperer, maintenant, t);
  expect(t.analyser).not.toHaveBeenCalled(); expect(JSON.stringify(s.ecrits)).not.toContain('clé-secrète');
  expect(s.ecrits.at(-1)).not.toHaveProperty('texte');
});

it('la limite de lectures échoue proprement et ne déclenche pas le modèle', async () => {
  const s = scenario(); const t = services();
  const saturation = async (_env: unknown, _job: unknown, fetcher: typeof fetch) => {
    for (let i = 0; i < 50; i++) await fetcher('https://base.example/lecture');
  };
  expect(await executerVeille(env, s.recuperer, maintenant, { ...t, synchroniser: saturation })).toEqual({ active: true, traite: false });
  expect(t.analyser).not.toHaveBeenCalled(); expect(s.recuperer.mock.calls.length).toBe(45);
});
