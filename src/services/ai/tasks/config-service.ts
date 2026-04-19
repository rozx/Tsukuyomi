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
    if (!model.enabled) {
      return {
        success: false,
        message: '所选模型未启用',
      };
    }

    if (!model.apiKey?.trim()) {
      return {
        success: false,
        message: 'API Key 不能为空',
      };
    }

    if (!model.model?.trim()) {
      return {
        success: false,
        message: '模型名称不能为空',
      };
    }

    // Gemini 不需要 baseUrl，其他提供商需要
    if (model.provider !== 'gemini' && !model.baseUrl?.trim()) {
      return {
        success: false,
        message: '基础地址不能为空',
      };
    }

    try {
      const config: AIServiceConfig = {
        apiKey: model.apiKey,
        baseUrl: model.provider === 'gemini' ? undefined : model.baseUrl,
        model: model.model,
        temperature: model.temperature,
        maxInputTokens: model.maxInputTokens,
        maxOutputTokens: model.maxOutputTokens,
        signal: options?.signal,
        useCorsProxy: model.useCorsProxy,
        ...(model.customHeaders ? { customHeaders: model.customHeaders } : {}),
      };

      return await AIServiceFactory.getConfig(model.provider, config);
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : '获取配置失败：未知错误',
      };
    }
  }
}
