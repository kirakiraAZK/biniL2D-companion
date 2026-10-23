export interface ParsedTag {
  type: 'emotion' | 'expression' | 'motion' | 'costume';
  value: string;
}

export interface StreamTagParserCallbacks {
  onCleanToken?: (token: string) => void;
  onTag?: (tag: ParsedTag) => void;
  onSentenceComplete?: (sentence: string) => void;
}

const VALID_EMOTIONS = new Set(['HAPPY', 'SAD', 'SURPRISED', 'ANGRY', 'THINKING', 'NEUTRAL']);

export class StreamTagParser {
  private buffer = '';
  private fullCleanText = '';
  private fullRawText = '';
  private detectedEmotion: string = 'NEUTRAL';
  private detectedExpression: string = '';
  private detectedMotion: string = '';
  private detectedCostume: string = '';
  private sentenceBuffer = '';

  constructor(private callbacks: StreamTagParserCallbacks = {}) {}

  feed(chunk: string): void {
    this.fullRawText += chunk;
    this.buffer += chunk;

    // Process buffer for bracketed tags
    let match: RegExpExecArray | null;
    const tagRegex = /\[([^\]]+)\]/g;

    let lastIndex = 0;
    while ((match = tagRegex.exec(this.buffer)) !== null) {
      const tagContent = match[1].trim();
      const tagStart = match.index;
      const tagEnd = tagRegex.lastIndex;

      // Everything before the tag is clean text
      const beforeText = this.buffer.slice(lastIndex, tagStart);
      if (beforeText) {
        this.emitClean(beforeText);
      }

      this.processTag(tagContent);
      lastIndex = tagEnd;
    }

    // Keep unprocessed remainder in buffer (may be an incomplete opening bracket like "[HAP")
    const remainder = this.buffer.slice(lastIndex);
    const bracketIndex = remainder.indexOf('[');
    if (bracketIndex >= 0) {
      // Flush up to the opening bracket
      const safeText = remainder.slice(0, bracketIndex);
      if (safeText) {
        this.emitClean(safeText);
      }
      this.buffer = remainder.slice(bracketIndex);
    } else {
      // No opening bracket in remainder — safe to emit all
      if (remainder) {
        this.emitClean(remainder);
      }
      this.buffer = '';
    }
  }

  flush(): {
    cleanText: string;
    rawText: string;
    emotion: string;
    expression: string;
    motion: string;
    costume: string;
  } {
    if (this.buffer) {
      // Any leftover text that didn't form a complete tag
      this.emitClean(this.buffer);
      this.buffer = '';
    }

    if (this.sentenceBuffer.trim()) {
      this.callbacks.onSentenceComplete?.(this.sentenceBuffer.trim());
      this.sentenceBuffer = '';
    }

    return {
      cleanText: this.fullCleanText.trim(),
      rawText: this.fullRawText.trim(),
      emotion: this.detectedEmotion,
      expression: this.detectedExpression,
      motion: this.detectedMotion,
      costume: this.detectedCostume
    };
  }

  private emitClean(text: string): void {
    this.fullCleanText += text;
    this.sentenceBuffer += text;
    this.callbacks.onCleanToken?.(text);

    // Check sentence endings for TTS chunking (. ! ? 。 ！？ \n)
    const sentenceEndRegex = /([.!?。！？\n]+)(\s+|$)/;
    let m = sentenceEndRegex.exec(this.sentenceBuffer);
    while (m !== null) {
      const cutPoint = m.index + m[1].length;
      const completeSentence = this.sentenceBuffer.slice(0, cutPoint).trim();
      if (completeSentence.length >= 6) {
        this.callbacks.onSentenceComplete?.(completeSentence);
        this.sentenceBuffer = this.sentenceBuffer.slice(cutPoint).trimStart();
      } else {
        break;
      }
      m = sentenceEndRegex.exec(this.sentenceBuffer);
    }
  }

  private processTag(content: string): void {
    const upper = content.toUpperCase();
    if (VALID_EMOTIONS.has(upper)) {
      this.detectedEmotion = upper;
      this.callbacks.onTag?.({ type: 'emotion', value: upper });
      return;
    }

    // Check key-value tags like [expression: smile-01], [motion: nod], [costume: casual]
    const colonIdx = content.indexOf(':');
    if (colonIdx > 0) {
      const key = content.slice(0, colonIdx).trim().toLowerCase();
      const val = content.slice(colonIdx + 1).trim();

      if (key === 'expression' || key === 'emotion') {
        if (VALID_EMOTIONS.has(val.toUpperCase())) {
          this.detectedEmotion = val.toUpperCase();
          this.callbacks.onTag?.({ type: 'emotion', value: val.toUpperCase() });
        } else {
          this.detectedExpression = val;
          this.callbacks.onTag?.({ type: 'expression', value: val });
        }
      } else if (key === 'motion') {
        this.detectedMotion = val;
        this.callbacks.onTag?.({ type: 'motion', value: val });
      } else if (key === 'costume') {
        this.detectedCostume = val;
        this.callbacks.onTag?.({ type: 'costume', value: val });
      }
    }
  }
}
