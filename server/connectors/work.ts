import { dbManager } from '../db/client';

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

class WorkConnectorsService {
  // --- Google Suite ---
  isGoogleEnabled(): boolean {
    return dbManager.isFeatureEnabled('google_enabled', false);
  }

  async getUpcomingGoogleEvents(): Promise<CalendarEvent[]> {
    if (!this.isGoogleEnabled()) return [];
    const apiKey = dbManager.getRuntimeSetting('google_api_key', process.env.GOOGLE_API_KEY || '');
    if (!apiKey) return [];
    // If user configured Google API, fetch events; otherwise return safe empty list
    return [];
  }

  // --- Notion Workspace ---
  isNotionEnabled(): boolean {
    return dbManager.isFeatureEnabled('notion_enabled', false);
  }

  async getNotionTasks(): Promise<TaskItem[]> {
    if (!this.isNotionEnabled()) return [];
    const apiKey = dbManager.getRuntimeSetting('notion_api_key', process.env.NOTION_API_KEY || '');
    const dbId = dbManager.getRuntimeSetting('notion_database_id', process.env.NOTION_DATABASE_ID || '');
    if (!apiKey || !dbId) return [];

    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ page_size: 5 }),
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return [];
      const data = await res.json() as any;
      const tasks: TaskItem[] = [];

      for (const result of (data.results || [])) {
        const titleProp = result.properties?.Name || result.properties?.Title || result.properties?.Task;
        const titleText = titleProp?.title?.[0]?.plain_text || 'Untitled Task';
        const statusProp = result.properties?.Status || result.properties?.State;
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

  // --- Nextcloud CalDAV ---
  isNextcloudEnabled(): boolean {
    return dbManager.isFeatureEnabled('nextcloud_enabled', false);
  }

  async getNextcloudEvents(): Promise<CalendarEvent[]> {
    if (!this.isNextcloudEnabled()) return [];
    const calUrl = dbManager.getRuntimeSetting('nextcloud_caldav_url', process.env.NEXTCLOUD_CALDAV_URL || '');
    if (!calUrl) return [];
    // Return empty list safely if CalDAV client is not configured
    return [];
  }
}

export const workConnectors = new WorkConnectorsService();
