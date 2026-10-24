import { PromptMessage } from '../prompt-builder';

export interface GeminiAdapterOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export async function* streamGemini(
  messages: PromptMessage[],
  options: GeminiAdapterOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    throw new Error('Google Gemini API key is required. Please set it in Settings or GEMINI_API_KEY.');
  }

  const model = options.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const temperature = options.temperature ?? 0.7;

  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const contents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const bodyPayload: Record<string, any> = {
    contents,
    generationConfig: {
      temperature,
    }
  };

  if (systemMsg) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemMsg }]
    };
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Gemini Provider HTTP ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body received from Gemini stream');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const dataStr = trimmed.slice(5).trim();

      try {
        const json = JSON.parse(dataStr);
        const parts = json.candidates?.[0]?.content?.parts;
        if (Array.isArray(parts)) {
          for (const part of parts) {
            if (part.text) {
              yield part.text;
            }
          }
        }
      } catch {
        // partial chunk
      }
    }
  }
}
