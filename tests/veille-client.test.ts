import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
vi.mock('../src/donnees/config', () => ({ client: null }));
import { enregistrerAutorisationVeille } from '../src/donnees/useVeille';

function baseFausse(erreurInsertion: { code: string } | null = null) {
  const eq = vi.fn();
  const resultat = { error: null };
  eq.mockImplementation(() => ({ eq, then: (resolve: (value: typeof resultat) => void) => resolve(resultat) }));
  const update = vi.fn(() => ({ eq }));
  const insert = vi.fn(async () => ({ error: erreurInsertion }));
  const from = vi.fn(() => ({ update, insert }));
  return { client: { from } as unknown as SupabaseClient, from, update, insert, eq };
}

describe('autorisation veille distante', () => {
  it('crée seulement identité et autorisation sans résultats ni quota', async () => {
    const base = baseFausse();
    await enregistrerAutorisationVeille(base.client, 'user', 'business', false, true);
    expect(base.from).toHaveBeenCalledWith('assistant_veille');
    expect(base.insert).toHaveBeenCalledWith({ user_id: 'user', business_id: 'business', active: true });
    expect(base.update).not.toHaveBeenCalled();
  });
  it('préserve les résultats si le serveur crée la ligne pendant l’activation', async () => {
    const base = baseFausse({ code: '23505' });
    await enregistrerAutorisationVeille(base.client, 'user', 'business', false, true);
    expect(base.insert).toHaveBeenCalledWith({ user_id: 'user', business_id: 'business', active: true });
    expect(base.update).toHaveBeenCalledWith({ active: true });
    expect(base.eq).toHaveBeenCalledWith('user_id', 'user');
    expect(base.eq).toHaveBeenCalledWith('business_id', 'business');
  });
  it('ne masque pas un refus de droits en tentant une mise à jour', async () => {
    const base = baseFausse({ code: '42501' });
    await expect(enregistrerAutorisationVeille(base.client, 'user', 'business', false, true)).rejects.toThrow('Impossible');
    expect(base.update).not.toHaveBeenCalled();
  });
  it('désactive sans écraser une analyse sauvegardée', async () => {
    const base = baseFausse();
    await enregistrerAutorisationVeille(base.client, 'user', 'business', true, false);
    expect(base.update).toHaveBeenCalledWith({ active: false });
    expect(base.eq).toHaveBeenCalledWith('user_id', 'user');
    expect(base.eq).toHaveBeenCalledWith('business_id', 'business');
    expect(base.insert).not.toHaveBeenCalled();
  });
});
