import { dbManager } from '../db/client';
import { moodService } from './mood';
import { weatherService } from './weather';
import { freshRssClient } from '../connectors/freshrss';
import { streamAI } from '../ai/provider-factory';
import { StreamTagParser } from '../parser/stream-tag-parser';
import { ttsManager } from '../tts/tts-manager';
import { wsHub } from '../ws/ws-hub';

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

    // Build unprompted idle prompt
    let idlePrompt = '';
    const roll = Math.random();

    if (roll < 0.4) {
      // Memory follow-up
      const memories = dbManager.getMemories(character.id, 5);
      if (memories.length > 0) {
        const mem = memories[Math.floor(Math.random() * memories.length)];
        idlePrompt = `You remembered something about your user: "${mem.fact}". Bring it up naturally or tease them about it. Exactly ONE in-character spoken sentence. Start with an emotion tag like [HAPPY] or [SURPRISED].`;
      }
    } else if (roll < 0.7 && dbManager.isFeatureEnabled('weather_enabled', false)) {
      // Weather comment
      const summary = await weatherService.formatWeatherSummary();
      if (summary) {
        idlePrompt = `Current weather outside: ${summary}. Make a casual, in-character comment about the weather. Exactly ONE spoken sentence. Start with an emotion tag like [HAPPY] or [THINKING].`;
      }
    }

    if (!idlePrompt) {
      // Random thought / time comment
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      idlePrompt = `It is currently ${timeStr}. Your user has been quiet for a while. Say something spontaneous, teasing, humming, or comment on the time. Exactly ONE spoken sentence. Start with an emotion tag.`;
    }

    const messages = [
      {
        role: 'system' as const,
        content: `You are ${character.display_name || character.name}. You are talking directly to your companion. Always start with an emotion tag like [HAPPY], [SAD], [SURPRISED], [ANGRY], [THINKING], or [NEUTRAL]. Keep it to exactly 1 short sentence.`
      },
      {
        role: 'user' as const,
        content: `[SYSTEM AUTONOMOUS TRIGGER]: ${idlePrompt}`
      }
    ];

    let fullCleanText = '';
    let chosenEmotion = 'HAPPY';
    let chosenMotion: string | undefined;

    const parser = new StreamTagParser({
      onCleanToken: (token) => {
        fullCleanText += token;
      },
      onTag: (tag) => {
        if (tag.type === 'emotion') chosenEmotion = tag.value;
        if (tag.type === 'motion') chosenMotion = tag.value;
      }
    });

    const stream = streamAI(character, messages);
    for await (const chunk of stream) {
      parser.feed(chunk);
    }
    const result = parser.flush();

    const cleanReply = (result.cleanText || fullCleanText).trim();
    if (!cleanReply) return;

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
      character_id: character.id,
      message_id: savedMsg.id
    });

    console.log(`[background] Autonomous idle talk spoken: "${cleanReply}"`);
  }
}

export const backgroundService = new BackgroundService();
