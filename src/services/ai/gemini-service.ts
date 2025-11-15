import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIService, AIServiceConfig, AIConfigResult, ModelInfo } from './types';

export class GeminiService implements AIService {
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): GoogleGenerativeAI {
    // GoogleGenerativeAI 构造函数只接受 apiKey
    // 如果需要自定义 baseUrl，可能需要通过环境变量或其他方式配置
    // 这里先使用默认的官方 API 地址
    return new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * 获取模型配置信息
   * 专注于获取最大输入 token 数，用于限制上下文输入
   */
  async getConfig(config: AIServiceConfig): Promise<AIConfigResult> {
    try {
      // 使用 REST API 确保 JSON 通信
      const baseUrl = config.baseUrl || 'https://generativelanguage.googleapis.com';
      const apiKey = config.apiKey;
      const modelName = config.model.includes('/') ? config.model : `models/${config.model}`;
      const apiUrl = `${baseUrl}/v1beta/${modelName}:generateContent?key=${apiKey}`;

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

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
            responseMimeType: 'application/json',
          },
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

      // 解析 JSON 响应
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      // 从响应中提取模型信息
      const modelInfo: ModelInfo = {
        id: config.model,
        name: config.model,
      };

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

      const configResult: AIConfigResult = {
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

      configResult.maxTokens = finalMaxTokens;
      if (configResult.modelInfo) {
        configResult.modelInfo.maxTokens = finalMaxTokens;
      }

      return configResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '获取配置失败：未知错误';
      return {
        success: false,
        message: errorMessage,
      };
    }
  }
}
