import { expect, it, vi } from 'vitest';
import { recupererSansRedirection } from '../src/serveur/redirections';
it('emploie manual compatible Cloudflare et conserve signal, corps et en-têtes', async () => {
  const signal = new AbortController().signal;
  const recuperer = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.redirect === 'error') throw new TypeError('Unsupported redirect mode');
    return new Response('ok');
  });
  expect(await (await recupererSansRedirection('https://source.test', { signal, method: 'POST', body: '{}', headers: { apikey: 'factice' } }, recuperer)).text()).toBe('ok');
  expect(recuperer.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual', signal, method: 'POST', body: '{}', headers: { apikey: 'factice' } });
});
it.each([301,302,303,307,308])('refuse %s sans transférer les secrets', async statut => {
  const recuperer = vi.fn(async () => new Response('redirect', { status: statut, headers: { Location: 'https://tiers.test' } }));
  await expect(recupererSansRedirection('https://source.test', { headers: { Authorization: 'Bearer factice' } }, recuperer)).rejects.toThrow('redirection');
  expect(recuperer).toHaveBeenCalledOnce();
});
