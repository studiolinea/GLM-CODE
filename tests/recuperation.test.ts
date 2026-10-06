import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { demanderRecuperation, changerMotDePasse } from '../src/donnees/recuperation';

it('envoie un lien vers la page de récupération sur la même origine', async () => {
  const resetPasswordForEmail = vi.fn().mockResolvedValue({ error: null });
  await demanderRecuperation({ auth: { resetPasswordForEmail } } as unknown as SupabaseClient, ' kevin@example.com ', 'https://pilotage.example');
  expect(resetPasswordForEmail).toHaveBeenCalledWith('kevin@example.com', { redirectTo: 'https://pilotage.example/?recuperation=1' });
});
it('refuse un nouveau mot de passe court avant de contacter le serveur', async () => {
  const updateUser = vi.fn();
  await expect(changerMotDePasse({ auth: { updateUser } } as unknown as SupabaseClient, 'court')).rejects.toThrow('8 caractères');
  expect(updateUser).not.toHaveBeenCalled();
});
it('ne présente pas un changement refusé comme réussi', async () => {
  const updateUser = vi.fn().mockResolvedValue({ error: { message: 'expired' } });
  await expect(changerMotDePasse({ auth: { updateUser } } as unknown as SupabaseClient, 'assez-long')).rejects.toThrow();
});
