import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
} from 'src/types/ai/ai-service';
import type { ParsedResponse } from 'src/types/ai/interfaces';
import { BaseAIService } from '../core';
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
   * 规范化模型名称（移除 models/ 前缀）
   */
  private normalizeModelName(model: string): string {
    return model.includes('/') ? model.replace('models/', '') : model;
  }

  /**
   * 发送配置请求到 Gemini API 并解析响应
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const modelName = this.normalizeModelName(config.model);
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

  /**
   * 发送文本生成请求到 Gemini API
   */
  protected async makeTextGenerationRequest(
    config: AIServiceConfig,
    request: TextGenerationRequest,
  ): Promise<TextGenerationResult> {
    try {
      const client = this.createClient(config);
      const modelName = this.normalizeModelName(config.model);

      const generationConfig: {
        temperature?: number;
        maxOutputTokens?: number;
      } = {};

      const temperature = request.temperature ?? config.temperature;
      if (temperature !== undefined) {
        generationConfig.temperature = temperature;
      }

      const maxTokens = request.maxTokens ?? config.maxTokens;
      if (maxTokens !== undefined) {
        generationConfig.maxOutputTokens = maxTokens;
      }

      const model = client.getGenerativeModel({
        model: modelName,
        ...(Object.keys(generationConfig).length > 0 && { generationConfig }),
      });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
      });

      const text = result.response.text().trim();
      if (!text) {
        throw new Error('AI 返回的文本为空');
      }

      return {
        text,
        model: config.model,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Gemini 文本生成请求失败');
    }
  }
}
