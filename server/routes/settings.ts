import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { telegramBotBridge } from '../bridges/telegram-bot';
import { discordBotBridge } from '../bridges/discord-bot';
import { classifyAIError } from '../ai/error-classifier';
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

      // Default: OpenAI or OpenAI-Compatible (LM Studio, Ollama, Groq, vLLM, OpenRouter, 9Router, etc.)
      let normalizedBase = rawBase.replace(/\/+$/, '');
      if (prov === 'openai' && !/\/v1$/i.test(normalizedBase) && !normalizedBase.includes('/api/')) {
        normalizedBase = `${normalizedBase}/v1`;
      }
      const endpoint = `${normalizedBase}/models`;
      const headers: Record<string, string> = {};
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);

      const res = await fetch(endpoint, { headers, signal: controller.signal });
      clearTimeout(timer);

      if (!res.ok) {
        const err = await res.text().catch(() => '');
        return reply.status(res.status).send({ error: `Provider returned HTTP ${res.status}: ${err}` });
      }

      const json = await res.json() as { data?: Array<{ id: string; owned_by?: string }> };
      const rawData = json.data || [];
      const combos = rawData.filter(m => m.owned_by === 'combo').map(m => m.id).sort();
      const regularModels = rawData.filter(m => m.owned_by !== 'combo').map(m => m.id).sort();
      const models = [...combos, ...regularModels];
      return reply.send({ ok: true, models, combos });
    } catch (e: any) {
      console.warn('[settings] Failed to fetch models:', e.message);
      return reply.status(500).send({ error: `Failed to fetch models: ${e.message}` });
    }
  });

  // POST /api/ai/test — Direct connectivity ping test for AI Brain settings
  app.post('/api/ai/test', async (req, reply) => {
    const { provider, baseUrl, apiKey, model } = req.body as {
      provider?: string;
      baseUrl?: string;
      apiKey?: string;
      model?: string;
    };

    const prov = (provider || dbManager.getSetting('ai_provider') || 'openai').toLowerCase();
    const key = apiKey || dbManager.getSetting(`${prov}_api_key`) || dbManager.getSetting('openai_api_key') || process.env.OPENAI_API_KEY || '';
    let rawBase = baseUrl || dbManager.getSetting('openai_base_url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    rawBase = rawBase.replace(/\/+$/, '');
    if (prov === 'openai' && !/\/v1$/i.test(rawBase) && !rawBase.includes('/api/')) {
      rawBase = `${rawBase}/v1`;
    }
    const targetModel = model || dbManager.getSetting(`${prov}_model`) || dbManager.getSetting('openai_model') || (prov === 'claude' ? 'claude-3-5-haiku-20241022' : prov === 'gemini' ? 'gemini-1.5-flash' : 'gpt-4o-mini');

    const startTime = Date.now();
    try {
      if (prov === 'claude' || prov === 'anthropic') {
        if (!key) throw new Error('Anthropic API key is required');
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': '2023-06-01'
          },
          body: JSON.stringify({
            model: targetModel,
            max_tokens: 15,
            messages: [{ role: 'user', content: 'Ping' }]
          })
        });
        const latencyMs = Date.now() - startTime;
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Claude HTTP ${res.status}: ${errText}`);
        }
        const data = await res.json() as any;
        const preview = data.content?.[0]?.text || 'OK';
        return reply.send({ ok: true, latency_ms: latencyMs, provider: 'Claude', model: targetModel, preview });
      }

      if (prov === 'gemini' || prov === 'google') {
        if (!key) throw new Error('Gemini API key is required');
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${key}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'Ping' }] }],
            generationConfig: { maxOutputTokens: 15 }
          })
        });
        const latencyMs = Date.now() - startTime;
        if (!res.ok) {
          const errText = await res.text().catch(() => '');
          throw new Error(`Gemini HTTP ${res.status}: ${errText}`);
        }
        const data = await res.json() as any;
        const preview = data.candidates?.[0]?.content?.parts?.[0]?.text || 'OK';
        return reply.send({ ok: true, latency_ms: latencyMs, provider: 'Gemini', model: targetModel, preview });
      }

      // Default: OpenAI or OpenAI-Compatible (9Router, Ollama, LM Studio, vLLM, etc.)
      const endpoint = `${rawBase}/chat/completions`;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (key) headers['Authorization'] = `Bearer ${key}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 25000);

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: 'user', content: 'Ping' }],
          max_tokens: 15,
          stream: false
        }),
        signal: controller.signal
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startTime;

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const rawText = await res.text();
      let preview = 'OK';
      try {
        const data = JSON.parse(rawText);
        preview = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || 'OK';
      } catch {
        // Fallback for providers that stream response despite stream: false
        const match = rawText.match(/"content"\s*:\s*"([^"]+)"/);
        if (match) preview = match[1];
      }

      return reply.send({
        ok: true,
        latency_ms: latencyMs,
        provider: prov === 'openai' ? 'OpenAI / Compatible' : prov,
        model: targetModel,
        preview
      });
    } catch (e: any) {
      const latencyMs = Date.now() - startTime;
      const classified = classifyAIError(e, undefined, prov);
      return reply.status(200).send({
        ok: false,
        error: e.message,
        latency_ms: latencyMs,
        classified
      });
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
