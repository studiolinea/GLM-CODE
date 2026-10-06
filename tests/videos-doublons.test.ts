import { expect, it } from 'vitest';
import { appliquerVideos } from '../src/donnees/useSynchroBoutique';
import { quitterExemple } from '../src/donnees/actions';
import { donneesExemple } from '../src/donnees/exemple';

it('remplace une vidéo manuelle par la même publication TikTok vérifiable', () => {
  const base = quitterExemple(donneesExemple(new Date('2026-10-06T10:00Z')));
  const video = { id: 'manuel', instant: '2026-10-05T10:00:00Z', reseau: 'tiktok' as const, lien: 'https://www.tiktok.com/@compte/video/123456789?lang=fr', vues: 5 };
  const api = { ...video, id: 'tiktok:123456789', lien: 'https://www.tiktok.com/@compte/video/123456789', vues: 20 };
  expect(appliquerVideos({ ...base, videos: [video] }, [api]).videos).toEqual([api]);
});
it('ne fusionne pas des dates voisines ni des liens inconnus', () => {
  const base = quitterExemple(donneesExemple(new Date('2026-10-06T10:00Z')));
  const video = { id: 'manuel', instant: '2026-10-05T10:00:00Z', reseau: 'tiktok' as const, lien: 'https://vm.tiktok.com/abc' };
  expect(appliquerVideos({ ...base, videos: [video] }, [{ ...video, id: 'api', lien: 'https://www.tiktok.com/@compte/video/123456789' }]).videos).toHaveLength(2);
});
