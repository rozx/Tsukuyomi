import type { AIModel } from '../types/ai-model';
import type { AIServiceConfig } from '../types/ai-service';

/** 各任务共用模型连接与思考设置；温度、输出预算和取消信号由任务补充。 */
export function buildModelServiceConfig(
  model: AIModel,
  overrides: Pick<
    AIServiceConfig,
    'temperature' | 'maxInputTokens' | 'maxOutputTokens' | 'signal'
  > = {},
): AIServiceConfig {
  return {
    apiKey: model.apiKey,
    baseUrl: model.baseUrl,
    model: model.model,
    temperature: model.temperature,
    thinkingLevel: model.thinkingLevel,
    useCorsProxy: model.useCorsProxy,
    ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
    ...overrides,
  };
}
