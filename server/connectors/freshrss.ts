import { dbManager } from '../db/client';

export interface FreshRssArticle {
  id: string;
  title: string;
  source: string;
  isCharacterPost: boolean;
}

class FreshRssClient {
  private authToken: string | null = null;
  private authExpires = 0;
  private cache: FreshRssArticle[] | null = null;
  private cacheTime = 0;
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  async fetchArticles(keywords: string[] = []): Promise<FreshRssArticle[] | null> {
    if (!dbManager.isFeatureEnabled('freshrss_enabled', false)) {
      return null;
    }

    const now = Date.now();
    if (this.cache && (now - this.cacheTime) < this.CACHE_TTL) {
      return this.cache;
    }

    const url = dbManager.getRuntimeSetting('freshrss_url', process.env.FRESHRSS_URL || '');
    const user = dbManager.getRuntimeSetting('freshrss_user', process.env.FRESHRSS_USER || '');
    const password = dbManager.getRuntimeSetting('freshrss_api_password', process.env.FRESHRSS_API_PASSWORD || '');

    if (!url || !password) {
      return null;
    }

    try {
      // Authenticate if needed
      if (!this.authToken || now >= this.authExpires) {
        const authUrl = `${url.replace(/\/$/, '')}/api/greader.php/accounts/ClientLogin`;
        const authParams = new URLSearchParams({ Email: user, Passwd: password });
        const authRes = await fetch(authUrl, {
          method: 'POST',
          body: authParams,
          signal: AbortSignal.timeout(8000),
        });

        if (!authRes.ok) {
          console.warn(`[freshrss] Authentication failed: HTTP ${authRes.status}`);
          return null;
        }

        const authBody = await authRes.text();
        for (const line of authBody.split('\n')) {
          if (line.startsWith('Auth=')) {
            this.authToken = line.substring(5).trim();
            this.authExpires = now + (12 * 3600 * 1000);
            break;
          }
        }
      }

      if (!this.authToken) return null;

      // Fetch stream
      const streamUrl = `${url.replace(/\/$/, '')}/api/greader.php/reader/api/0/stream/contents/reading-list?n=20`;
      const streamRes = await fetch(streamUrl, {
        headers: { Authorization: `GoogleLogin auth=${this.authToken}` },
        signal: AbortSignal.timeout(10000),
      });

      if (!streamRes.ok) {
        console.warn(`[freshrss] Stream fetch failed: HTTP ${streamRes.status}`);
        return null;
      }

      const data = await streamRes.json() as any;
      const articles: FreshRssArticle[] = [];
      const lowerKeywords = keywords.map(k => k.toLowerCase());

      for (const item of (data.items || [])) {
        const source = item.origin?.title || 'Feed';
        const title = item.title || '';
        if (!title) continue;

        const isCharacterPost = lowerKeywords.some(kw =>
          source.toLowerCase().includes(kw) || title.toLowerCase().includes(kw)
        );

        articles.push({
          id: item.id || title,
          title,
          source,
          isCharacterPost,
        });
      }

      this.cache = articles;
      this.cacheTime = now;
      console.log(`[freshrss] Cached ${articles.length} news articles`);
      return articles;
    } catch (e: any) {
      console.warn('[freshrss] Error fetching articles:', e.message);
      return null;
    }
  }
}

export const freshRssClient = new FreshRssClient();
