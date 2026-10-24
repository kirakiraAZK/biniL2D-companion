import { PromptMessage } from '../prompt-builder';

export interface OpenAIAdapterOptions {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  temperature?: number;
}

export async function* streamOpenAI(
  messages: PromptMessage[],
  options: OpenAIAdapterOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = options.apiKey || process.env.OPENAI_API_KEY || '';
  const rawBase = options.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const baseUrl = rawBase.replace(/\/+$/, '');
  const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const temperature = options.temperature ?? 0.7;

  // Pre-flight check: if targeting official OpenAI and no key is configured
  const isOfficial = baseUrl.includes('api.openai.com');
  if (isOfficial && !apiKey) {
    throw new Error('OpenAI API key is required when connecting to api.openai.com. Please set it in Settings → AI Brain.');
  }

  const url = `${baseUrl}/chat/completions`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature,
        stream: true,
      }),
      signal: controller.signal,
    });
  } catch (netErr: any) {
    clearTimeout(timer);
    if (netErr?.name === 'AbortError') {
      throw new Error(`Connection timed out after 30s connecting to OpenAI endpoint ${url}`);
    }
    throw netErr;
  }
  clearTimeout(timer);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenAI Provider HTTP ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body received from OpenAI stream');
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
      if (dataStr === '[DONE]') return;

      try {
        const json = JSON.parse(dataStr);
        const delta = json.choices?.[0]?.delta?.content;
        if (delta) {
          yield delta;
        }
      } catch {
        // partial json chunk, continue
      }
    }
  }
}
