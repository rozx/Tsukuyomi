import type { AIModel } from 'src/services/ai/types/ai-model';
import type { AIConfigResult, AIServiceConfig } from 'src/services/ai/types/ai-service';
import { AIServiceFactory } from '../index';

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
   * 获取配置信息的提示词
   * 要求 AI 以 JSON 格式返回最大输入 token 数
   */
  static getConfigPrompt(): string {
    return `请以 JSON 格式返回你的最大输入 token 数（maxInputTokens），这是我可以发送给你的最大 token 数量，用于限制上下文输入。

请只返回 JSON 对象，格式如下：
{
  "maxInputTokens": 数字
}

如果你不知道确切的 maxInputTokens，但知道 contextWindow（总上下文窗口大小），可以返回：
{
  "maxInputTokens": 数字,
  "contextWindow": 数字
}`;
  }

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
        maxTokens: model.maxTokens,
        signal: options?.signal,
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
