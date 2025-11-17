import type { AIService, AIServiceConfig, AIConfigResult, ModelInfo } from './types';
import type { ParsedResponse, ConfigJson, ConfigParseResult } from 'src/types/ai/interfaces';
import { CONFIG_PROMPT, DEFAULT_CONTEXT_WINDOW_RATIO, UNLIMITED_TOKENS } from 'src/constants/ai';

/**
 * AI 服务基础抽象类
 * 提供通用的配置获取逻辑和错误处理
 */
export abstract class BaseAIService implements AIService {
  /**
   * 获取配置信息的提示词
   */
  protected readonly CONFIG_PROMPT = CONFIG_PROMPT;

  /**
   * 获取模型配置信息
   * 子类需要实现 makeConfigRequest 方法
   */
  async getConfig(config: AIServiceConfig): Promise<AIConfigResult> {
    try {
      // 验证配置
      this.validateConfig(config);

      // 发送请求并解析响应
      const parsedResponse = await this.makeConfigRequest(config);

      // 构建模型信息
      const modelInfo = this.buildModelInfo(config, parsedResponse);

      // 解析配置 JSON
      const { maxInputTokens, contextWindow } = this.parseConfigJson(parsedResponse.content);

      // 更新模型信息
      if (contextWindow) {
        modelInfo.contextWindow = contextWindow;
      }

      // 计算最终的最大 token 数
      const finalMaxTokens = this.calculateMaxTokens(maxInputTokens, contextWindow);

      // 构建结果
      const result: AIConfigResult = {
        success: true,
        message: `模型 "${config.model}" 配置已获取`,
        modelInfo: {
          ...modelInfo,
          maxTokens: finalMaxTokens,
        },
        maxTokens: finalMaxTokens,
      };

      return result;
    } catch (error) {
      return this.handleError(error, config.model);
    }
  }

  /**
   * 验证配置参数
   */
  protected validateConfig(config: AIServiceConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      throw new Error('API Key 不能为空');
    }
    if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
      throw new Error('模型名称不能为空');
    }
  }

  /**
   * 发送配置请求并解析响应（子类需要实现）
   * 返回解析后的响应数据
   */
  protected abstract makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse>;

  /**
   * 构建模型信息
   */
  protected buildModelInfo(config: AIServiceConfig, parsedResponse: ParsedResponse): ModelInfo {
    return {
      id: parsedResponse.modelId || config.model,
      name: parsedResponse.modelId || config.model,
    };
  }

  /**
   * 解析配置 JSON
   */
  protected parseConfigJson(content: string | null): ConfigParseResult {
    if (!content) {
      return {};
    }

    let maxInputTokens: number | undefined;
    let contextWindow: number | undefined;

    try {
      // 尝试解析 JSON
      const configJson: ConfigJson = JSON.parse(content);
      if (typeof configJson.maxInputTokens === 'number') {
        maxInputTokens = configJson.maxInputTokens;
      }
      if (typeof configJson.contextWindow === 'number') {
        contextWindow = configJson.contextWindow;
      }
    } catch {
      // JSON 解析失败，尝试从文本中提取
      const extracted = this.extractConfigFromText(content);
      maxInputTokens = extracted.maxInputTokens;
      contextWindow = extracted.contextWindow;
    }

    // 如果没有 maxInputTokens 但有 contextWindow，使用默认比例作为估算值
    if (!maxInputTokens && contextWindow) {
      maxInputTokens = Math.floor(contextWindow * DEFAULT_CONTEXT_WINDOW_RATIO);
    }

    // 仅在值存在时包含属性，以符合 exactOptionalPropertyTypes
    const result: ConfigParseResult = {};
    if (maxInputTokens !== undefined) {
      result.maxInputTokens = maxInputTokens;
    }
    if (contextWindow !== undefined) {
      result.contextWindow = contextWindow;
    }
    return result;
  }

  /**
   * 从文本中提取配置信息
   */
  protected extractConfigFromText(text: string): ConfigParseResult {
    const maxInputTokensMatch = text.match(/maxInputTokens["\s:]+(\d+)/i);
    const contextMatch = text.match(/contextWindow["\s:]+(\d+)/i);

    const result: ConfigParseResult = {};

    if (maxInputTokensMatch && maxInputTokensMatch[1]) {
      const value = parseInt(maxInputTokensMatch[1], 10);
      if (!isNaN(value) && value > 0) {
        result.maxInputTokens = value;
      }
    }

    if (contextMatch && contextMatch[1]) {
      const value = parseInt(contextMatch[1], 10);
      if (!isNaN(value) && value > 0) {
        result.contextWindow = value;
      }
    }

    return result;
  }

  /**
   * 计算最终的最大 token 数
   */
  protected calculateMaxTokens(maxInputTokens?: number, contextWindow?: number): number {
    // 如果提供了 maxInputTokens 且有效，直接使用
    if (
      maxInputTokens !== undefined &&
      typeof maxInputTokens === 'number' &&
      !isNaN(maxInputTokens) &&
      maxInputTokens > 0
    ) {
      return maxInputTokens;
    }

    // 如果有 contextWindow，使用默认比例作为估算值
    if (
      contextWindow !== undefined &&
      typeof contextWindow === 'number' &&
      !isNaN(contextWindow) &&
      contextWindow > 0
    ) {
      return Math.floor(contextWindow * DEFAULT_CONTEXT_WINDOW_RATIO);
    }

    // 默认返回 UNLIMITED_TOKENS 表示无限制
    return UNLIMITED_TOKENS;
  }

  /**
   * 处理错误并返回标准化的错误结果
   */
  protected handleError(error: unknown, _modelName: string): AIConfigResult {
    // 处理错误
    let errorMessage = '获取配置失败：未知错误';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}
