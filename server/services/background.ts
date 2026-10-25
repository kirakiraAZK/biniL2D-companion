import { dbManager } from '../db/client';
import { moodService } from './mood';
import { weatherService } from './weather';
import { freshRssClient } from '../connectors/freshrss';
import { streamAI } from '../ai/provider-factory';
import { StreamTagParser } from '../parser/stream-tag-parser';
import { ttsManager } from '../tts/tts-manager';
import { wsHub } from '../ws/ws-hub';
import { buildSystemPrompt } from '../ai/prompt-builder';

class BackgroundService {
  private timer: NodeJS.Timeout | null = null;
  private lastUserInteraction: number = Date.now();
  private lastSleepState: boolean | null = null;
  private isProcessingIdle = false;
  private tickCount = 0;

  start(): void {
    if (this.timer) return;

    const pollSeconds = Number(
      dbManager.getRuntimeSetting('background_poll_seconds', process.env.BACKGROUND_POLL_SECONDS || '60')
    ) || 60;

    console.log(`[background] Starting background service (polling every ${pollSeconds}s)...`);
    this.timer = setInterval(() => this.tick(), pollSeconds * 1000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('[background] Stopped background service');
    }
  }

  touchInteraction(): void {
    this.lastUserInteraction = Date.now();
  }

  isAsleep(characterTimezone?: string): boolean {
    if (!dbManager.isFeatureEnabled('sleep_cycle_enabled', false)) {
      return false;
    }
    const tz = characterTimezone || dbManager.getRuntimeSetting('timezone', process.env.TIMEZONE || '');
    const now = new Date();
    let hour = now.getHours();
    try {
      if (tz) {
        const str = now.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', hour12: false });
        hour = parseInt(str, 10);
      }
    } catch {}
    // Sleep window: 00:00 to 05:00 (hours 0, 1, 2, 3, 4)
    return hour >= 0 && hour < 5;
  }

  private async tick(): Promise<void> {
    this.tickCount++;
    const characters = dbManager.getAllCharacters();
    if (characters.length === 0) return;

    const activeChar = characters[0]; // Primary companion

    // 1. Check Sleep Cycle state transition
    const asleep = this.isAsleep(activeChar.timezone);
    if (this.lastSleepState !== asleep) {
      this.lastSleepState = asleep;
      wsHub.broadcast({
        type: 'sleep_status',
        asleep,
        character_id: activeChar.id
      });
      console.log(`[background] Sleep cycle transition: asleep = ${asleep}`);
    }

    // 2. Mood Decay (every ~3 minutes / 3 ticks)
    if (this.tickCount % 3 === 0 && dbManager.isFeatureEnabled('mood_enabled', false)) {
      for (const char of characters) {
        moodService.decayMood(char.id);
      }
    }

    // 3. Autonomous Idle Talk
    if (dbManager.isFeatureEnabled('idle_talk_enabled', false) && !asleep && !this.isProcessingIdle) {
      const intervalHours = parseFloat(
        dbManager.getRuntimeSetting('idle_talk_interval_hours', process.env.IDLE_TALK_INTERVAL_HOURS || '0.5')
      ) || 0.5;
      const intervalMs = intervalHours * 3600 * 1000;
      const elapsed = Date.now() - this.lastUserInteraction;

      if (elapsed >= intervalMs) {
        console.log(`[background] User quiet for ${Math.round(elapsed / 60000)}m. Triggering autonomous idle talk...`);
        this.isProcessingIdle = true;
        try {
          await this.triggerIdleTalk(activeChar);
        } catch (e: any) {
          console.warn('[background] Idle talk error:', e.message);
        } finally {
          this.lastUserInteraction = Date.now();
          this.isProcessingIdle = false;
        }
      }
    }
  }

  private async triggerIdleTalk(character: any): Promise<void> {
    const conv = dbManager.getOrCreateConversation(character.id);
    const lang = (character.language || 'en').toLowerCase();

    // Owner context
    let ownerName = 'User';
    try {
      if (character.owner_json) {
        const parsed = JSON.parse(character.owner_json);
        if (parsed.name) ownerName = parsed.name;
      }
    } catch {}

    // Weather context if enabled
    let weatherContext: string | null = null;
    let weatherSummary = '';
    if (dbManager.isFeatureEnabled('weather_enabled', false)) {
      try {
        weatherContext = await weatherService.getWeatherPromptContext();
        weatherSummary = await weatherService.formatWeatherSummary();
      } catch (err: any) {
        console.warn('[background] Failed to get weather for idle talk:', err.message);
      }
    }

    // Build unprompted idle prompt matching character language
    let idlePrompt = '';
    const roll = Math.random();

    if (roll < 0.4) {
      // Memory follow-up
      const memories = dbManager.getMemories(character.id, 5);
      if (memories.length > 0) {
        const mem = memories[Math.floor(Math.random() * memories.length)];
        if (lang === 'id') {
          idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: Kamu tiba-tiba teringat tentang user-mu (${ownerName}): "${mem.fact}". Sapa atau goda mereka secara spontan dan akrab dalam Bahasa Indonesia santai (gunakan 'aku/kamu', partikel 'nih/dong/kan/lho'). Tepat SATU kalimat pendek yang manis atau agak jahil (playful). Selalu awali dengan SATU emotion tag seperti [HAPPY] atau [SURPRISED].`;
        } else {
          idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: You suddenly remembered something about your companion (${ownerName}): "${mem.fact}". Bring it up naturally or tease them about it. Exactly ONE short in-character spoken sentence. Always start with ONE emotion tag like [HAPPY] or [SURPRISED].`;
        }
      }
    } else if (roll < 0.7 && weatherSummary) {
      // Weather comment
      if (lang === 'id') {
        idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: Cuaca di luar saat ini: ${weatherSummary}. Berikan satu komentar spontan dan santai tentang cuaca ini atau ingatkan user (${ownerName}) dalam Bahasa Indonesia santai (gunakan 'aku/kamu', partikel 'nih/ya/lho'). Tepat SATU kalimat pendek. Selalu awali dengan SATU emotion tag seperti [HAPPY] atau [THINKING].`;
      } else {
        idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: Current weather outside: ${weatherSummary}. Make a casual, in-character comment about the weather to ${ownerName}. Exactly ONE short spoken sentence. Always start with ONE emotion tag like [HAPPY] or [THINKING].`;
      }
    }

    if (!idlePrompt) {
      // Random thought / time comment
      const now = new Date();
      let timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      try {
        const tz = character.timezone || dbManager.getRuntimeSetting('timezone', '');
        if (tz) {
          timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
        }
      } catch {}

      if (lang === 'id') {
        idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: Waktu menunjukkan pukul ${timeStr}. User (${ownerName}) sudah terdiam cukup lama di depan layar monitor. Sapa mereka secara spontan, tanyakan sedang sibuk apa, bersenandung, atau goda dengan santai dalam Bahasa Indonesia santai (gunakan 'aku/kamu', partikel 'nih/dong/ya'). Tepat SATU kalimat pendek yang ekspresif. Selalu awali dengan SATU emotion tag.`;
      } else {
        idlePrompt = `[AUTONOMOUS IDLE TRIGGER]: It is currently ${timeStr}. Your user (${ownerName}) has been quiet for a while. Say something spontaneous, teasing, humming, or comment on the time. Exactly ONE short spoken sentence. Always start with ONE emotion tag.`;
      }
    }

    // Build system prompt using character definition, personality, language, and guidelines
    const systemPrompt = buildSystemPrompt(character, { weatherContext });

    // Include recent 2-4 messages from conversation history for conversational continuity
    const historyRows = dbManager.getMessages(conv.id, 4);
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: systemPrompt }
    ];

    for (const h of historyRows) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: h.content });
      }
    }

    messages.push({
      role: 'user',
      content: idlePrompt
    });

    let fullCleanText = '';
    let chosenEmotion = 'HAPPY';
    let chosenMotion: string | undefined;
    let detectedCostumeSlug: string | undefined;

    const parser = new StreamTagParser({
      onCleanToken: (token) => {
        fullCleanText += token;
      },
      onTag: (tag) => {
        if (tag.type === 'emotion') chosenEmotion = tag.value;
        if (tag.type === 'motion') chosenMotion = tag.value;
        if (tag.type === 'costume') detectedCostumeSlug = tag.value;
      }
    });

    const stream = streamAI(character, messages);
    for await (const chunk of stream) {
      parser.feed(chunk);
    }
    const result = parser.flush();

    const cleanReply = (result.cleanText || fullCleanText).trim();
    if (!cleanReply) return;

    // Handle outfit change if triggered during idle talk
    const costumeSlug = result.costume || detectedCostumeSlug;
    if (costumeSlug) {
      const costumes = dbManager.getCostumesForCharacter(character.id);
      const matched = costumes.find(
        c => c.costume_slug.toLowerCase() === costumeSlug.toLowerCase() ||
             c.name.toLowerCase() === costumeSlug.toLowerCase()
      );
      if (matched && matched.id !== character.active_costume_id) {
        dbManager.updateCharacter(character.id, { active_costume_id: matched.id });
        wsHub.broadcast({
          type: 'costume_changed',
          character_id: character.id,
          costume_id: matched.id,
          costume_slug: matched.costume_slug,
          costume_name: matched.name,
          model_path: matched.model_path
        });
      }
    }

    // TTS synthesis if enabled
    let audioUrl: string | null = null;
    if (character.tts_enabled) {
      try {
        audioUrl = await ttsManager.synthesizeSentence({
          text: cleanReply,
          emotion: result.emotion || chosenEmotion,
          character
        });
      } catch (err: any) {
        console.warn('[background] Idle talk TTS failed:', err.message);
      }
    }

    // Save to conversation
    const savedMsg = dbManager.addMessage({
      conversation_id: conv.id,
      role: 'assistant',
      character_id: character.id,
      character_name: character.display_name || character.name,
      content: cleanReply,
      raw_content: result.rawText,
      emotion: result.emotion || chosenEmotion,
      motion: result.motion || chosenMotion,
      audio_url: audioUrl
    });

    // Broadcast live to UI via WebSocket
    wsHub.broadcast({
      type: 'chat',
      reply: cleanReply,
      emotion: result.emotion || chosenEmotion,
      motion: result.motion || chosenMotion,
      audio_url: audioUrl,
      costume: costumeSlug || undefined,
      raw_content: result.rawText,
      character_id: character.id,
      message_id: savedMsg.id,
      created_at: savedMsg.created_at
    });

    console.log(`[background] Autonomous idle talk spoken: "${cleanReply}"`);
  }
}

export const backgroundService = new BackgroundService();
