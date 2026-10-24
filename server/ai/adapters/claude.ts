import { PromptMessage } from '../prompt-builder';

export interface ClaudeAdapterOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

export async function* streamClaude(
  messages: PromptMessage[],
  options: ClaudeAdapterOptions = {}
): AsyncGenerator<string, void, unknown> {
  const apiKey = options.apiKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) {
    throw new Error('Anthropic Claude API key is required. Please set it in Settings or ANTHROPIC_API_KEY.');
  }

  const model = options.model || process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  const temperature = options.temperature ?? 0.7;

  // Split out system message
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const conversation = messages
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: systemMsg,
      messages: conversation,
      temperature,
      stream: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Claude Provider HTTP ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body received from Claude stream');
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
        if (json.type === 'content_block_delta' && json.delta?.text) {
          yield json.delta.text;
        }
      } catch {
        // partial json chunk
      }
    }
  }
}
