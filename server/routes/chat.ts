import { FastifyInstance } from 'fastify';
import { dbManager } from '../db/client';
import { wsHub } from '../ws/ws-hub';
import { buildConversationMessages } from '../ai/prompt-builder';
import { streamAI } from '../ai/provider-factory';
import { StreamTagParser } from '../parser/stream-tag-parser';
import { ttsManager } from '../tts/tts-manager';

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
    const messages = dbManager.getMessages(id, 100);
    return reply.send(messages);
  });

  // DELETE messages / clear history
  app.delete('/api/conversations/:id/messages', async (req, reply) => {
    const { id } = req.params as { id: string };
    dbManager.clearMessages(id);
    return reply.send({ ok: true });
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
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

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
          dbManager.setActiveCostume(character.id, tag.value);
          wsHub.broadcast({
            type: 'change_costume',
            character_id: character.id,
            costume_id: tag.value
          });
        }
      },
      onSentenceComplete: (sentence) => {
        sentencesForTTS.push(sentence);
      }
    });

    try {
      const stream = streamAI(character, promptMessages);
      for await (const chunk of stream) {
        parser.feed(chunk);
      }

      const result = parser.flush();

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
        raw_content: result.rawText,
        emotion: result.emotion,
        expression: result.expression,
        motion: result.motion,
        costume: result.costume,
        audio_url: firstAudioUrl
      });

      reply.raw.write(`data: ${JSON.stringify({ type: 'done', message: assistantMsg })}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      console.error('[chat] LLM streaming error:', err);
      const fallbackText = "Sorry, I had trouble reaching my AI provider. Please check your API key in Settings.";
      reply.raw.write(`data: ${JSON.stringify({ type: 'error', error: err.message || fallbackText })}\n\n`);
      reply.raw.end();
    }
  });
}
