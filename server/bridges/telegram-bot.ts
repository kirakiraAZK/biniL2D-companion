import { dbManager } from '../db/client';

class TelegramBotBridge {
  private polling = false;
  private offset = 0;
  private abortController: AbortController | null = null;

  async start(): Promise<void> {
    const enabled = dbManager.getSetting('telegram_bot_enabled') === 'true' || process.env.TELEGRAM_BOT_ENABLED === 'true';
    const token = dbManager.getSetting('telegram_bot_token') || process.env.TELEGRAM_BOT_TOKEN;

    if (!enabled || !token) {
      console.log('[telegram] Bot bridge is disabled or missing token.');
      return;
    }

    if (this.polling) return;
    this.polling = true;
    this.abortController = new AbortController();
    console.log('[telegram] Starting Telegram bot bridge polling...');

    this.pollLoop(token);
  }

  stop(): void {
    if (this.polling) {
      this.polling = false;
      this.abortController?.abort();
      this.abortController = null;
      console.log('[telegram] Telegram bot bridge stopped.');
    }
  }

  async restart(): Promise<void> {
    this.stop();
    await this.start();
  }

  private async pollLoop(token: string): Promise<void> {
    const allowedId = dbManager.getSetting('telegram_allowed_id') || process.env.TELEGRAM_ALLOWED_ID;

    while (this.polling) {
      try {
        const url = `https://api.telegram.org/bot${token}/getUpdates?offset=${this.offset}&timeout=20`;
        const res = await fetch(url, { signal: this.abortController?.signal });
        if (!res.ok) {
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        const data = await res.json() as { ok: boolean; result?: any[] };
        if (data.ok && Array.isArray(data.result)) {
          for (const update of data.result) {
            this.offset = update.update_id + 1;
            const message = update.message;
            if (!message || !message.text) continue;

            const senderId = String(message.from?.id || '');
            if (allowedId && senderId !== allowedId) {
              console.log(`[telegram] Ignored message from unauthorized user: ${senderId}`);
              continue;
            }

            const text = message.text;
            const chatId = message.chat.id;

            // Forward to local chat API
            try {
              const activeCharId = dbManager.getSetting('active_character_id') || 'kanata';
              const chatRes = await fetch('http://127.0.0.1:8800/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  characterId: activeCharId,
                  message: text
                })
              });

              if (chatRes.ok) {
                // Read text stream to gather response
                const replyText = await chatRes.text();
                // Extract clean text from sse chunks
                let cleanReply = '';
                for (const line of replyText.split('\n')) {
                  if (line.startsWith('data:')) {
                    try {
                      const parsed = JSON.parse(line.slice(5).trim());
                      if (parsed.type === 'token') cleanReply += parsed.token;
                      if (parsed.type === 'done' && parsed.message?.content) cleanReply = parsed.message.content;
                    } catch {}
                  }
                }

                if (cleanReply) {
                  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      chat_id: chatId,
                      text: cleanReply
                    })
                  });
                }
              }
            } catch (err) {
              console.error('[telegram] Relay error:', err);
            }
          }
        }
      } catch (e: any) {
        if (!this.polling) break;
        await new Promise(r => setTimeout(r, 4000));
      }
    }
  }
}

export const telegramBotBridge = new TelegramBotBridge();
