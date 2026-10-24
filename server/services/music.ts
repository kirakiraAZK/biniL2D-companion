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
  artworkUrl?: string;
  trackViewUrl?: string;
  spotifyUrl: string;
  ytMusicUrl: string;
  youtubeUrl: string;
  appleMusicUrl: string;
}

export class MusicDatabaseService {
  private trackCache = new Map<string, { track: TrackInfo; timestamp: number }>();
  private readonly CACHE_TTL = 60 * 60 * 1000; // 1 hour

  /**
   * Generates direct search / listen deep links for all major streaming platforms.
   */
  generateStreamingLinks(title: string, artist: string, trackViewUrl?: string) {
    const q = `${artist} ${title}`.trim();
    const encoded = encodeURIComponent(q);
    return {
      spotifyUrl: `https://open.spotify.com/search/${encoded}`,
      ytMusicUrl: `https://music.youtube.com/search?q=${encoded}`,
      youtubeUrl: `https://www.youtube.com/results?search_query=${encoded}`,
      appleMusicUrl: trackViewUrl || `https://music.apple.com/search?term=${encoded}`
    };
  }

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

            const artist = item.artistName || query;
            const artwork = (item.artworkUrl100 || '').replace('100x100', '600x600');
            const links = this.generateStreamingLinks(trackName, artist, item.trackViewUrl);

            tracks.push({
              title: trackName,
              artist,
              album: item.collectionName || '',
              releaseYear: item.releaseDate ? new Date(item.releaseDate).getFullYear().toString() : '',
              previewUrl: item.previewUrl || '',
              artworkUrl: artwork,
              trackViewUrl: item.trackViewUrl || '',
              ...links
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

            const links = this.generateStreamingLinks(title, query);
            tracks.push({
              title,
              artist: query,
              ...links
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

  /**
   * Resolves a single song title (with optional artist hint) to track metadata,
   * playable 30-second audio preview, album artwork, and multi-platform links.
   */
  async resolveTrack(songTitle: string, artistHint = ''): Promise<TrackInfo> {
    const title = songTitle.trim().replace(/^["']|["']$/g, '');
    const artist = artistHint.trim();
    const cacheKey = `${artist.toLowerCase()}:::${title.toLowerCase()}`;

    const cached = this.trackCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.track;
    }

    const searchTerm = artist ? `${artist} ${title}` : title;

    try {
      const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&entity=song&limit=5`;
      const res = await fetch(itunesUrl, {
        headers: { 'User-Agent': 'biniL2D-Companion/1.0.0' }
      });

      if (res.ok) {
        const data = await res.json() as { results?: Array<any> };
        if (data.results && data.results.length > 0) {
          // Find closest matching track
          const lowerTitle = title.toLowerCase();
          const match = data.results.find((r: any) =>
            (r.trackName || '').toLowerCase().includes(lowerTitle)
          ) || data.results[0];

          const trackArtist = match.artistName || artist || 'Artist';
          const artwork = (match.artworkUrl100 || '').replace('100x100', '600x600');
          const links = this.generateStreamingLinks(match.trackName, trackArtist, match.trackViewUrl);

          const track: TrackInfo = {
            title: match.trackName,
            artist: trackArtist,
            album: match.collectionName || '',
            releaseYear: match.releaseDate ? new Date(match.releaseDate).getFullYear().toString() : '',
            previewUrl: match.previewUrl || '',
            artworkUrl: artwork,
            trackViewUrl: match.trackViewUrl || '',
            ...links
          };

          this.trackCache.set(cacheKey, { track, timestamp: Date.now() });
          return track;
        }
      }
    } catch (e: any) {
      console.warn('[music] Track resolve failed for:', searchTerm, e.message);
    }

    // Fallback track info with full platform search links
    const fallbackLinks = this.generateStreamingLinks(title, artist);
    const fallbackTrack: TrackInfo = {
      title,
      artist: artist || 'Companion',
      ...fallbackLinks
    };
    this.trackCache.set(cacheKey, { track: fallbackTrack, timestamp: Date.now() });
    return fallbackTrack;
  }
}

export const musicService = new MusicDatabaseService();
