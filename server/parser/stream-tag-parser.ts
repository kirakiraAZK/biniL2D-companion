export interface ParsedTag {
  type: 'emotion' | 'expression' | 'motion' | 'costume' | 'music' | 'card';
  value: string;
  cardType?: 'weather' | 'calendar' | 'tasks' | 'news';
}

export interface StreamTagParserCallbacks {
  onCleanToken?: (token: string) => void;
  onThoughtChunk?: (chunk: string) => void;
  onTag?: (tag: ParsedTag) => void;
  onSentenceComplete?: (sentence: string) => void;
}

const VALID_EMOTIONS = new Set(['HAPPY', 'SAD', 'SURPRISED', 'ANGRY', 'THINKING', 'NEUTRAL']);

export class StreamTagParser {
  private buffer = '';
  private fullCleanText = '';
  private fullThoughtText = '';
  private fullRawText = '';
  private detectedEmotion: string = 'NEUTRAL';
  private detectedExpression: string = '';
  private detectedMotion: string = '';
  private detectedCostume: string = '';
  private detectedMusic: string = '';
  private detectedCards: Array<{ type: 'weather' | 'calendar' | 'tasks' | 'news'; value?: string }> = [];
  private sentenceBuffer = '';
  private inThought = false;

  private callbacks: StreamTagParserCallbacks;

  constructor(callbacks: StreamTagParserCallbacks = {}) {
    this.callbacks = callbacks;
  }

  feed(chunk: string): void {
    this.fullRawText += chunk;
    this.buffer += chunk;

    let progress = true;
    while (progress && this.buffer.length > 0) {
      progress = false;

      if (this.inThought) {
        // Looking for closing tag: </think>, </thought>, </reasoning>, or [/thought]
        const closeRegex = /<\/(?:think|thought|reasoning)>|\[\/thought\]/i;
        const match = closeRegex.exec(this.buffer);

        if (match) {
          const thoughtPart = this.buffer.slice(0, match.index);
          if (thoughtPart) {
            this.fullThoughtText += thoughtPart;
            this.callbacks.onThoughtChunk?.(thoughtPart);
          }
          this.inThought = false;
          // Skip past the closing tag
          this.buffer = this.buffer.slice(match.index + match[0].length);
          // Strip any immediate leading newlines so dialogue doesn't start with excessive blank space
          this.buffer = this.buffer.replace(/^[\r\n]+/, '');
          progress = true;
          continue;
        }

        // Check if buffer ends with a partial closing tag like "</" or "</th"
        const lastLt = Math.max(this.buffer.lastIndexOf('<'), this.buffer.lastIndexOf('['));
        if (lastLt >= 0 && lastLt >= this.buffer.length - 15) {
          const safeThought = this.buffer.slice(0, lastLt);
          if (safeThought) {
            this.fullThoughtText += safeThought;
            this.callbacks.onThoughtChunk?.(safeThought);
          }
          this.buffer = this.buffer.slice(lastLt);
          break; // wait for next chunk
        } else {
          // No partial closing tag, all current buffer is thought content
          this.fullThoughtText += this.buffer;
          this.callbacks.onThoughtChunk?.(this.buffer);
          this.buffer = '';
          break;
        }
      } else {
        // NOT in thought: look for thought opening tag or bracket tag
        const thoughtOpenRegex = /<(?:think|thought|reasoning)(?:\s[^>]*)?>|\[thought\]/i;
        const bracketTagRegex = /\[([^\]]+)\]/;

        const thoughtMatch = thoughtOpenRegex.exec(this.buffer);
        const bracketMatch = bracketTagRegex.exec(this.buffer);

        let firstMatch: {
          type: 'thought' | 'bracket';
          index: number;
          length: number;
          bracketContent?: string;
        } | null = null;

        if (thoughtMatch && bracketMatch) {
          if (thoughtMatch.index <= bracketMatch.index) {
            firstMatch = { type: 'thought', index: thoughtMatch.index, length: thoughtMatch[0].length };
          } else {
            firstMatch = {
              type: 'bracket',
              index: bracketMatch.index,
              length: bracketMatch[0].length,
              bracketContent: bracketMatch[1].trim()
            };
          }
        } else if (thoughtMatch) {
          firstMatch = { type: 'thought', index: thoughtMatch.index, length: thoughtMatch[0].length };
        } else if (bracketMatch) {
          firstMatch = {
            type: 'bracket',
            index: bracketMatch.index,
            length: bracketMatch[0].length,
            bracketContent: bracketMatch[1].trim()
          };
        }

        if (firstMatch) {
          const beforeText = this.buffer.slice(0, firstMatch.index);
          if (beforeText) {
            this.emitClean(beforeText);
          }

          if (firstMatch.type === 'thought') {
            this.inThought = true;
            this.buffer = this.buffer.slice(firstMatch.index + firstMatch.length);
          } else {
            if (firstMatch.bracketContent) {
              this.processTag(firstMatch.bracketContent);
            }
            this.buffer = this.buffer.slice(firstMatch.index + firstMatch.length);
          }
          progress = true;
          continue;
        }

        // Neither full tag matched: check for incomplete tag at end of buffer
        // (e.g. "<th", "<", "[", "[HA", "[costume: uniq-0092-00")
        const lastLt = Math.max(this.buffer.lastIndexOf('<'), this.buffer.lastIndexOf('['));
        if (lastLt >= 0 && (this.buffer.length - lastLt) <= 120) {
          const safeText = this.buffer.slice(0, lastLt);
          if (safeText) {
            this.emitClean(safeText);
          }
          this.buffer = this.buffer.slice(lastLt);
          break; // wait for next chunk
        } else {
          // No partial tag, all buffer is clean dialogue text
          this.emitClean(this.buffer);
          this.buffer = '';
          break;
        }
      }
    }
  }

  flush(): {
    cleanText: string;
    thoughtText: string;
    rawText: string;
    emotion: string;
    expression: string;
    motion: string;
    costume: string;
    music: string;
    cards: Array<{ type: 'weather' | 'calendar' | 'tasks' | 'news'; value?: string }>;
  } {
    if (this.buffer) {
      if (this.inThought) {
        this.fullThoughtText += this.buffer;
        this.callbacks.onThoughtChunk?.(this.buffer);
      } else {
        // Strip any residual bracket tag if present
        const residualTagMatch = /\[([^\]]+)\]/.exec(this.buffer);
        if (residualTagMatch) {
          const before = this.buffer.slice(0, residualTagMatch.index);
          if (before) this.emitClean(before);
          this.processTag(residualTagMatch[1].trim());
          const after = this.buffer.slice(residualTagMatch.index + residualTagMatch[0].length);
          if (after) this.emitClean(after);
        } else {
          this.emitClean(this.buffer);
        }
      }
      this.buffer = '';
    }

    this.inThought = false;

    if (this.sentenceBuffer.trim()) {
      this.callbacks.onSentenceComplete?.(this.sentenceBuffer.trim());
      this.sentenceBuffer = '';
    }

    let clean = this.fullCleanText.trim();
    // Safety scrub any remaining companion control tags from speech text
    clean = clean
      .replace(
        /\[(?:costume|outfit|motion|expression|emotion|music|song|track|weather|calendar|schedule|events|tasks|notion|todo|news|feed|articles)(?::[^\]]+)?\]/gi,
        ''
      )
      .trim();

    return {
      cleanText: clean || (this.fullThoughtText.trim() ? '(smiles softly)' : ''),
      thoughtText: this.fullThoughtText.trim(),
      rawText: this.fullRawText.trim(),
      emotion: this.detectedEmotion,
      expression: this.detectedExpression,
      motion: this.detectedMotion,
      costume: this.detectedCostume,
      music: this.detectedMusic,
      cards: this.detectedCards
    };
  }

  private emitClean(text: string): void {
    if (!text) return;
    // Strip leading whitespace from the very first dialogue chunk
    if (!this.fullCleanText) {
      text = text.trimStart();
      if (!text) return;
    }
    this.fullCleanText += text;
    this.sentenceBuffer += text;
    this.callbacks.onCleanToken?.(text);

    // Check sentence endings for TTS chunking (. ! ? 。 ！？ \n)
    const sentenceEndRegex = /([.!?。！？\n]+)(\s+|$)/;
    let m = sentenceEndRegex.exec(this.sentenceBuffer);
    while (m !== null) {
      const cutPoint = m.index + m[1].length;
      const completeSentence = this.sentenceBuffer.slice(0, cutPoint).trim();
      if (completeSentence.length >= 4) {
        this.callbacks.onSentenceComplete?.(completeSentence);
        this.sentenceBuffer = this.sentenceBuffer.slice(cutPoint).trimStart();
      } else {
        break;
      }
      m = sentenceEndRegex.exec(this.sentenceBuffer);
    }
  }

  private processTag(content: string): void {
    const trimmed = content.trim();
    const upper = trimmed.toUpperCase();
    const lower = trimmed.toLowerCase();

    if (VALID_EMOTIONS.has(upper)) {
      this.detectedEmotion = upper;
      this.callbacks.onTag?.({ type: 'emotion', value: upper });
      return;
    }

    // Standalone rich card tags (e.g. [weather], [calendar], [schedule], [tasks], [news])
    if (lower === 'weather') {
      this.detectedCards.push({ type: 'weather' });
      this.callbacks.onTag?.({ type: 'card', value: '', cardType: 'weather' });
      return;
    }
    if (lower === 'calendar' || lower === 'schedule' || lower === 'events') {
      this.detectedCards.push({ type: 'calendar' });
      this.callbacks.onTag?.({ type: 'card', value: '', cardType: 'calendar' });
      return;
    }
    if (lower === 'tasks' || lower === 'notion' || lower === 'todo') {
      this.detectedCards.push({ type: 'tasks' });
      this.callbacks.onTag?.({ type: 'card', value: '', cardType: 'tasks' });
      return;
    }
    if (lower === 'news' || lower === 'feed' || lower === 'articles') {
      this.detectedCards.push({ type: 'news' });
      this.callbacks.onTag?.({ type: 'card', value: '', cardType: 'news' });
      return;
    }

    // Check key-value tags like [expression: smile-01], [motion: nod], [costume: casual], [weather: Tokyo]
    const colonIdx = trimmed.indexOf(':') !== -1 ? trimmed.indexOf(':') : trimmed.indexOf('=');
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim().toLowerCase();
      const val = trimmed.slice(colonIdx + 1).trim();

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
      } else if (key === 'costume' || key === 'outfit') {
        this.detectedCostume = val;
        this.callbacks.onTag?.({ type: 'costume', value: val });
      } else if (key === 'music' || key === 'song' || key === 'track') {
        this.detectedMusic = val;
        this.callbacks.onTag?.({ type: 'music', value: val });
      } else if (key === 'weather') {
        this.detectedCards.push({ type: 'weather', value: val });
        this.callbacks.onTag?.({ type: 'card', value: val, cardType: 'weather' });
      } else if (key === 'calendar' || key === 'schedule' || key === 'events') {
        this.detectedCards.push({ type: 'calendar', value: val });
        this.callbacks.onTag?.({ type: 'card', value: val, cardType: 'calendar' });
      } else if (key === 'tasks' || key === 'notion' || key === 'todo') {
        this.detectedCards.push({ type: 'tasks', value: val });
        this.callbacks.onTag?.({ type: 'card', value: val, cardType: 'tasks' });
      } else if (key === 'news' || key === 'feed' || key === 'articles') {
        this.detectedCards.push({ type: 'news', value: val });
        this.callbacks.onTag?.({ type: 'card', value: val, cardType: 'news' });
      }
    }
  }
}
