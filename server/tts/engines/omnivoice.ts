import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

export interface OmniVoiceSynthesizeOptions {
  text: string;
  emotion?: string;
  language?: string;
  refAudio?: string;
  instruct?: string;
}

export class OmniVoiceEngine {
  private apiUrl: string;
  private timeoutMs: number;

  constructor(apiUrl = 'http://localhost:9192', timeoutMs = 20000) {
    this.apiUrl = apiUrl.replace(/\/+$/, '');
    this.timeoutMs = timeoutMs;
  }

  setApiUrl(url: string): void {
    this.apiUrl = url.replace(/\/+$/, '');
  }

  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(`${this.apiUrl}/health`, { signal: controller.signal });
      clearTimeout(timer);
      return res.ok;
    } catch {
      return false;
    }
  }

  async synthesize(options: OmniVoiceSynthesizeOptions): Promise<string | null> {
    const cleanText = options.text.replace(/\[[^\]]+\]/g, '').replace(/\*[^*]+\*/g, '').trim();
    if (!cleanText) return null;

    const payload: Record<string, any> = {
      text: cleanText,
      emotion: (options.emotion || 'NEUTRAL').toUpperCase(),
      language: options.language || 'ja',
    };

    if (options.refAudio) payload.ref_audio = options.refAudio;
    if (options.instruct) payload.instruct = options.instruct;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const res = await fetch(`${this.apiUrl}/synthesize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) {
        console.warn(`[omnivoice] Server returned ${res.status}: ${await res.text().catch(() => '')}`);
        return null;
      }

      const data = await res.json() as { audio_url?: string };
      if (!data.audio_url) return null;

      // Download audio buffer from OmniVoice server
      const audioRes = await fetch(`${this.apiUrl}${data.audio_url}`);
      if (!audioRes.ok) return null;

      const arrayBuffer = await audioRes.arrayBuffer();
      const filename = `${crypto.randomUUID()}.wav`;
      const audioDir = path.resolve(process.cwd(), 'audio');
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      const filePath = path.join(audioDir, filename);
      fs.writeFileSync(filePath, Buffer.from(arrayBuffer));

      console.log(`[omnivoice] Synthesized: ${filename} for text: "${cleanText.slice(0, 40)}..."`);
      return `/audio/${filename}`;
    } catch (e: any) {
      console.warn(`[omnivoice] Synthesis failed (${e.message}).`);
      return null;
    }
  }
}

export const omniVoiceEngine = new OmniVoiceEngine();
