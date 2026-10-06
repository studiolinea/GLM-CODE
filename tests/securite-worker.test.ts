import { describe, expect, it, vi } from 'vitest';
import { traiterApi, type Env } from '../src/serveur/worker';

const env: Env = {
  ASSETS: { fetch: async () => new Response('') },
  SUPABASE_URL: 'https://base.test',
  SUPABASE_CLE_PUBLIQUE: 'publique',
  CLE_CHIFFREMENT: 'secret-de-test',
};
const business = '11111111-1111-1111-1111-111111111111';

function appel(texte: string, entetes: Record<string, string> = {}) {
  return new Request('https://pilotage.test/api/comptes/lemonsqueezy/relier', {
    method: 'POST',
    headers: { Authorization: 'Bearer session', ...entetes },
    body: texte,
  });
}

describe('Les entrées du serveur restent bornées', () => {
  it.each<Record<string, string>>([{}, { 'Content-Length': '1' }])('refuse un corps trop grand sans faire appel à la boutique (%j)', async (entetes) => {
    const recuperer = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' })));
    const reponse = await traiterApi(appel(JSON.stringify({ business, cle: 'é'.repeat(9000) }), entetes), env, recuperer);
    expect(reponse.status).toBe(413);
    expect(recuperer).toHaveBeenCalledTimes(1);
    expect(reponse.headers.get('Cache-Control')).toBe('no-store');
  });

  it.each(['null', '[]', '"texte"', '{'])('refuse le JSON non objet ou invalide : %s', async (texte) => {
    const recuperer = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' })));
    const reponse = await traiterApi(appel(texte), env, recuperer);
    expect(reponse.status).toBe(400);
    expect(await reponse.json()).toEqual({ erreur: 'La demande est illisible. Réessaie depuis les réglages.' });
    expect(recuperer).toHaveBeenCalledTimes(1);
  });

  it('la lecture valide traverse aussi les frontières de caractères UTF-8', async () => {
    const recuperer = vi.fn(async (entree: RequestInfo | URL) => {
      const url = String(entree);
      if (url.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
      if (url.includes('/stores')) return new Response(JSON.stringify({ data: [{ attributes: { name: 'Boutique' } }] }));
      return new Response(null, { status: 204 });
    });
    const octets = new TextEncoder().encode(JSON.stringify({ business, cle: 'x'.repeat(30), texte: 'été' }));
    const flux = new ReadableStream<Uint8Array>({ start(controleur) {
      for (const octet of octets) controleur.enqueue(Uint8Array.of(octet));
      controleur.close();
    } });
    const requete = new Request(appel('').url, {
      method: 'POST', headers: { Authorization: 'Bearer session' }, body: flux,
      // Requis par le runtime Node des tests ; le Worker accepte naturellement les flux.
      ...{ duplex: 'half' },
    });
    expect((await traiterApi(requete, env, recuperer)).status).toBe(200);
    expect(recuperer).toHaveBeenCalledTimes(3);
  });

  it.each(['x'.repeat(4097), { toString: 'x'.repeat(30) }])('ne transmet jamais une clé excessive ou non textuelle', async (cle) => {
    const recuperer = vi.fn(async () => new Response(JSON.stringify({ id: 'u1' })));
    expect((await traiterApi(appel(JSON.stringify({ business, cle })), env, recuperer)).status).toBe(400);
    expect(recuperer).toHaveBeenCalledTimes(1);
  });
});
