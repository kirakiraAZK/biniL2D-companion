import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { telegramBotBridge } from '../bridges/telegram-bot';
import { discordBotBridge } from '../bridges/discord-bot';
import path from 'node:path';
import fs from 'node:fs';

export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  // GET global settings
  app.get('/api/settings', async (_req, reply) => {
    const s = dbManager.getSettings();
    return reply.send(s);
  });

  // PUT update global settings
  app.put('/api/settings', async (req, reply) => {
    const body = req.body as Record<string, string>;
    if (body && typeof body === 'object') {
      for (const [key, val] of Object.entries(body)) {
        dbManager.setSetting(key, String(val));
        dbManager.setRuntimeSetting(key, String(val));
      }
      // Re-evaluate bridges in the background if bot settings were touched
      void telegramBotBridge.restart();
      void discordBotBridge.restart();
    }
    return reply.send({ ok: true, settings: dbManager.getSettings() });
  });

  // POST /api/ai/models — Fetch available model names from provider without manual typing
  app.post('/api/ai/models', async (req, reply) => {
    const { provider, baseUrl, apiKey } = req.body as {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
    };

    const prov = (provider || dbManager.getSetting('ai_provider') || 'openai').toLowerCase();
    const key = apiKey || dbManager.getSetting(`${prov}_api_key`) || dbManager.getSetting('openai_api_key') || process.env.OPENAI_API_KEY || '';
    const rawBase = baseUrl || dbManager.getSetting('openai_base_url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';

    try {
      if (prov === 'claude' || prov === 'anthropic') {
        // Return known Claude models + try fetching if key provided
        const models = [
          'claude-3-5-sonnet-20241022',
          'claude-3-5-haiku-20241022',
          'claude-3-opus-20240229',
          'claude-3-sonnet-20240229',
          'claude-3-haiku-20240307'
        ];
        return reply.send({ ok: true, models });
      }

      if (prov === 'gemini' || prov === 'google') {
        if (!key) {
          return reply.status(400).send({ error: 'Gemini API key is required to fetch models.' });
        }
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) {
          const err = await res.text().catch(() => '');
          return reply.status(res.status).send({ error: `Gemini API error: ${err}` });
        }
        const json = await res.json() as { models?: Array<{ name: string }> };
        const models = (json.models || [])
          .map(m => m.name.replace(/^models\//, ''))
          .filter(name => name.includes('gemini'));
        return reply.send({ ok: true, models: models.length ? models : ['gemini-1.5-flash', 'gemini-1.5-pro'] });
      }

      // Default: OpenAI or OpenAI-Compatible (LM Studio, Ollama, Groq, vLLM, OpenRouter, etc.)
      const endpoint = `${rawBase.replace(/\/+$/, '')}/models`;
      const headers: Record<string, string> = {};
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);

      const res = await fetch(endpoint, { headers, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return reply.status(res.status).send({ error: `Provider returned HTTP ${res.status}: ${err}` });
      }

      const json = await res.json() as { data?: Array<{ id: string }> };
      const models = (json.data || []).map(m => m.id).sort();
      return reply.send({ ok: true, models });
    } catch (e: any) {
      console.warn('[settings] Failed to fetch models:', e.message);
      return reply.status(500).send({ error: `Failed to fetch models: ${e.message}` });
    }
  });

  // POST /api/voice/upload — Upload custom voice sample for OmniVoice cloning
  app.post('/api/voice/upload', async (req, reply) => {
    const { characterId, filename, base64Data } = req.body as {
      characterId?: string;
      filename: string;
      base64Data: string;
    };

    if (!filename || !base64Data) {
      return reply.status(400).send({ error: 'Filename and base64Data are required' });
    }

    try {
      const char = characterId ? dbManager.getCharacter(characterId) : dbManager.getAllCharacters()[0];
      const audioDir = path.resolve(process.cwd(), 'audio', 'samples');
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      // Clean base64 header if present (e.g. data:audio/wav;base64,...)
      const cleanBase64 = base64Data.replace(/^data:audio\/[^;]+;base64,/, '');
      const buffer = Buffer.from(cleanBase64, 'base64');

      const safeName = `${Date.now()}_${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const filePath = path.join(audioDir, safeName);
      fs.writeFileSync(filePath, buffer);

      const voiceRefUrl = `/audio/samples/${safeName}`;

      // Update character with uploaded voice sample
      if (char) {
        dbManager.upsertCharacter({
          ...char,
          tts_enabled: 1,
          tts_voice_ref: voiceRefUrl
        });
      }

      // Also set as global default voice sample
      dbManager.setSetting('custom_voice_ref', voiceRefUrl);
      dbManager.setSetting('custom_voice_name', filename);

      console.log(`[voice] Uploaded custom voice sample: ${safeName} (${buffer.length} bytes)`);
      return reply.send({
        ok: true,
        voiceRef: voiceRefUrl,
        filename,
        size: buffer.length
      });
    } catch (err: any) {
      console.error('[voice] Upload failed:', err);
      return reply.status(500).send({ error: `Upload failed: ${err.message}` });
    }
  });
}
