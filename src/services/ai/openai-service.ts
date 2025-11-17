import OpenAI from 'openai';
import type { AIServiceConfig } from './types';
import type { ParsedResponse } from 'src/types/ai/interfaces';
import { BaseAIService } from './base-ai-service';
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
}
