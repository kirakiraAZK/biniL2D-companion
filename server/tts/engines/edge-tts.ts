import { WebSocket } from 'ws';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';

const EDGE_WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaheadedge/v1?TrustedClientToken=6A5AA1D4EA6540818392238713499427';

export class EdgeTTSEngine {
  async synthesize(text: string, voice = 'ja-JP-NanamiNeural', speed = 1.0): Promise<string | null> {
    const cleanText = text.replace(/\[[^\]]+\]/g, '').replace(/\*[^*]+\*/g, '').trim();
    if (!cleanText) return null;

    return new Promise((resolve) => {
      const audioChunks: Buffer[] = [];
      const requestId = crypto.randomUUID().replace(/-/g, '');
      const connectionId = crypto.randomUUID().replace(/-/g, '');

      const ws = new WebSocket(`${EDGE_WS_URL}&ConnectionId=${connectionId}`, {
        headers: {
          'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
        }
      });

      const timer = setTimeout(() => {
        ws.close();
        resolve(null);
      }, 10000);

      ws.on('open', () => {
        // Send config message
        const configMsg = `X-Timestamp:${new Date().toISOString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`;
        ws.send(configMsg);

        // SSML message
        const ratePercent = Math.round((speed - 1) * 100);
        const rateStr = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

        const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='${rateStr}'>${this.escapeXml(cleanText)}</prosody></voice></speak>`;
        const ssmlMsg = `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`;
        ws.send(ssmlMsg);
      });

      ws.on('message', (data: Buffer, isBinary: boolean) => {
        if (!isBinary) {
          const str = data.toString('utf-8');
          if (str.includes('Path:turn.end')) {
            clearTimeout(timer);
            ws.close();

            if (audioChunks.length === 0) {
              resolve(null);
              return;
            }

            const finalBuffer = Buffer.concat(audioChunks);
            const filename = `${crypto.randomUUID()}.mp3`;
            const audioDir = path.resolve(process.cwd(), 'audio');
            if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

            fs.writeFileSync(path.join(audioDir, filename), finalBuffer);
            resolve(`/audio/${filename}`);
          }
        } else {
          // Binary audio packet: has a 2-byte header length at index 0..1
          if (data.length > 2) {
            const headerLen = data.readUInt16BE(0);
            if (data.length > headerLen + 2) {
              const audioBody = data.subarray(headerLen + 2);
              audioChunks.push(audioBody);
            }
          }
        }
      });

      ws.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
  }

  private escapeXml(unsafe: string): string {
    return unsafe.replace(/[<>&'"]/g, (c) => {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
        default: return c;
      }
    });
  }
}

export const edgeTTSEngine = new EdgeTTSEngine();
