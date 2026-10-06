/** Les nouvelles clés secrètes ne sont pas des JWT : elles passent uniquement dans apikey. */
export function entetesSupabaseServeur(cle: string): Record<string, string> {
  return cle.startsWith('sb_secret_')
    ? { apikey: cle }
    : { apikey: cle, Authorization: `Bearer ${cle}` };
}
