import { WebSocket } from 'ws';

export interface WSMessage {
  type: string;
  [key: string]: any;
}

export interface DebugLogEntry {
  id: string;
  timestamp: number;
  category: 'AI' | 'WS' | 'TTS' | 'INTERACTION' | 'MOOD' | 'SYSTEM';
  level: 'info' | 'warn' | 'error';
  title: string;
  data?: any;
}

class WebSocketHub {
  private clients = new Set<WebSocket>();
  private logRing: DebugLogEntry[] = [];
  private readonly MAX_LOGS = 250;

  addClient(ws: WebSocket): void {
    this.clients.add(ws);
    console.log(`[ws] Client connected. Total: ${this.clients.size}`);

    // Send connected welcome frame
    ws.send(JSON.stringify({
      type: 'connected',
      clients: this.clients.size,
      server_time: Date.now()
    }));

    ws.on('close', () => {
      this.clients.delete(ws);
      console.log(`[ws] Client disconnected. Total: ${this.clients.size}`);
    });

    ws.on('error', (err) => {
      console.error('[ws] Client error:', err);
      this.clients.delete(ws);
    });

    ws.on('message', (data) => {
      try {
        const parsed = JSON.parse(data.toString());
        if (parsed.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', time: Date.now() }));
        }
      } catch {
        // ignore non-json messages
      }
    });
  }

  log(
    category: DebugLogEntry['category'],
    title: string,
    data?: any,
    level: 'info' | 'warn' | 'error' = 'info'
  ): void {
    const entry: DebugLogEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      category,
      level,
      title,
      data
    };

    this.logRing.push(entry);
    if (this.logRing.length > this.MAX_LOGS) {
      this.logRing.shift();
    }

    // Broadcast log event directly to all listening clients
    const payload = JSON.stringify({ type: 'debug_log', log: entry });
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }

    // Proactively announce warnings and errors directly to the user interface
    if (level === 'error' || level === 'warn') {
      const summary = typeof data === 'string'
        ? data
        : data?.message || data?.error || data?.hint || '';
      const noticePayload = JSON.stringify({
        type: 'system_notice',
        level,
        category,
        title,
        message: summary
      });
      for (const client of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          client.send(noticePayload);
        }
      }
    }
  }

  reportIssue(
    category: DebugLogEntry['category'],
    title: string,
    err: any,
    level: 'warn' | 'error' = 'error'
  ): void {
    const message = err?.message || String(err || 'Unknown error');
    console[level === 'error' ? 'error' : 'warn'](`[${category}] ${title}:`, message);
    this.log(category, title, { error: message, stack: err?.stack }, level);
  }

  getRecentLogs(limit = 100): DebugLogEntry[] {
    return this.logRing.slice(-limit);
  }

  clearLogs(): void {
    this.logRing = [];
  }

  broadcast(message: WSMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }

    // Auto-record non-internal WS events in debug log
    if (message.type !== 'debug_log' && message.type !== 'stream_token') {
      let cat: DebugLogEntry['category'] = 'WS';
      if (message.type === 'chat') cat = 'AI';
      else if (message.type.startsWith('chat_')) cat = 'INTERACTION';
      else if (message.type === 'mood_update') cat = 'MOOD';
      else if (message.type.startsWith('audio')) cat = 'TTS';
      this.log(cat, `WS Broadcast: ${message.type}`, message);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const wsHub = new WebSocketHub();
