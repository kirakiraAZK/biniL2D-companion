import { CharacterRow, dbManager } from '../db/client';
import { PromptMessage } from './prompt-builder';
import { streamOpenAI } from './adapters/openai';
import { streamClaude } from './adapters/claude';
import { streamGemini } from './adapters/gemini';
import { wsHub } from '../ws/ws-hub';
import { classifyAIError } from './error-classifier';

function getProviderStream(
  providerName: string,
  character: CharacterRow,
  messages: PromptMessage[]
): AsyncGenerator<string, void, unknown> {
  const provider = providerName.toLowerCase();

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

export async function* streamAI(
  character: CharacterRow,
  messages: PromptMessage[]
): AsyncGenerator<string, void, unknown> {
  const primary = (character.ai_provider || dbManager.getSetting('ai_provider') || 'openai').toLowerCase();
  const fallback1 = dbManager.getRuntimeSetting('llm_fallback_1', process.env.LLM_FALLBACK_1 || '').toLowerCase();
  const fallback2 = dbManager.getRuntimeSetting('llm_fallback_2', process.env.LLM_FALLBACK_2 || '').toLowerCase();

  const chain = [primary];
  if (fallback1 && fallback1 !== primary) chain.push(fallback1);
  if (fallback2 && !chain.includes(fallback2)) chain.push(fallback2);

  let lastError: any = null;

  for (let i = 0; i < chain.length; i++) {
    const currentProvider = chain[i];
    let yieldedAny = false;
    try {
      const generator = getProviderStream(currentProvider, character, messages);
      for await (const chunk of generator) {
        yieldedAny = true;
        yield chunk;
      }
      return; // Stream succeeded
    } catch (err: any) {
      lastError = err;
      const classified = classifyAIError(err, undefined, currentProvider);
      console.warn(`[ai-provider] Provider '${currentProvider}' failed:`, classified.title, err.message || err);

      // If we already yielded tokens to the client, we cannot seamlessly fallback mid-stream
      if (yieldedAny) {
        throw err;
      }

      if (i < chain.length - 1) {
        const nextProvider = chain[i + 1];
        wsHub.log(
          'AI',
          `Primary provider '${currentProvider}' failed — falling back to '${nextProvider}'`,
          { error: classified.message, hint: classified.hint },
          'warn'
        );
      }
    }
  }

  const finalClassified = classifyAIError(lastError, undefined, primary);
  wsHub.log('AI', `All configured AI providers failed: ${finalClassified.title}`, finalClassified, 'error');
  throw lastError || new Error('All AI providers failed');
}
