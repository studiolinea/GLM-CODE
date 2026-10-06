import type { SupabaseClient } from '@supabase/supabase-js';

export async function demanderRecuperation(client: SupabaseClient, email: string, origine: string): Promise<void> {
  const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${origine}/?recuperation=1` });
  if (error) throw new Error('Impossible d’envoyer le lien pour le moment. Réessaie dans un instant.');
}

export async function changerMotDePasse(client: SupabaseClient, motDePasse: string): Promise<void> {
  if (motDePasse.length < 8) throw new Error('Choisis un mot de passe d’au moins 8 caractères.');
  const { error } = await client.auth.updateUser({ password: motDePasse });
  if (error) throw new Error('Ce lien n’est peut-être plus valable. Demande un nouveau lien de récupération.');
}
