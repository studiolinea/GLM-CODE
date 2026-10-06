import { describe, expect, it } from 'vitest';
import { traduireErreurConnexion } from '../src/donnees/erreursConnexion';

describe('traduireErreurConnexion', () => {
  it('traduit les messages courants de Supabase', () => {
    expect(traduireErreurConnexion('Invalid login credentials')).toBe('E-mail ou mot de passe incorrect.');
    expect(traduireErreurConnexion('Email not confirmed')).toContain('Confirme d’abord ton adresse');
    expect(traduireErreurConnexion('User already registered')).toBe('Ce compte existe déjà : connecte-toi.');
    expect(traduireErreurConnexion('Signups not allowed for this instance')).toContain('fermée');
    expect(traduireErreurConnexion('Password should be at least 6 characters.')).toContain('trop faible');
    expect(traduireErreurConnexion('Email rate limit exceeded')).toContain('Attends quelques minutes');
    expect(traduireErreurConnexion('Failed to fetch')).toBe('Pas de connexion, réessaie.');
  });

  it('message inconnu : une phrase en français, jamais l’anglais brut', () => {
    const inconnu = traduireErreurConnexion('Something odd');
    expect(inconnu).toBe('La connexion n’a pas marché. Réessaie dans un moment.');
    expect(inconnu).not.toContain('Something odd');
  });
});
