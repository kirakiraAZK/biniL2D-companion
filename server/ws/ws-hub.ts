import { WebSocket } from 'ws';

export interface WSMessage {
  type: string;
  [key: string]: any;
}

class WebSocketHub {
  private clients = new Set<WebSocket>();

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

  broadcast(message: WSMessage): void {
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }
}

export const wsHub = new WebSocketHub();
