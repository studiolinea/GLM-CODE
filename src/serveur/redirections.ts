/** Cloudflare accepte manual ; aucune redirection ne reçoit les clés ou le corps de la requête. */
export async function recupererSansRedirection(
  entree: RequestInfo | URL, init: RequestInit | undefined, recuperer: typeof fetch,
): Promise<Response> {
  const reponse = await recuperer(entree, { ...init, redirect: 'manual' });
  if (reponse.status >= 300 && reponse.status < 400) {
    await reponse.body?.cancel().catch(() => undefined);
    throw new Error('La redirection du service est refusée.');
  }
  return reponse;
}
