import OpenAI from 'openai';
import type { AIService, AIServiceConfig, AIConfigResult, ModelInfo, RateLimitInfo } from './types';

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
   * 直接询问 AI 模型来获取配置信息
   */
  async getConfig(config: AIServiceConfig): Promise<AIConfigResult> {
    try {
      const baseUrl = config.baseUrl || 'https://api.openai.com/v1';
      const apiKey = config.apiKey;

      // 询问 AI 模型关于其配置信息
      const prompt = `请以 JSON 格式返回你的配置信息，包括：
      1. maxTokens: 最大输出 token 数
      2. contextWindow: 上下文窗口大小（总 token 限制）
      3. modelName: 模型名称
      4. rateLimit: 速率限制（每分钟请求数，必须是数字）

      请只返回 JSON 对象，格式如下：
      {
        "maxTokens": 数字,
        "contextWindow": 数字,
        "modelName": "字符串",
        "rateLimit": 数字（每分钟请求数，例如：500）
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
          max_tokens: 500,
          temperature: 0.3, // 使用较低的温度以获得更准确的配置信息
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

      let maxTokens: number | undefined;
      let contextWindow: number | undefined;
      const rateLimit: RateLimitInfo = {};

      // 尝试解析 AI 返回的 JSON 配置
      if (content) {
        try {
          const configJson = JSON.parse(content);
          if (typeof configJson.maxTokens === 'number') {
            maxTokens = configJson.maxTokens;
          }
          if (typeof configJson.contextWindow === 'number') {
            contextWindow = configJson.contextWindow;
            // 如果没有 maxTokens，使用 contextWindow 作为参考
            if (!maxTokens && contextWindow) {
              maxTokens = Math.floor(contextWindow * 0.75); // 通常 maxTokens 约为 contextWindow 的 75%
            }
          }
          if (configJson.modelName) {
            modelInfo.name = configJson.modelName;
            modelInfo.displayName = configJson.modelName;
          }
          // 从 AI 响应中提取速率限制信息（确保是数字）
          if (configJson.rateLimit !== undefined) {
            const limitValue =
              typeof configJson.rateLimit === 'number'
                ? configJson.rateLimit
                : parseInt(String(configJson.rateLimit), 10);
            if (!isNaN(limitValue)) {
              rateLimit.limit = limitValue;
            }
          }
        } catch {
          // 如果解析失败，尝试从文本中提取数字
          const maxTokensMatch = content.match(/maxTokens["\s:]+(\d+)/i);
          const contextMatch = content.match(/contextWindow["\s:]+(\d+)/i);
          const rateLimitMatch = content.match(/rateLimit["\s:]+(\d+)/i);

          if (maxTokensMatch) {
            maxTokens = parseInt(maxTokensMatch[1], 10);
          }
          if (contextMatch) {
            contextWindow = parseInt(contextMatch[1], 10);
            if (!maxTokens && contextWindow) {
              maxTokens = Math.floor(contextWindow * 0.75);
            }
          }
          if (rateLimitMatch) {
            const limitValue = parseInt(rateLimitMatch[1], 10);
            if (!isNaN(limitValue)) {
              rateLimit.limit = limitValue;
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
        rateLimit: Object.keys(rateLimit).length > 0 ? rateLimit : undefined,
      };

      if (maxTokens) {
        result.maxTokens = maxTokens;
        if (result.modelInfo) {
          result.modelInfo.maxTokens = maxTokens;
        }
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
