import type { AIProvider } from 'src/services/ai/types/ai-model';
import type { AIServiceConfig, ModelInfo } from 'src/services/ai/types/ai-service';
import { normalizeBaseUrl } from 'src/services/ai/providers/ai-sdk/messages';
import { createProxyFetch } from 'src/services/ai/providers/ai-sdk/request';

interface ModelList {
  data?: { id: string; owned_by?: string }[];
  models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
}

export async function listModels(
  provider: AIProvider,
  config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
): Promise<ModelInfo[]> {
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
    });
    if (!response.ok)
      throw new Error(`获取模型列表失败: ${response.status} ${await response.text()}`);
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
