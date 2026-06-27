import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult, AIServiceConfig } from 'src/services/ai/types/ai-service';
import { AIServiceFactory } from '../ai-service-factory';

/**
 * 配置服务选项
 */
export interface ConfigServiceOptions {
  /**
   * 取消信号（可选）
   */
  signal?: AbortSignal;
}

/**
 * 配置服务
 * 管理 AI 模型配置相关的功能，包括配置获取提示词和配置获取
 */
export class ConfigService {
  /**
   * 获取模型配置信息
   * @param model AI 模型配置
   * @param options 配置选项（可选）
   * @returns 配置获取结果
   */
  static async getConfig(model: AIModel, options?: ConfigServiceOptions): Promise<AIConfigResult> {
    const validationMessage = getConfigValidationMessage(model);
    if (validationMessage) {
      return {
        success: false,
        message: validationMessage,
      };
    }

    try {
      const config = buildConfigServiceRequest(model, options?.signal);
      return await AIServiceFactory.getConfig(model.provider, config);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取配置失败：未知错误',
      };
    }
  }
}

/**
 * 校验模型配置，返回首个不满足条件的错误消息；全部通过则返回 undefined
 */
function getConfigValidationMessage(model: AIModel): string | undefined {
  if (!model.enabled) return '所选模型未启用';
  if (!hasNonEmptyTrim(model.apiKey)) return 'API Key 不能为空';
  if (!hasNonEmptyTrim(model.model)) return '模型名称不能为空';
  // Gemini 不需要 baseUrl，其他提供商需要
  if (model.provider !== 'gemini' && !hasNonEmptyTrim(model.baseUrl)) {
    return '基础地址不能为空';
  }
  return undefined;
}

function hasNonEmptyTrim(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim() !== '';
}

/**
 * 构造配置获取请求所需的 AIServiceConfig
 */
function buildConfigServiceRequest(model: AIModel, signal: AbortSignal | undefined): AIServiceConfig {
  return {
    apiKey: model.apiKey,
    baseUrl: model.provider === 'gemini' ? undefined : model.baseUrl,
    model: model.model,
    temperature: model.temperature,
    maxInputTokens: model.maxInputTokens,
    maxOutputTokens: model.maxOutputTokens,
    signal,
    useCorsProxy: model.useCorsProxy,
    ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
  };
}
