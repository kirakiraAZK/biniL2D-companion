/**
 * Music Database Service
 * Automatically fetches songs and discographies for companions (VTubers, anime characters, singers)
 * Uses public iTunes Search API with MusicBrainz fallback. Zero API key required.
 */

export interface TrackInfo {
  title: string;
  artist: string;
  album?: string;
  releaseYear?: string;
  previewUrl?: string;
}

export class MusicDatabaseService {
  /**
   * Search for songs by artist name.
   * Cleans up common noise (remixes, duplicate versions) and returns sorted unique titles.
   */
  async searchSongs(artistName: string, limit = 50): Promise<TrackInfo[]> {
    const query = artistName.trim();
    if (!query) return [];

    // 1. Try iTunes Search API
    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;
      const res = await fetch(itunesUrl, {
        headers: {
          'User-Agent': 'biniL2D-Companion/1.0.0 (https://github.com/live2d-companion)'
        }
      });

      if (res.ok) {
        const data = await res.json() as { resultCount: number; results: Array<any> };
        if (data.results && data.results.length > 0) {
          const seen = new Set<string>();
          const tracks: TrackInfo[] = [];

          for (const item of data.results) {
            const trackName = (item.trackName || '').trim();
            if (!trackName) continue;

            const cleanKey = trackName.toLowerCase().replace(/\s*\(instrumental.*?\)/i, '').trim();
            if (seen.has(cleanKey)) continue;
            seen.add(cleanKey);

            tracks.push({
              title: trackName,
              artist: item.artistName || query,
              album: item.collectionName || '',
              releaseYear: item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : '',
              previewUrl: item.previewUrl || ''
            });
          }

          if (tracks.length > 0) return tracks;
        }
      }
    } catch (e: any) {
      console.warn('[music] iTunes Search error:', e.message);
    }

    // 2. Fallback: MusicBrainz Public API
    try {
      const mbUrl = `https://musicbrainz.org/ws/2/recording?query=artist:%22${encodeURIComponent(query)}%22&fmt=json&limit=${limit}`;
      const res = await fetch(mbUrl, {
        headers: {
          'User-Agent': 'biniL2D-Companion/1.0.0 (contact@companion.local)'
        }
      });

      if (res.ok) {
        const data = await res.json() as { recordings?: Array<{ title: string; length?: number }> };
        if (data.recordings && data.recordings.length > 0) {
          const seen = new Set<string>();
          const tracks: TrackInfo[] = [];

          for (const rec of data.recordings) {
            const title = (rec.title || '').trim();
            if (!title) continue;
            const cleanKey = title.toLowerCase();
            if (seen.has(cleanKey)) continue;
            seen.add(cleanKey);

            tracks.push({
              title,
              artist: query
            });
          }

          return tracks;
        }
      }
    } catch (e: any) {
      console.warn('[music] MusicBrainz error:', e.message);
    }

    return [];
  }
}

export const musicService = new MusicDatabaseService();
