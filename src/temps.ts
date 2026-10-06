// Tout se calcule en heure de Paris. Une "date" est une chaîne AAAA-MM-JJ lue sur
// le calendrier de Paris ; un "instant" est un moment précis (Date ou ISO UTC).

export const FUSEAU = 'Europe/Paris';
export const MS_HEURE = 3_600_000;
export const MS_JOUR = 24 * MS_HEURE;

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', {
  timeZone: FUSEAU,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partiesParis(instant: Date) {
  const p: Record<string, string> = {};
  for (const part of FORMAT_PARIS.formatToParts(instant)) p[part.type] = part.value;
  return {
    annee: Number(p.year),
    mois: Number(p.month),
    jour: Number(p.day),
    heure: Number(p.hour),
    minute: Number(p.minute),
    seconde: Number(p.second),
  };
}

const deux = (n: number) => String(n).padStart(2, '0');

/** Date du calendrier à Paris pour cet instant, au format AAAA-MM-JJ. */
export function dateParis(instant: Date): string {
  const p = partiesParis(instant);
  return `${p.annee}-${deux(p.mois)}-${deux(p.jour)}`;
}

/** Heure à Paris pour cet instant, au format HH:MM. */
export function heureParis(instant: Date): string {
  const p = partiesParis(instant);
  return `${deux(p.heure)}:${deux(p.minute)}`;
}

/** Écart entre l'horloge de Paris et UTC à cet instant, en millisecondes. */
function decalageParis(instant: Date): number {
  const p = partiesParis(instant);
  const commeUtc = Date.UTC(p.annee, p.mois - 1, p.jour, p.heure, p.minute, p.seconde);
  return commeUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

const RE_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const RE_HEURE = /^(\d{2}):(\d{2})(?::(\d{2}))?$/;

/** L'instant où l'horloge de Paris affiche cette date et cette heure. */
export function instantParis(date: string, heure = '00:00'): Date {
  const d = RE_DATE.exec(date);
  const h = RE_HEURE.exec(heure);
  if (!d || !h) throw new Error(`Date ou heure invalide : ${date} ${heure}`);
  const commeUtc = Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!, +h[1]!, +h[2]!, +(h[3] ?? 0));
  // Fin octobre, l'heure de 2 h à 3 h passe deux fois : on prend la première (sinon « J'ai publié »
  // croit l'heure actuelle dans le futur). On essaie le décalage de la veille et celui du lendemain.
  const possibles = [commeUtc - MS_JOUR, commeUtc + MS_JOUR]
    .map((t) => commeUtc - decalageParis(new Date(t)))
    .filter((t) => decalageParis(new Date(t)) === commeUtc - t);
  if (possibles.length > 0) return new Date(Math.min(...possibles));
  // Heure qui n'existe pas (fin mars, de 2 h à 3 h) : deux passes, comme avant.
  let instant = commeUtc - decalageParis(new Date(commeUtc));
  instant = commeUtc - decalageParis(new Date(instant));
  return new Date(instant);
}

/** La date décalée de n jours (n peut être négatif). */
export function ajouterJours(date: string, n: number): string {
  const d = RE_DATE.exec(date);
  if (!d) throw new Error(`Date invalide : ${date}`);
  return new Date(Date.UTC(+d[1]!, +d[2]! - 1, +d[3]! + n)).toISOString().slice(0, 10);
}

/** Nombre de jours de calendrier entre deux dates (fin − début). */
export function joursEntre(debut: string, fin: string): number {
  return Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / MS_JOUR);
}

/** "2026-10-05" → "05/10". */
export function jourMois(date: string): string {
  return `${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** Un instant écrit pour un humain : "05/10 à 18h00" (heure de Paris). */
export function quandParis(instant: Date): string {
  return `${jourMois(dateParis(instant))} à ${heureParis(instant).replace(':', 'h')}`;
}

/**
 * Lit une date et heure telle qu'on la trouve dans un fichier :
 * - avec fuseau ("2026-10-05T10:15:00Z", "...+02:00") : prise telle quelle ;
 * - sans fuseau ("2026-10-05 10:15", "05/10/2026 10:15") : heure de Paris ;
 * - date seule : midi, heure de Paris.
 * Renvoie null si la date est illisible.
 */
export function lireDateHeure(texte: string): Date | null {
  const t = texte.trim();
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(t)) {
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  let date: string | undefined;
  let heure = '12:00';
  const iso = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(t);
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(t);
  if (iso) {
    date = iso[1];
    if (iso[2]) heure = iso[2];
  } else if (fr) {
    date = `${fr[3]}-${fr[2]}-${fr[1]}`;
    if (fr[4]) heure = fr[4];
  }
  if (!date || !dateExiste(date)) return null;
  return instantParis(date, heure);
}

function dateExiste(date: string): boolean {
  const d = RE_DATE.exec(date);
  if (!d) return false;
  const essai = new Date(Date.UTC(+d[1]!, +d[2]! - 1, +d[3]!));
  return essai.toISOString().slice(0, 10) === date;
}
