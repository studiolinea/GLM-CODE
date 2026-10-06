import type { Video } from '../modele';

/** Une date voisine ou un lien court ne prouve pas l'identité d'une publication. */
export function identifiantPublicationTikTok(video: Pick<Video, 'reseau' | 'lien'>): string | null {
  if (video.reseau !== 'tiktok' || !video.lien) return null;
  try {
    const lien = new URL(video.lien);
    if (lien.protocol !== 'https:' || !['www.tiktok.com', 'tiktok.com'].includes(lien.hostname)) return null;
    return /^\/@[^/]+\/video\/(\d+)\/?$/.exec(lien.pathname)?.[1] ?? null;
  } catch { return null; }
}
