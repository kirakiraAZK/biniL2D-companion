/**
 * Universal AI Provider Error Classifier
 * Parses raw HTTP responses, JSON bodies, and exceptions from OpenAI, Anthropic, Gemini,
 * and local inference servers (LM Studio, Ollama, vLLM) into clear, actionable diagnosis.
 */

export interface ClassifiedAIError {
  code:
    | 'AUTH_MISSING'
    | 'AUTH_INVALID'
    | 'RATE_LIMIT'
    | 'QUOTA_EXCEEDED'
    | 'MODEL_NOT_FOUND'
    | 'ENDPOINT_UNREACHABLE'
    | 'TIMEOUT'
    | 'OVERLOADED'
    | 'INVALID_REQUEST'
    | 'UNKNOWN';
  title: string;
  message: string;
  hint: string;
  rawError?: string;
  httpStatus?: number;
  provider?: string;
  retryable: boolean;
}

export function classifyAIError(
  errOrStatus: any,
  rawBody?: string,
  providerName?: string
): ClassifiedAIError {
  const provider = (providerName || 'AI Provider').toUpperCase();
  let status = typeof errOrStatus === 'number' ? errOrStatus : errOrStatus?.status || errOrStatus?.httpStatus || 0;
  let text = '';

  if (typeof errOrStatus === 'string') {
    text = errOrStatus;
  } else if (errOrStatus instanceof Error) {
    text = errOrStatus.message || '';
  }

  if (rawBody) {
    text = `${text} ${rawBody}`.trim();
  }

  // Extract HTTP status from message string if not already set (e.g. "HTTP 429", "status: 401")
  if (!status) {
    const statusMatch = text.match(/\b(?:HTTP|status|code)[:\s]+(\d{3})\b/i);
    if (statusMatch) {
      status = parseInt(statusMatch[1], 10);
    }
  }

  // 1. Missing Key
  if (
    /API key is required|No API key set|apiKey is required|key is missing/i.test(text) ||
    (status === 401 && /missing.*key|no.*key/i.test(text))
  ) {
    return {
      code: 'AUTH_MISSING',
      title: `${provider}: API Key Missing`,
      message: 'No API key is configured for this AI provider.',
      hint: 'Open Companion Settings → "AI Brain" tab and enter your API key.',
      rawError: text,
      httpStatus: status || 401,
      provider,
      retryable: false
    };
  }

  // 2. Invalid Key / Auth Error
  if (
    status === 401 ||
    status === 403 ||
    /API_KEY_INVALID|authentication_error|invalid x-api-key|incorrect api key|invalid_api_key|unauthorized|forbidden|permission denied/i.test(text)
  ) {
    return {
      code: 'AUTH_INVALID',
      title: `${provider}: Invalid API Key`,
      message: 'The API key provided was rejected by the server.',
      hint: 'Check that your API key is typed correctly and has not expired or been revoked.',
      rawError: text,
      httpStatus: status || 401,
      provider,
      retryable: false
    };
  }

  // 3. Quota Exceeded vs Rate Limit
  if (
    status === 429 ||
    /RESOURCE_EXHAUSTED|rate_limit_error|rate limit|quota|exceeded your current quota|insufficient_quota|credit/i.test(text)
  ) {
    const isQuota = /quota|insufficient_quota|credit|billing|exceeded/i.test(text);
    if (isQuota) {
      return {
        code: 'QUOTA_EXCEEDED',
        title: `${provider}: API Quota Exceeded`,
        message: 'Your account balance or monthly usage quota has been exhausted.',
        hint: 'Check your billing balance or token limits on the provider dashboard, or switch to another provider.',
        rawError: text,
        httpStatus: status || 429,
        provider,
        retryable: false
      };
    }
    return {
      code: 'RATE_LIMIT',
      title: `${provider}: Rate Limit Reached`,
      message: 'Too many requests were sent in a short window.',
      hint: 'Wait 10-20 seconds and click Retry, or reduce message frequency.',
      rawError: text,
      httpStatus: status || 429,
      provider,
      retryable: true
    };
  }

  // 4. Model Not Found
  if (
    status === 404 ||
    /not_found_error|model_not_found|does not exist|is not found|unsupported model|cannot find model/i.test(text)
  ) {
    return {
      code: 'MODEL_NOT_FOUND',
      title: `${provider}: Model Not Found`,
      message: 'The configured model name is not available on this provider endpoint.',
      hint: 'Open Settings → "AI Brain", click "🔄 Fetch Models", and choose a valid model from the list.',
      rawError: text,
      httpStatus: status || 404,
      provider,
      retryable: false
    };
  }

  // 5. Unreachable Local / Remote Endpoint
  if (/ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|fetch failed/i.test(text)) {
    return {
      code: 'ENDPOINT_UNREACHABLE',
      title: `${provider}: Endpoint Unreachable`,
      message: 'Could not connect to the specified API Endpoint URL.',
      hint: 'Ensure your local server (LM Studio / Ollama / vLLM) is running and verify the Base URL in Settings.',
      rawError: text,
      httpStatus: status || 502,
      provider,
      retryable: true
    };
  }

  // 6. Timeout
  if (/AbortError|timed out|timeout|ETIMEDOUT/i.test(text)) {
    return {
      code: 'TIMEOUT',
      title: `${provider}: Request Timed Out`,
      message: 'The AI provider did not respond within the connection time limit.',
      hint: 'Check your internet connection or verify the endpoint is not frozen.',
      rawError: text,
      httpStatus: status || 504,
      provider,
      retryable: true
    };
  }

  // 7. Overloaded
  if (status === 529 || status === 503 || /overloaded/i.test(text)) {
    return {
      code: 'OVERLOADED',
      title: `${provider}: Server Overloaded`,
      message: 'The AI provider is experiencing temporary high traffic.',
      hint: 'Please wait a moment and click Retry.',
      rawError: text,
      httpStatus: status || 503,
      provider,
      retryable: true
    };
  }

  // 8. Fallback / Unknown
  return {
    code: 'UNKNOWN',
    title: `${provider}: Generation Error`,
    message: text.slice(0, 200) || 'An unexpected error occurred during AI generation.',
    hint: 'Check your Settings → AI Brain configuration and the Developer Debug console for details.',
    rawError: text,
    httpStatus: status || 500,
    provider,
    retryable: true
  };
}
