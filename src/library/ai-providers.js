import { normalizeBaseUrl } from './ai.js';

// Presets for OpenAI-compatible chat APIs. Only stable facts live here: the
// base URL and where to create a key. Model IDs change often, so they are read
// from each provider's /models endpoint and chosen with preference patterns.
export const PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyUrl: 'https://platform.openai.com/api-keys',
    prefer: [/mini/, /nano/],
    avoid: /audio|realtime|search|preview|codex/
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    keyUrl: 'https://platform.claude.com/settings/keys',
    prefer: [/haiku/, /sonnet/]
  },
  {
    id: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyUrl: 'https://aistudio.google.com/apikey',
    prefer: [/flash/],
    avoid: /lite|preview|exp|thinking|tts|image|live/
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    prefer: [/flash/, /chat/],
    avoid: /reasoner|vision/
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyUrl: 'https://openrouter.ai/keys',
    prefer: [/flash/, /mini/, /haiku/],
    avoid: /:free|preview|vision|image/
  },
  {
    id: 'qwen',
    label: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/?tab=model#/api-key',
    prefer: [/qwen.*flash/, /qwen.*turbo/, /qwen.*plus/],
    avoid: /vl|audio|omni|coder|math|embedding/
  },
  {
    id: 'moonshot',
    label: 'Moonshot Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.moonshot.cn/console/api-keys',
    prefer: [/kimi/, /moonshot/],
    avoid: /vision|thinking/
  },
  {
    id: 'custom',
    label: 'Custom (OpenAI-compatible)',
    baseUrl: '',
    keyUrl: '',
    prefer: []
  }
];

const NON_CHAT = /embed|tts|whisper|dall-e|image|moderation|transcribe|rerank|aqa|imagen|veo/i;

export const findProvider = (id) => PROVIDERS.find((p) => p.id === id) || PROVIDERS.at(-1);

export function detectProvider(baseUrl) {
  const normalized = (() => {
    try {
      return normalizeBaseUrl(baseUrl);
    } catch {
      return '';
    }
  })();
  return PROVIDERS.find((p) => p.baseUrl && p.baseUrl === normalized) || PROVIDERS.at(-1);
}

// Accepts an OpenAI-style { data: [{ id }] } list. Gemini prefixes IDs with "models/".
export function parseModelList(body) {
  const ids = (Array.isArray(body?.data) ? body.data : [])
    .map((model) => String(model?.id || '').replace(/^models\//, ''))
    .filter((id) => id && id.length <= 200 && !NON_CHAT.test(id));
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

export function pickDefaultModel(provider, ids) {
  const usable = provider.avoid ? ids.filter((id) => !provider.avoid.test(id)) : ids;
  for (const pattern of provider.prefer || []) {
    const match = usable.find((id) => pattern.test(id));
    if (match) return match;
  }
  return usable[0] || ids[0] || '';
}
