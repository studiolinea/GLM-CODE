/** Traduit les messages de connexion de Supabase en français simple, avec quoi faire. */
export function traduireErreurConnexion(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.';
  if (m.includes('email not confirmed')) {
    return 'Confirme d’abord ton adresse : ouvre l’e-mail de confirmation et clique sur le lien.';
  }
  if (m.includes('already registered') || m.includes('already been registered') || m.includes('user already exists')) {
    return 'Ce compte existe déjà : connecte-toi.';
  }
  if (m.includes('signups not allowed') || m.includes('signup is disabled') || m.includes('signups are disabled')) {
    return 'La création de compte est fermée sur cette appli.';
  }
  if (m.includes('password should') || m.includes('weak password') || m.includes('weak_password')) {
    return 'Ce mot de passe est trop faible : choisis-en un plus long.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return 'Trop d’essais d’un coup. Attends quelques minutes, puis réessaie.';
  }
  if (m.includes('fetch') || m.includes('network')) return 'Pas de connexion, réessaie.';
  return `La connexion a échoué (${message}).`;
}
