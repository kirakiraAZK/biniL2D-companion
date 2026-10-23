import { omniVoiceEngine } from './engines/omnivoice';
import { edgeTTSEngine } from './engines/edge-tts';
import { CharacterRow, dbManager } from '../db/client';

export interface TTSRequestOptions {
  text: string;
  emotion?: string;
  character: CharacterRow;
}

export class TTSManager {
  async synthesizeSentence(options: TTSRequestOptions): Promise<string | null> {
    const { text, emotion, character } = options;

    // Check master TTS toggle in global settings
    const masterEnabled = dbManager.getSetting('tts_master_enabled');
    if (masterEnabled === 'false') return null;

    // Check character TTS toggle
    if (!character.tts_enabled) return null;

    // Check custom OmniVoice URL from settings if set
    const omniUrlSetting = dbManager.getSetting('omnivoice_api_url');
    if (omniUrlSetting) {
      omniVoiceEngine.setApiUrl(omniUrlSetting);
    }

    const enginePreference = character.tts_engine || dbManager.getSetting('tts_engine') || 'omnivoice';

    // Prioritize uploaded custom voice sample if present
    const customVoiceRef = character.tts_voice_ref || dbManager.getSetting('custom_voice_ref') || '';

    if (enginePreference === 'omnivoice') {
      const audioUrl = await omniVoiceEngine.synthesize({
        text,
        emotion: emotion || 'NEUTRAL',
        refAudio: customVoiceRef,
        instruct: character.tts_voice_instruct
      });

      if (audioUrl) return audioUrl;
      console.log('[tts] OmniVoice unavailable with custom voice sample');
    }

    // Check if fallback voice is allowed by user
    const allowFallback = dbManager.getSetting('tts_allow_fallback') !== 'false';
    if (!allowFallback) {
      console.log('[tts] Fallback voice is disabled by user. Skipping default synthesis.');
      return null;
    }

    // Fallback: Edge-TTS
    return await edgeTTSEngine.synthesize(
      text,
      character.tts_voice || 'ja-JP-NanamiNeural',
      character.tts_speed || 1.0
    );
  }

  async streamSentences(
    sentences: string[],
    character: CharacterRow,
    emotion: string,
    onChunk: (audioUrl: string, chunkIndex: number, total: number) => void
  ): Promise<void> {
    const masterEnabled = dbManager.getSetting('tts_master_enabled');
    if (masterEnabled === 'false' || !character.tts_enabled || sentences.length === 0) return;

    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      try {
        const audioUrl = await this.synthesizeSentence({
          text: sentence,
          emotion,
          character
        });

        if (audioUrl) {
          onChunk(audioUrl, i + 1, sentences.length);
        }
      } catch (e) {
        console.warn(`[tts] Sentence ${i + 1}/${sentences.length} synthesis failed:`, e);
      }
    }
  }
}

export const ttsManager = new TTSManager();
