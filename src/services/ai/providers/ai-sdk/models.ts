import type { AIProvider } from 'src/services/ai/types/ai-model';
import type { AIServiceConfig, ModelInfo } from 'src/services/ai/types/ai-service';
import { normalizeBaseUrl } from 'src/services/ai/providers/ai-sdk/messages';
import { createProxyFetch } from 'src/services/ai/providers/ai-sdk/request';
import {
  ANTHROPIC_BASE_URL,
  ANTHROPIC_VERSION,
  anthropicHeaders,
} from 'src/services/ai/providers/ai-sdk/anthropic';
import { LocalizedError } from 'src/utils/localized-error';

type ListConfig = Pick<
  AIServiceConfig,
  'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy' | 'signal'
>;

interface ModelList {
  data?: { id: string; owned_by?: string }[];
  models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}

interface AnthropicModelPage {
  data?: { id: string; display_name?: string; max_input_tokens?: number; max_tokens?: number }[];
  has_more?: boolean;
  last_id?: string | null;
}

async function listFailed(response: Response): Promise<never> {
  throw new LocalizedError('AI_MODEL_LIST_FAILED', 'settingsUi.models.errors.modelListFailed', {
    status: response.status,
    detail: await response.text(),
  });
}

/** GET /v1/models 按 after_id 翻页；上限字段来自官方，可直接填入模型配置。 */
async function listAnthropicModels(config: ListConfig): Promise<ModelInfo[]> {
  const base = normalizeBaseUrl(config.baseUrl, ANTHROPIC_BASE_URL);
  const fetch = createProxyFetch(config.useCorsProxy);
  const models: ModelInfo[] = [];
  let after: string | null | undefined;
  do {
    const response = await fetch(
      `${base}/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ''}`,
      {
        headers: {
          'x-api-key': config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          ...anthropicHeaders(base, config),
        },
        ...(config.signal ? { signal: config.signal } : {}),
      },
    );
    if (!response.ok) await listFailed(response);
    const page = (await response.json()) as AnthropicModelPage;
    for (const model of page.data ?? []) {
      models.push({
        id: model.id,
        name: model.id,
        displayName: model.display_name || model.id,
        ownedBy: 'Anthropic',
        ...(model.max_input_tokens ? { maxInputTokens: model.max_input_tokens } : {}),
        ...(model.max_tokens ? { maxOutputTokens: model.max_tokens } : {}),
      });
    }
    after = page.has_more ? page.last_id : undefined;
  } while (after);
  return models;
}

export async function listModels(provider: AIProvider, config: ListConfig): Promise<ModelInfo[]> {
  if (provider === 'anthropic') return listAnthropicModels(config);
  try {
    const base = (config.baseUrl?.trim() || 'https://generativelanguage.googleapis.com').replace(
      /\/+$/,
      '',
    );
    const url =
      provider === 'openai'
        ? `${normalizeBaseUrl(config.baseUrl)}/models`
        : `${base}/v1beta/models?key=${encodeURIComponent(config.apiKey)}`;
    const response = await createProxyFetch(config.useCorsProxy)(url, {
      headers: {
        'Content-Type': 'application/json',
        ...(provider === 'openai' ? { Authorization: `Bearer ${config.apiKey}` } : {}),
        ...config.customHeaders,
      },
      ...(config.signal ? { signal: config.signal } : {}),
    });
    if (!response.ok) await listFailed(response);
    const data = (await response.json()) as ModelList;
    if (provider === 'openai')
      return (data.data ?? []).map((model) => ({
        id: model.id,
        name: model.id,
        displayName: model.id,
        ...(model.owned_by ? { ownedBy: model.owned_by } : {}),
      }));
    return (data.models ?? [])
      .filter((model) => model.supportedGenerationMethods?.includes('generateContent'))
      .map((model) => ({
        id: model.name.replace(/^models\//, ''),
        name: model.name.replace(/^models\//, ''),
        displayName: model.displayName || model.name.replace(/^models\//, ''),
        ownedBy: 'Google',
      }));
  } catch (error) {
    if (provider === 'gemini') return [];
    throw error;
  }
}
