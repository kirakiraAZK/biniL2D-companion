import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { wsHub } from '../ws/ws-hub';
import { buildConversationMessages } from '../ai/prompt-builder';
import { streamAI } from '../ai/provider-factory';
import { StreamTagParser } from '../parser/stream-tag-parser';
import { ttsManager } from '../tts/tts-manager';
import { moodService } from '../services/mood';
import { weatherService } from '../services/weather';
import { musicService, TrackInfo } from '../services/music';
import { workConnectors } from '../connectors/work';
import { freshRssClient } from '../connectors/freshrss';
import { backgroundService } from '../services/background';
import { classifyAIError } from '../ai/error-classifier';

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  // GET conversations for character
  app.get('/api/conversations', async (req, reply) => {
    const { characterId } = req.query as { characterId?: string };
    const charId = characterId || 'kanata';
    const conv = dbManager.getOrCreateConversation(charId);
    return reply.send(conv);
  });

  // GET messages for conversation
  app.get('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    let messages = dbManager.getMessages(id, 100);

    // If conversation is brand new, seed first_message from character if available
    if (messages.length === 0) {
      try {
        const conv = (dbManager as any).db.prepare('SELECT character_id FROM conversations WHERE id = ?').get(id) as { character_id: string } | undefined;
        if (conv) {
          const character = dbManager.getCharacter(conv.character_id);
          if (character && character.first_message && character.first_message.trim()) {
            const raw = character.first_message.trim();
            const match = /^\[([A-Z]+)\]\s*(.*)$/.exec(raw);
            const emotion = match ? match[1] : 'HAPPY';
            const content = match ? match[2] : raw;
            const firstMsg = dbManager.addMessage({
              conversation_id: id,
              role: 'assistant',
              character_id: character.id,
              character_name: character.display_name || character.name,
              content,
              raw_content: raw,
              emotion
            });
            messages = [firstMsg];
          }
        }
      } catch {}
    }

    // GET messages for conversation
    const mapped = messages.map((m) => {
      let cards: any[] = [];
      let music_track: any = null;
      try {
        if (m.cards_json) cards = JSON.parse(m.cards_json);
      } catch {}
      try {
        if (m.music_track_json) music_track = JSON.parse(m.music_track_json);
      } catch {}
      return {
        ...m,
        cards,
        music_track
      };
    });

    return reply.send(mapped);
  });

  // DELETE messages / clear history
  app.delete('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    dbManager.clearMessages(id);
    return reply.send({ ok: true });
  });

  // GET character mood
  app.get('/api/characters/:id/mood', async (req, reply) => {
    const { id } = req.params as { id: string };
    const score = moodService.getMood(id);
    const bracket = moodService.getBracket(score);
    return reply.send({
      score,
      bracket,
      enabled: dbManager.isFeatureEnabled('mood_enabled', true)
    });
  });

  // POST set / reset character mood
  app.post('/api/characters/:id/mood', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { score } = req.body as { score?: number };
    const newScore = score !== undefined ? Math.max(0, Math.min(100, Math.round(score))) : 70;
    moodService.setMood(id, newScore);
    const bracket = moodService.getBracket(newScore);
    return reply.send({ score: newScore, bracket });
  });

  // POST canvas touch interaction
  app.post('/api/interactions/touch', async (req, reply) => {
    const { characterId, area } = (req.body as { characterId?: string; area?: 'head' | 'body' }) || {};
    const charId = characterId || 'kanata';
    backgroundService.touchInteraction();
    const result = moodService.poke(charId, area || 'body');

    wsHub.broadcast({
      type: 'chat_emotion',
      emotion: result.emotion,
      character_id: charId
    });
    wsHub.broadcast({
      type: 'chat_motion',
      motion: result.motion,
      character_id: charId
    });

    return reply.send(result);
  });

  // GET weather (supports optional ?city=... query for instant preview & test)
  app.get('/api/weather', async (req, reply) => {
    const { city } = (req.query as { city?: string }) || {};
    const data = await weatherService.fetchWeather(city);
    return reply.send({
      enabled: dbManager.isFeatureEnabled('weather_enabled', false),
      configuredCity: city || dbManager.getRuntimeSetting('weather_city', ''),
      data
    });
  });

  // GET debug logs
  app.get('/api/debug/logs', async (req, reply) => {
    const { limit } = (req.query as { limit?: string }) || {};
    const count = parseInt(limit || '100', 10);
    return reply.send({ logs: wsHub.getRecentLogs(count) });
  });

  // DELETE debug logs
  app.delete('/api/debug/logs', async (_req, reply) => {
    wsHub.clearLogs();
    return reply.send({ ok: true });
  });

  // GET debug engine state
  app.get('/api/debug/state', async (_req, reply) => {
    const characters = dbManager.getAllCharacters().map(c => ({
      id: c.id,
      name: c.name,
      display_name: c.display_name,
      active_costume_id: c.active_costume_id,
      costumes: dbManager.getCostumesForCharacter(c.id).map(cs => ({
        id: cs.id,
        costume_slug: cs.costume_slug,
        name: cs.name,
        model_path: cs.model_path
      })),
      mood: moodService.getMood(c.id),
      bracket: moodService.getBracket(moodService.getMood(c.id))
    }));

    return reply.send({
      characters,
      settings: dbManager.getAllRuntimeSettings(),
      time: Date.now(),
      ws_clients: wsHub.clientCount
    });
  });

  // POST /api/chat — Streaming chat with emotion parsing and TTS
  app.post('/api/chat', async (req, reply) => {
    const {
      characterId,
      message,
      conversationId: reqConvId
    } = req.body as {
      characterId?: string;
      message: string;
      conversationId?: string;
    };

    if (!message || !message.trim()) {
      return reply.status(400).send({ error: 'Message cannot be empty' });
    }

    const characters = dbManager.getAllCharacters();
    const character = (characterId && dbManager.getCharacter(characterId)) || characters[0];
    if (!character) {
      return reply.status(404).send({ error: 'No active character found' });
    }

    const conv = reqConvId
      ? { id: reqConvId }
      : dbManager.getOrCreateConversation(character.id);

    // Touch user interaction timestamp for idle tracking
    backgroundService.touchInteraction();

    // Adjust companion mood based on message sentiment if enabled
    moodService.applySentiment(character.id, message);

    // Save user message
    const userMsg = dbManager.addMessage({
      conversation_id: conv.id,
      role: 'user',
      content: message.trim(),
      raw_content: message.trim()
    });

    // Notify WebSocket clients of user message
    wsHub.broadcast({
      type: 'user_message',
      message: userMsg
    });

    // Fetch conversation history
    const historyRows = dbManager.getMessages(conv.id, 20);
    const history = historyRows
      .filter(m => m.id !== userMsg.id && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content, created_at: m.created_at }));

    // 1. Gather dynamic real-time weather context (if weather tool is enabled)
    let weatherContext: string | null = null;
    if (dbManager.isFeatureEnabled('weather_enabled', false)) {
      try {
        weatherContext = await weatherService.getWeatherPromptContext();
      } catch (err: any) {
        console.warn('[chat] Failed to fetch weather context:', err.message);
      }
    }

    // 2. Gather dynamic work & external schedule context (Notion, Calendar, FreshRSS)
    let connectorContext: string | null = null;
    try {
      const feedKeywords: string[] = JSON.parse(character.feed_keywords_json || '[]');
      connectorContext = await workConnectors.getWorkAndConnectorContext(feedKeywords);
    } catch (err: any) {
      console.warn('[chat] Failed to fetch connector context:', err.message);
    }

    const promptMessages = buildConversationMessages(character, history, message, {
      weatherContext,
      connectorContext
    });

    // Set up streaming response via SSE or Fastify reply
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    const sentencesForTTS: string[] = [];
    let firstSentenceSent = false;
    let firstAudioUrl: string | null = null;
    let resolvedMusicTrack: TrackInfo | null = null;
    let detectedCostumeSlug: string = '';
    const resolvedCards: Array<{ type: 'weather' | 'calendar' | 'tasks' | 'news'; data: any }> = [];

    const emitCard = async (cardType: 'weather' | 'calendar' | 'tasks' | 'news', value?: string) => {
      if (resolvedCards.some(c => c.type === cardType)) return;
      try {
        let cardData: any = null;
        if (cardType === 'weather') {
          cardData = await weatherService.fetchWeather(value || undefined);
        } else if (cardType === 'calendar') {
          cardData = await workConnectors.getUpcomingCalendarEvents();
        } else if (cardType === 'tasks') {
          cardData = await workConnectors.getNotionTasks();
        } else if (cardType === 'news') {
          const feedKeywords: string[] = JSON.parse(character.feed_keywords_json || '[]');
          cardData = await freshRssClient.fetchArticles(feedKeywords);
        }

        if (cardData && (!Array.isArray(cardData) || cardData.length > 0 || cardType === 'calendar' || cardType === 'tasks')) {
          resolvedCards.push({ type: cardType, data: cardData });
          reply.raw.write(`data: ${JSON.stringify({ type: 'card', cardType, data: cardData })}\n\n`);
          wsHub.broadcast({
            type: 'chat_card',
            cardType,
            data: cardData,
            character_id: character.id
          });
        }
      } catch (err: any) {
        console.warn(`[chat] Failed to resolve card "${cardType}":`, err.message);
      }
    };

    const parser = new StreamTagParser({
      onCleanToken: (token) => {
        // Stream token to HTTP client via SSE
        reply.raw.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`);

        // Also stream token to WebSocket clients
        wsHub.broadcast({
          type: 'stream_token',
          token,
          character_id: character.id
        });
      },
      onThoughtChunk: (thoughtChunk) => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'thought', thought: thoughtChunk })}\n\n`);
      },
      onTag: (tag) => {
        if (tag.type === 'emotion') {
          wsHub.broadcast({
            type: 'chat_emotion',
            emotion: tag.value,
            character_id: character.id
          });
        } else if (tag.type === 'expression') {
          wsHub.broadcast({
            type: 'chat_expression',
            expression: tag.value,
            character_id: character.id
          });
        } else if (tag.type === 'motion') {
          wsHub.broadcast({
            type: 'chat_motion',
            motion: tag.value,
            character_id: character.id
          });
        } else if (tag.type === 'costume') {
          const costumes = dbManager.getCostumesForCharacter(character.id);
          const valLower = tag.value.trim().toLowerCase();
          const matched = costumes.find(c =>
            c.costume_slug.toLowerCase() === valLower ||
            c.id.toLowerCase() === valLower ||
            c.name.toLowerCase() === valLower ||
            c.id.toLowerCase().endsWith(`::${valLower}`) ||
            c.name.toLowerCase().includes(valLower) ||
            valLower.includes(c.name.toLowerCase()) ||
            c.costume_slug.toLowerCase().includes(valLower) ||
            (valLower.includes('summer') && c.name.toLowerCase().includes('summer')) ||
            (valLower.includes('casual') && c.name.toLowerCase().includes('casual')) ||
            (valLower.includes('biasa') && (c.name.toLowerCase().includes('biasa') || c.costume_slug.includes('nrml') || c.costume_slug.includes('cmmn')))
          );
          const resolvedSlug = matched ? matched.costume_slug : tag.value;
          detectedCostumeSlug = resolvedSlug;
          dbManager.setActiveCostume(character.id, resolvedSlug);
          reply.raw.write(`data: ${JSON.stringify({ type: 'costume', costume: resolvedSlug })}\n\n`);
          wsHub.broadcast({
            type: 'change_costume',
            character_id: character.id,
            costume_id: resolvedSlug,
            name: matched ? matched.name : resolvedSlug
          });
        } else if (tag.type === 'music') {
          void musicService.resolveTrack(tag.value, character.display_name || character.name).then(track => {
            if (track) {
              resolvedMusicTrack = track;
              reply.raw.write(`data: ${JSON.stringify({ type: 'music', track })}\n\n`);
              wsHub.broadcast({
                type: 'chat_music',
                track,
                character_id: character.id
              });
            }
          }).catch(e => {
            console.warn('[chat] Failed to resolve music tag in stream:', e.message);
          });
        } else if (tag.type === 'card' && tag.cardType) {
          void emitCard(tag.cardType, tag.value);
        }
      },
      onSentenceComplete: (sentence) => {
        sentencesForTTS.push(sentence);
      }
    });

    const chatStartTime = Date.now();
    wsHub.log('AI', `Incoming User Chat: "${message.slice(0, 60)}"`, {
      character: character.name,
      provider: character.ai_provider,
      history_count: history.length
    });

    try {
      const stream = streamAI(character, promptMessages);
      for await (const chunk of stream) {
        parser.feed(chunk);
      }

      const result = parser.flush();
      const latencyMs = Date.now() - chatStartTime;

      wsHub.log('AI', `AI Output Complete (${latencyMs}ms)`, {
        raw_length: result.rawText.length,
        clean_length: result.cleanText.length,
        emotion: result.emotion,
        motion: result.motion,
        costume: result.costume,
        has_thought: !!result.thoughtText
      });

      // Trigger TTS synthesis for accumulated sentences
      if (character.tts_enabled && sentencesForTTS.length > 0) {
        // Synthesize first sentence immediately
        try {
          firstAudioUrl = await ttsManager.synthesizeSentence({
            text: sentencesForTTS[0],
            emotion: result.emotion,
            character
          });

          if (firstAudioUrl) {
            wsHub.broadcast({
              type: 'chat_audio',
              audio_url: firstAudioUrl,
              emotion: result.emotion,
              character_id: character.id
            });
            reply.raw.write(`data: ${JSON.stringify({ type: 'audio', audio_url: firstAudioUrl })}\n\n`);
          }

          // Asynchronously synthesize remaining sentences
          if (sentencesForTTS.length > 1) {
            void ttsManager.streamSentences(
              sentencesForTTS.slice(1),
              character,
              result.emotion,
              (chunkUrl, idx, total) => {
                wsHub.broadcast({
                  type: 'audio_continue',
                  audio_url: chunkUrl,
                  chunk: idx,
                  total: total,
                  character_id: character.id
                });
              }
            );
          }
        } catch (ttsErr: any) {
          console.warn('[chat] TTS synthesis error:', ttsErr);
          wsHub.reportIssue('TTS', 'Voice synthesis failed', ttsErr, 'warn');
        }
      }

      // If music tag was captured during flush but not yet resolved
      if (!resolvedMusicTrack && result.music) {
        try {
          resolvedMusicTrack = await musicService.resolveTrack(result.music, character.display_name || character.name);
          if (resolvedMusicTrack) {
            reply.raw.write(`data: ${JSON.stringify({ type: 'music', track: resolvedMusicTrack })}\n\n`);
          }
        } catch (e: any) {
          console.warn('[chat] Failed to resolve music after flush:', e.message);
        }
      }

      // If card tags were captured during flush
      if (result.cards && result.cards.length > 0) {
        for (const c of result.cards) {
          await emitCard(c.type, c.value);
        }
      }

      // Hybrid Fallback: If relevant questions were asked and features are enabled but tag was missed
      const combinedLower = `${message} ${result.cleanText} ${result.rawText}`.toLowerCase();
      if (
        !resolvedCards.some((c) => c.type === 'weather') &&
        dbManager.isFeatureEnabled('weather_enabled', false) &&
        /\b(weather|temperature|forecast|rain|raining|rainy|cloudy|sunny|cuaca|hujan|suhu|derajat)\b/i.test(combinedLower)
      ) {
        await emitCard('weather');
      }

      if (
        !resolvedCards.some((c) => c.type === 'calendar') &&
        workConnectors.isCalendarEnabled() &&
        /\b(calendar|schedule|meeting|agenda|events|appointment|jadwal|acara|rapat)\b/i.test(combinedLower)
      ) {
        await emitCard('calendar');
      }

      if (
        !resolvedCards.some((c) => c.type === 'tasks') &&
        workConnectors.isNotionEnabled() &&
        /\b(tasks?|notion|todo|to-do|todos|tugas|kerjaan|pekerjaan)\b/i.test(combinedLower)
      ) {
        await emitCard('tasks');
      }

      if (
        !resolvedCards.some((c) => c.type === 'news') &&
        dbManager.isFeatureEnabled('freshrss_enabled', false) &&
        /\b(news|headlines?|articles?|feed|rss|berita|kabar)\b/i.test(combinedLower)
      ) {
        await emitCard('news');
      }

      // Hybrid Fallback: Auto-detect costume change if user requested it or AI agreed, but tag was omitted or flushed
      let finalCostume = detectedCostumeSlug || result.costume || '';
      const characterCostumes = dbManager.getCostumesForCharacter(character.id);
      if (!finalCostume) {
        const costumeKeywords = /\b(ganti|ubah|pakai|gantiin|switch|change|wear|costume|outfit|baju|kostum|pakaian)\b/i;
        if (costumeKeywords.test(combinedLower)) {
          for (const c of characterCostumes) {
            const nameLower = c.name.toLowerCase();
            const slugLower = c.costume_slug.toLowerCase();
            const isMatch =
              combinedLower.includes(nameLower) ||
              combinedLower.includes(slugLower) ||
              (nameLower.includes('summer') && (combinedLower.includes('summer') || combinedLower.includes('pantai') || combinedLower.includes('renang'))) ||
              (nameLower.includes('casual') && (combinedLower.includes('casual') || combinedLower.includes('santai'))) ||
              ((nameLower.includes('cmmn') || nameLower.includes('nrml') || nameLower.includes('default')) && (combinedLower.includes('biasa') || combinedLower.includes('normal') || combinedLower.includes('awal') || combinedLower.includes('asli')));
            if (isMatch) {
              finalCostume = c.costume_slug;
              break;
            }
          }
        }
      }

      if (finalCostume) {
        const valLower = finalCostume.trim().toLowerCase();
        const matched = characterCostumes.find(c =>
          c.costume_slug.toLowerCase() === valLower ||
          c.id.toLowerCase() === valLower ||
          c.name.toLowerCase() === valLower ||
          c.id.toLowerCase().endsWith(`::${valLower}`) ||
          c.name.toLowerCase().includes(valLower) ||
          valLower.includes(c.name.toLowerCase()) ||
          c.costume_slug.toLowerCase().includes(valLower) ||
          (valLower.includes('summer') && c.name.toLowerCase().includes('summer')) ||
          (valLower.includes('casual') && c.name.toLowerCase().includes('casual')) ||
          (valLower.includes('biasa') && (c.name.toLowerCase().includes('biasa') || c.costume_slug.includes('nrml') || c.costume_slug.includes('cmmn')))
        );
        const resolvedSlug = matched ? matched.costume_slug : finalCostume;
        finalCostume = resolvedSlug;
        dbManager.setActiveCostume(character.id, resolvedSlug);
        wsHub.broadcast({
          type: 'change_costume',
          character_id: character.id,
          costume_id: resolvedSlug,
          name: matched ? matched.name : resolvedSlug
        });
      }

      // Save assistant message to database with persisted cards, music, and costume
      const assistantMsg = dbManager.addMessage({
        conversation_id: conv.id,
        role: 'assistant',
        character_id: character.id,
        character_name: character.display_name || character.name,
        content: result.cleanText,
        thought: result.thoughtText || null,
        raw_content: result.rawText,
        emotion: result.emotion,
        expression: result.expression,
        motion: result.motion,
        costume: finalCostume,
        audio_url: firstAudioUrl,
        cards_json: JSON.stringify(resolvedCards),
        music_track_json: resolvedMusicTrack ? JSON.stringify(resolvedMusicTrack) : ''
      });

      if (result.cleanText) {
        // Broadcast complete reply to WebSocket clients (e.g. passive browser tabs or bridges)
        wsHub.broadcast({
          type: 'chat',
          message_id: assistantMsg.id,
          reply: result.cleanText,
          emotion: result.emotion,
          motion: result.motion,
          costume: finalCostume,
          thought: result.thoughtText,
          raw_content: result.rawText,
          audio_url: firstAudioUrl,
          cards: resolvedCards,
          music_track: resolvedMusicTrack,
          created_at: assistantMsg.created_at,
          character_id: character.id
        });
      }

      reply.raw.write(`data: ${JSON.stringify({
        type: 'done',
        message: assistantMsg,
        thought: result.thoughtText,
        music_track: resolvedMusicTrack,
        cards: resolvedCards,
        costume: finalCostume,
        debug: {
          raw_output: result.rawText,
          clean_text: result.cleanText,
          thought_text: result.thoughtText,
          emotion: result.emotion,
          motion: result.motion,
          costume: finalCostume,
          provider: character.ai_provider,
          model: character.ai_model,
          latency_ms: latencyMs,
          prompt_messages: promptMessages
        }
      })}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      const classified = classifyAIError(err, undefined, character.ai_provider);
      console.error('[chat] LLM streaming error:', classified.title, err);
      wsHub.log('AI', classified.title, classified, 'error');
      reply.raw.write(`data: ${JSON.stringify({
        type: 'error',
        error: classified.message,
        code: classified.code,
        title: classified.title,
        hint: classified.hint,
        provider: classified.provider,
        retryable: classified.retryable,
        raw_error: classified.rawError
      })}\n\n`);
      reply.raw.end();
    }
  });
}
