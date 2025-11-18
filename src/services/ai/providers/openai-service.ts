import OpenAI from 'openai';
import type {
  AIServiceConfig,
  TextGenerationRequest,
  TextGenerationResult,
} from 'src/types/ai/ai-service';
import type { ParsedResponse } from 'src/types/ai/interfaces';
import { BaseAIService } from '../core';
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_TEMPERATURE } from 'src/constants/ai';

/**
 * OpenAI AI 服务实现
 * 使用 OpenAI API
 */
export class OpenAIService extends BaseAIService {
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
   * 发送配置请求到 OpenAI API 并解析响应
   */
  protected async makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse> {
    try {
      const client = this.createClient(config);
      const completion = await client.chat.completions.create({
        model: config.model,
        messages: [{ role: 'user', content: this.CONFIG_PROMPT }],
        max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
        temperature: DEFAULT_TEMPERATURE,
        response_format: { type: 'json_object' }, // 要求 JSON 格式响应
      });

      const content = completion.choices[0]?.message?.content || null;
      const modelId = completion.model || config.model;

      return {
        content,
        modelId,
      };
    } catch (error) {
      // 将官方 SDK 的错误转换为标准错误格式
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OpenAI API 请求失败');
    }
  }

  /**
   * 发送文本生成请求到 OpenAI API
   */
  protected async makeTextGenerationRequest(
    config: AIServiceConfig,
    request: TextGenerationRequest,
  ): Promise<TextGenerationResult> {
    try {
      const client = this.createClient(config);

      const requestParams: {
        model: string;
        messages: Array<{ role: 'user'; content: string }>;
        temperature?: number;
        max_tokens?: number;
      } = {
        model: config.model,
        messages: [{ role: 'user', content: request.prompt }],
      };

      const temperature = request.temperature ?? config.temperature;
      if (temperature !== undefined) {
        requestParams.temperature = temperature;
      }

      const maxTokens = request.maxTokens ?? config.maxTokens;
      if (maxTokens !== undefined) {
        requestParams.max_tokens = maxTokens;
      }

      const completion = await client.chat.completions.create(requestParams);

      const text = completion.choices[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('AI 返回的文本为空');
      }

      return {
        text,
        model: completion.model || config.model,
      };
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('OpenAI 文本生成请求失败');
    }
  }
}
