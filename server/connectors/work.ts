import { dbManager } from '../db/client';
import { freshRssClient } from './freshrss';

export interface CalendarEvent {
  title: string;
  start: string;
  end?: string;
  location?: string;
}

export interface TaskItem {
  id: string;
  title: string;
  status: string;
}

/**
 * Lightweight, zero-dependency iCal / .ics feed parser.
 * Supports Google Calendar secret iCal, Nextcloud, Apple iCloud, and Outlook ICS links.
 */
export function parseIcsCalendar(icsContent: string, maxEvents = 5): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const lines = icsContent.replace(/\r\n/g, '\n').split('\n');

  let inEvent = false;
  let currentSummary = '';
  let currentStart = '';
  let currentEnd = '';
  let currentLocation = '';

  const now = new Date();
  const pastWindow = new Date(now.getTime() - 2 * 3600 * 1000); // include events started up to 2h ago
  const futureWindow = new Date(now.getTime() + 48 * 3600 * 1000); // next 48 hours

  const parseIcsDate = (val: string): Date | null => {
    try {
      const clean = val.replace(/^[^:]*:/, '').trim();
      if (clean.length === 8) {
        // YYYYMMDD
        const y = parseInt(clean.substring(0, 4), 10);
        const m = parseInt(clean.substring(4, 6), 10) - 1;
        const d = parseInt(clean.substring(6, 8), 10);
        return new Date(y, m, d);
      } else if (clean.includes('T')) {
        // YYYYMMDDTHHMMSS(Z)
        const parts = clean.split('T');
        const y = parseInt(parts[0].substring(0, 4), 10);
        const m = parseInt(parts[0].substring(4, 6), 10) - 1;
        const d = parseInt(parts[0].substring(6, 8), 10);
        const hh = parseInt(parts[1].substring(0, 2), 10) || 0;
        const mm = parseInt(parts[1].substring(2, 4), 10) || 0;
        const ss = parseInt(parts[1].substring(4, 6), 10) || 0;
        if (clean.endsWith('Z')) {
          return new Date(Date.UTC(y, m, d, hh, mm, ss));
        }
        return new Date(y, m, d, hh, mm, ss);
      }
      return new Date(clean);
    } catch {
      return null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    // Unfold multi-line fields
    while (i + 1 < lines.length && (lines[i + 1].startsWith(' ') || lines[i + 1].startsWith('\t'))) {
      line += lines[i + 1].substring(1);
      i++;
    }

    if (line.startsWith('BEGIN:VEVENT')) {
      inEvent = true;
      currentSummary = '';
      currentStart = '';
      currentEnd = '';
      currentLocation = '';
    } else if (line.startsWith('END:VEVENT')) {
      inEvent = false;
      if (currentSummary && currentStart) {
        const startDate = parseIcsDate(currentStart);
        if (startDate && startDate >= pastWindow && startDate <= futureWindow) {
          const startLabel = startDate.toLocaleDateString([], {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          });
          events.push({
            title: currentSummary,
            start: startLabel,
            location: currentLocation || undefined
          });
        }
      }
    } else if (inEvent) {
      if (line.startsWith('SUMMARY:')) {
        currentSummary = line.substring(8).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
      } else if (line.startsWith('DTSTART')) {
        currentStart = line;
      } else if (line.startsWith('DTEND')) {
        currentEnd = line;
      } else if (line.startsWith('LOCATION:')) {
        currentLocation = line.substring(9).replace(/\\,/g, ',').replace(/\\;/g, ';').trim();
      }
    }
  }

  return events.slice(0, maxEvents);
}

class WorkConnectorsService {
  // --- Google Calendar / Universal ICS Calendar Feed ---
  isCalendarEnabled(): boolean {
    return (
      dbManager.isFeatureEnabled('google_enabled', false) ||
      dbManager.isFeatureEnabled('nextcloud_enabled', false) ||
      dbManager.isFeatureEnabled('calendar_enabled', false)
    );
  }

  async getUpcomingCalendarEvents(): Promise<CalendarEvent[]> {
    if (!this.isCalendarEnabled()) return [];

    const icsUrl =
      dbManager.getRuntimeSetting('calendar_ics_url', process.env.CALENDAR_ICS_URL || '') ||
      dbManager.getRuntimeSetting('google_calendar_url', process.env.GOOGLE_CALENDAR_URL || '') ||
      dbManager.getRuntimeSetting('nextcloud_caldav_url', process.env.NEXTCLOUD_CALDAV_URL || '');

    if (!icsUrl) return [];

    try {
      const res = await fetch(icsUrl, {
        signal: AbortSignal.timeout(8000),
        headers: { 'User-Agent': 'biniL2D-Companion/1.0.0' }
      });
      if (!res.ok) {
        console.warn(`[calendar] Fetching ICS failed: HTTP ${res.status}`);
        return [];
      }
      const icsText = await res.text();
      const events = parseIcsCalendar(icsText, 5);
      console.log(`[calendar] Parsed ${events.length} upcoming events from ICS feed`);
      return events;
    } catch (e: any) {
      console.warn('[calendar] Error reading calendar feed:', e.message);
      return [];
    }
  }

  // --- Notion Workspace ---
  isNotionEnabled(): boolean {
    return dbManager.isFeatureEnabled('notion_enabled', false);
  }

  async getNotionTasks(): Promise<TaskItem[]> {
    if (!this.isNotionEnabled()) return [];
    const apiKey = dbManager.getRuntimeSetting('notion_api_key', process.env.NOTION_API_KEY || '');
    let dbId = dbManager.getRuntimeSetting('notion_database_id', process.env.NOTION_DATABASE_ID || '');

    if (!apiKey || !dbId) return [];

    // Strip Notion URL wrapper if user pasted full URL (e.g. notion.so/.../<id>?v=...)
    dbId = dbId.replace(/^https?:\/\/.*notion\.so\/[^\/]*\/([a-f0-9]{32}).*$/i, '$1');
    dbId = dbId.replace(/\?.*$/, '').replace(/[^a-f0-9-]/gi, '');

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 6 }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) {
        console.warn(`[notion] Query failed: HTTP ${res.status}`);
        return [];
      }
      const data = await res.json() as any;
      const tasks: TaskItem[] = [];

      for (const result of (data.results || [])) {
        const titleProp = result.properties?.Name || result.properties?.Title || result.properties?.Task;
        const titleText = titleProp?.title?.[0]?.plain_text || 'Untitled Task';
        const statusProp = result.properties?.Status || result.properties?.State || result.properties?.Stage;
        const statusText = statusProp?.status?.name || statusProp?.select?.name || 'Pending';
        tasks.push({
          id: result.id,
          title: titleText,
          status: statusText,
        });
      }
      return tasks;
    } catch (e: any) {
      console.warn('[notion] Failed to fetch tasks:', e.message);
      return [];
    }
  }

  /**
   * Aggregates active work connectors (Notion tasks, Calendar schedule, FreshRSS news)
   * into a clean context block for injection into the LLM system prompt.
   */
  async getWorkAndConnectorContext(keywords: string[] = []): Promise<string | null> {
    const parts: string[] = [];

    // 1. Calendar schedule
    if (this.isCalendarEnabled()) {
      const events = await this.getUpcomingCalendarEvents();
      if (events.length > 0) {
        const eventLines = events.map(e => `  * ${e.start}: ${e.title}${e.location ? ` (@ ${e.location})` : ''}`).join('\n');
        parts.push(`- Upcoming Calendar Events (Next 48h):\n${eventLines}`);
      }
    }

    // 2. Notion tasks
    if (this.isNotionEnabled()) {
      const tasks = await this.getNotionTasks();
      if (tasks.length > 0) {
        const taskLines = tasks.map(t => `  * [${t.status}] ${t.title}`).join('\n');
        parts.push(`- Notion Workspace Tasks:\n${taskLines}`);
      }
    }

    // 3. FreshRSS news articles
    if (dbManager.isFeatureEnabled('freshrss_enabled', false)) {
      const articles = await freshRssClient.fetchArticles(keywords);
      if (articles && articles.length > 0) {
        const newsLines = articles.slice(0, 3).map(a => `  * "${a.title}" (via ${a.source})`).join('\n');
        parts.push(`- FreshRSS News Feed:\n${newsLines}`);
      }
    }

    if (parts.length === 0) return null;

    return `\n\nUSER WORK & SCHEDULE CONTEXT:\n${parts.join('\n')}\n- Instructions: If the user asks about their schedule, calendar, upcoming tasks, what they need to do, or recent news, use this real-time information to assist them naturally in character.`;
  }
}

export const workConnectors = new WorkConnectorsService();
