import { GoogleGenerativeAI } from '@google/generative-ai';
import type { AIServiceConfig } from './types';
import type { ParsedResponse } from 'src/types/ai/interfaces';
import { BaseAIService } from './base-ai-service';
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TEMPERATURE } from 'src/constants/ai';

/**
 * Gemini AI 服务实现
 * 使用 Google Generative AI API
 */
export class GeminiService extends BaseAIService {
  /**
   * 创建 Gemini 客户端
   * 注意：GoogleGenerativeAI 构造函数只接受 apiKey
   * 如果需要自定义 baseUrl，需要通过环境变量或其他方式配置
   */
  private createClient(config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>): GoogleGenerativeAI {
    return new GoogleGenerativeAI(config.apiKey);
  }

  /**
   * 发送配置请求到 Gemini API 并解析响应
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const modelName = config.model.includes('/')
        ? config.model.replace('models/', '')
        : config.model;
      const model = client.getGenerativeModel({
        model: modelName,
        generationConfig: {
          temperature: DEFAULT_TEMPERATURE,
          maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
          responseMimeType: 'application/json',
        },
      });

      const result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: this.CONFIG_PROMPT }],
          },
        ],
      });

      const response = result.response;
      const text = response.text();

      return {
        content: text || null,
        modelId: config.model,
      };
    } catch (error) {
      // 将官方 SDK 的错误转换为标准错误格式
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini API 请求失败');
    }
  }
}
