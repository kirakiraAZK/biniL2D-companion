import { WebSocket } from 'ws';
import { dbManager } from '../db/client';

class DiscordBotBridge {
  private ws: WebSocket | null = null;
  private running = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private lastSequence: number | null = null;
  private botUserId: string = '';

  async start(): Promise<void> {
    const enabled =
      dbManager.getSetting('discord_bot_enabled') === 'true' ||
      process.env.DISCORD_BOT_ENABLED === 'true';
    const token =
      dbManager.getSetting('discord_bot_token') ||
      process.env.DISCORD_BOT_TOKEN;

    if (!enabled || !token) {
      console.log('[discord] Bot bridge is disabled or missing token.');
      return;
    }

    if (this.running) return;
    this.running = true;
    console.log('[discord] Starting Discord bot bridge...');

    this.connectGateway(token.trim());
  }

  stop(): void {
    this.running = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    console.log('[discord] Discord bot bridge stopped.');
  }

  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  private connectGateway(token: string): void {
    if (!this.running) return;

    const gatewayUrl = 'wss://gateway.discord.gg/?v=10&encoding=json';
    try {
      this.ws = new WebSocket(gatewayUrl);
    } catch (e: any) {
      console.error('[discord] Failed to initiate WebSocket:', e.message);
      this.scheduleReconnect(token);
      return;
    }

    this.ws.on('open', () => {
      console.log('[discord] Connected to Discord Gateway.');
    });

    this.ws.on('message', (raw) => {
      try {
        const payload = JSON.parse(raw.toString());
        this.handlePayload(payload, token);
      } catch (err: any) {
        console.error('[discord] Error parsing payload:', err.message);
      }
    });

    this.ws.on('close', (code, reason) => {
      console.log(`[discord] Gateway disconnected (code ${code}): ${reason.toString()}`);
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }
      if (this.running) {
        this.scheduleReconnect(token);
      }
    });

    this.ws.on('error', (err) => {
      console.error('[discord] Gateway error:', err.message);
    });
  }

  private scheduleReconnect(token: string): void {
    if (!this.running || this.reconnectTimeout) return;
    console.log('[discord] Reconnecting in 5 seconds...');
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      if (this.running) {
        this.connectGateway(token);
      }
    }, 5000);
  }

  private handlePayload(payload: any, token: string): void {
    const { op, d, s, t } = payload;
    if (s !== undefined && s !== null) {
      this.lastSequence = s;
    }

    switch (op) {
      case 10: // HELLO
        const interval = d.heartbeat_interval;
        this.startHeartbeat(interval);
        this.sendIdentify(token);
        break;

      case 11: // HEARTBEAT ACK
        break;

      case 0: // DISPATCH
        if (t === 'READY') {
          this.botUserId = d.user?.id || '';
          console.log(`[discord] Logged in as ${d.user?.username} (${this.botUserId})`);
        } else if (t === 'MESSAGE_CREATE') {
          void this.handleIncomingMessage(d, token);
        }
        break;

      case 1: // Discord requested immediate heartbeat
        this.sendHeartbeat();
        break;

      case 7: // RECONNECT
        console.log('[discord] Server requested reconnect.');
        this.ws?.close();
        break;

      case 9: // INVALID_SESSION
        console.log('[discord] Invalid session. Re-identifying...');
        setTimeout(() => this.sendIdentify(token), 1000);
        break;
    }
  }

  private startHeartbeat(intervalMs: number): void {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, intervalMs);
  }

  private sendHeartbeat(): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ op: 1, d: this.lastSequence }));
    }
  }

  private sendIdentify(token: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    // Intents: GUILD_MESSAGES (512) + DIRECT_MESSAGES (4096) + MESSAGE_CONTENT (32768) = 37376
    const payload = {
      op: 2,
      d: {
        token: `Bot ${token.replace(/^Bot\s+/i, '')}`,
        intents: 37376,
        properties: {
          os: process.platform,
          browser: 'bini-l2d-companion',
          device: 'bini-l2d-companion'
        }
      }
    };
    this.ws.send(JSON.stringify(payload));
  }

  private async handleIncomingMessage(msg: any, token: string): Promise<void> {
    // Ignore messages from bots or our own bot
    if (msg.author?.bot || msg.author?.id === this.botUserId) return;

    const allowedId =
      dbManager.getSetting('discord_allowed_id') ||
      process.env.DISCORD_ALLOWED_ID;
    const targetChannelId =
      dbManager.getSetting('discord_channel_id') ||
      process.env.DISCORD_CHANNEL_ID;

    // Check user whitelist if configured
    if (allowedId && msg.author?.id !== allowedId) {
      console.log(`[discord] Ignored message from unauthorized user: ${msg.author?.id}`);
      return;
    }

    // Check channel whitelist if configured
    if (targetChannelId && msg.channel_id !== targetChannelId) {
      return;
    }

    let rawText = msg.content || '';
    // Strip bot mention e.g. <@1234567890>
    if (this.botUserId) {
      rawText = rawText.replace(new RegExp(`<@!?${this.botUserId}>`, 'g'), '').trim();
    }

    if (!rawText) return;

    const channelId = msg.channel_id;
    const messageId = msg.id;

    console.log(`[discord] Received from ${msg.author?.username}: "${rawText}"`);

    try {
      const activeCharId = dbManager.getSetting('active_character_id') || 'kanata';

      // Forward to local chat API
      const chatRes = await fetch('http://127.0.0.1:8800/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId: activeCharId,
          message: rawText
        })
      });

      if (!chatRes.ok) {
        console.error(`[discord] Chat API returned HTTP ${chatRes.status}`);
        return;
      }

      const streamText = await chatRes.text();
      let cleanReply = '';

      for (const line of streamText.split('\n')) {
        if (line.startsWith('data:')) {
          try {
            const parsed = JSON.parse(line.slice(5).trim());
            if (parsed.type === 'token') cleanReply += parsed.token;
            if (parsed.type === 'done' && parsed.message?.content) {
              cleanReply = parsed.message.content;
            }
          } catch {}
        }
      }

      if (cleanReply) {
        await this.sendMessage(channelId, messageId, cleanReply, token);
      }
    } catch (err: any) {
      console.error('[discord] Error forwarding message to companion:', err.message);
    }
  }

  private async sendMessage(
    channelId: string,
    replyToMessageId: string,
    content: string,
    token: string
  ): Promise<void> {
    const authHeader = `Bot ${token.replace(/^Bot\s+/i, '')}`;

    // Discord has a 2000 character limit per message
    const chunks: string[] = [];
    let remaining = content;
    while (remaining.length > 2000) {
      chunks.push(remaining.slice(0, 2000));
      remaining = remaining.slice(2000);
    }
    if (remaining.length > 0) chunks.push(remaining);

    for (let i = 0; i < chunks.length; i++) {
      const body: any = {
        content: chunks[i]
      };
      if (i === 0 && replyToMessageId) {
        body.message_reference = { message_id: replyToMessageId };
      }

      try {
        const res = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
          method: 'POST',
          headers: {
            Authorization: authHeader,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          console.error(`[discord] Failed to send message: HTTP ${res.status}: ${errText}`);
        }
      } catch (err: any) {
        console.error('[discord] Network error sending message:', err.message);
      }
    }
  }
}

export const discordBotBridge = new DiscordBotBridge();
