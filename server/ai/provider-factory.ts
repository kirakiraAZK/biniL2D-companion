import { CharacterRow, dbManager } from '../db/client';
import { PromptMessage } from './prompt-builder';
import { streamOpenAI } from './adapters/openai';
import { streamClaude } from './adapters/claude';
import { streamGemini } from './adapters/gemini';

export function streamAI(
  character: CharacterRow,
  messages: PromptMessage[]
): AsyncGenerator<string, void, unknown> {
  const provider = (character.ai_provider || dbManager.getSetting('ai_provider') || 'openai').toLowerCase();

  if (provider === 'claude' || provider === 'anthropic') {
    const apiKey = dbManager.getSetting('anthropic_api_key') || process.env.ANTHROPIC_API_KEY;
    const model = character.ai_model || dbManager.getSetting('anthropic_model') || 'claude-3-5-sonnet-20241022';
    return streamClaude(messages, {
      apiKey,
      model,
      temperature: character.temperature
    });
  }

  if (provider === 'gemini' || provider === 'google') {
    const apiKey = dbManager.getSetting('gemini_api_key') || process.env.GEMINI_API_KEY;
    const model = character.ai_model || dbManager.getSetting('gemini_model') || 'gemini-1.5-flash';
    return streamGemini(messages, {
      apiKey,
      model,
      temperature: character.temperature
    });
  }

  // Default: OpenAI or OpenAI-Compatible Custom Endpoint
  const apiKey = dbManager.getSetting('openai_api_key') || process.env.OPENAI_API_KEY;
  const baseUrl = character.custom_base_url || dbManager.getSetting('openai_base_url') || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = character.ai_model || dbManager.getSetting('openai_model') || 'gpt-4o-mini';

  return streamOpenAI(messages, {
    apiKey,
    baseUrl,
    model,
    temperature: character.temperature
  });
}
