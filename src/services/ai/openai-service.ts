import OpenAI from 'openai';
import type { AIService, AIServiceConfig, AIConfigResult, ModelInfo } from './types';

export class OpenAIService implements AIService {
  /**
   * 创建 OpenAI 客户端
   * 确保所有通信都使用 JSON 格式
   * 注意：在浏览器环境中需要设置 dangerouslyAllowBrowser: true
   */
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): OpenAI {
    return new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl || 'https://api.openai.com/v1',
      dangerouslyAllowBrowser: true, // 允许在浏览器环境中使用（用户已了解风险）
      defaultHeaders: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });
  }

  /**
   * 获取模型配置信息
   * 专注于获取最大输入 token 数，用于限制上下文输入
   */
  async getConfig(config: AIServiceConfig): Promise<AIConfigResult> {
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = config.apiKey;

      // 询问 AI 模型关于其最大输入 token 数
      const prompt = `请以 JSON 格式返回你的最大输入 token 数（maxInputTokens），这是我可以发送给你的最大 token 数量，用于限制上下文输入。

      请只返回 JSON 对象，格式如下：
      {
        "maxInputTokens": 数字
      }

      如果你不知道确切的 maxInputTokens，但知道 contextWindow（总上下文窗口大小），可以返回：
      {
        "maxInputTokens": 数字,
        "contextWindow": 数字
      }`;

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 200,
          temperature: 0.1,
          response_format: { type: 'json_object' }, // 要求 JSON 格式响应
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage =
          (errorData as { error?: { message?: string } })?.error?.message ||
          `HTTP ${response.status}: ${response.statusText}`;
        return {
          success: false,
          message: errorMessage,
        };
      }

      // 解析响应体
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      // 尝试从响应中提取模型信息
      const modelInfo: ModelInfo = {
        id: config.model,
        name: config.model,
      };

      if (data.model) {
        modelInfo.id = data.model;
        modelInfo.name = data.model;
      }

      let maxInputTokens: number | undefined;
      let contextWindow: number | undefined;

      // 尝试解析 AI 返回的 JSON 配置
      if (content) {
        try {
          const configJson = JSON.parse(content);
          if (typeof configJson.maxInputTokens === 'number') {
            maxInputTokens = configJson.maxInputTokens;
          }
          if (typeof configJson.contextWindow === 'number') {
            contextWindow = configJson.contextWindow;
            // 如果没有 maxInputTokens，使用 contextWindow 的 80% 作为估算值（保留 20% 给输出）
            if (!maxInputTokens && contextWindow) {
              maxInputTokens = Math.floor(contextWindow * 0.8);
            }
          }
        } catch {
          // 如果解析失败，尝试从文本中提取数字
          const maxInputTokensMatch = content.match(/maxInputTokens["\s:]+(\d+)/i);
          const contextMatch = content.match(/contextWindow["\s:]+(\d+)/i);

          if (maxInputTokensMatch) {
            maxInputTokens = parseInt(maxInputTokensMatch[1], 10);
          }
          if (contextMatch) {
            contextWindow = parseInt(contextMatch[1], 10);
            if (!maxInputTokens && contextWindow) {
              maxInputTokens = Math.floor(contextWindow * 0.8);
            }
          }
        }
      }

      if (contextWindow) {
        modelInfo.contextWindow = contextWindow;
      }

      const result: AIConfigResult = {
        success: true,
        message: `模型 "${config.model}" 配置已获取`,
        modelInfo,
      };

      // maxTokens 字段用于存储最大输入 token 数
      // 如果不是有效数字，设置为 -1 表示无限制
      const finalMaxTokens =
        maxInputTokens !== undefined &&
        typeof maxInputTokens === 'number' &&
        !isNaN(maxInputTokens) &&
        maxInputTokens > 0
          ? maxInputTokens
          : -1;

      result.maxTokens = finalMaxTokens;
      if (result.modelInfo) {
        result.modelInfo.maxTokens = finalMaxTokens;
      }

      return result;
    } catch (error) {
      let errorMessage = '获取配置失败：未知错误';
      if (error && typeof error === 'object' && 'error' in error) {
        const errorObj = (error as { error?: { message?: string } }).error;
        if (errorObj?.message) {
          errorMessage = errorObj.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      return {
        success: false,
        message: errorMessage,
      };
    }
  }
}
