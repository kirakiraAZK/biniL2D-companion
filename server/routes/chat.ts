import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { wsHub } from '../ws/ws-hub';
import { buildConversationMessages } from '../ai/prompt-builder';
import { streamAI } from '../ai/provider-factory';
import { StreamTagParser } from '../parser/stream-tag-parser';
import { ttsManager } from '../tts/tts-manager';
import { moodService } from '../services/mood';
import { weatherService } from '../services/weather';
import { backgroundService } from '../services/background';

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

    return reply.send(messages);
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

  // GET weather
  app.get('/api/weather', async (_req, reply) => {
    const data = await weatherService.fetchWeather();
    return reply.send({
      enabled: dbManager.isFeatureEnabled('weather_enabled', false),
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

    const promptMessages = buildConversationMessages(character, history, message);

    // Set up streaming response via SSE or Fastify reply
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    const sentencesForTTS: string[] = [];
    let firstSentenceSent = false;
    let firstAudioUrl: string | null = null;

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
            c.id.toLowerCase().endsWith(`::${valLower}`)
          );
          const resolvedSlug = matched ? matched.costume_slug : tag.value;
          dbManager.setActiveCostume(character.id, resolvedSlug);
          wsHub.broadcast({
            type: 'change_costume',
            character_id: character.id,
            costume_id: resolvedSlug,
            name: matched ? matched.name : resolvedSlug
          });
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
              type: 'chat',
              reply: result.cleanText,
              emotion: result.emotion,
              audio_url: firstAudioUrl,
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
        } catch (ttsErr) {
          console.warn('[chat] TTS synthesis error:', ttsErr);
        }
      } else {
        // No TTS: broadcast reply without audio
        wsHub.broadcast({
          type: 'chat',
          reply: result.cleanText,
          emotion: result.emotion,
          character_id: character.id
        });
      }

      // Save assistant message to database
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
        costume: result.costume,
        audio_url: firstAudioUrl
      });

      reply.raw.write(`data: ${JSON.stringify({
        type: 'done',
        message: assistantMsg,
        thought: result.thoughtText,
        debug: {
          raw_output: result.rawText,
          clean_text: result.cleanText,
          thought_text: result.thoughtText,
          emotion: result.emotion,
          motion: result.motion,
          costume: result.costume,
          provider: character.ai_provider,
          model: character.ai_model,
          latency_ms: latencyMs,
          prompt_messages: promptMessages
        }
      })}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      console.error('[chat] LLM streaming error:', err);
      wsHub.log('AI', `LLM Stream Error: ${err.message}`, { error: String(err) });
      const fallbackText = "Sorry, I had trouble reaching my AI provider. Please check your API key in Settings.";
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message || fallbackText })}\n\n`);
      reply.raw.end();
    }
  });
}
