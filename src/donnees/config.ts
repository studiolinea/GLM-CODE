import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const cle = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

/**
 * Le client de la base en ligne, ou null si l'appli n'est pas reliée à une base
 * (par exemple la version de test) : les données restent alors sur l'appareil.
 */
export const client: SupabaseClient | null =
  url && cle
    ? createClient(url, cle, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
