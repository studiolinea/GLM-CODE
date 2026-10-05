/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Adresse du projet Supabase (publique). Absente : l'appli garde les données sur l'appareil. */
  readonly VITE_SUPABASE_URL?: string;
  /** Clé publique « anon » ou « publishable » du projet (jamais la clé secrète). */
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
