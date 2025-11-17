import type { AIProvider } from 'src/types/ai/ai-model';
import type { AIService, AIServiceConfig, AIConfigResult } from './types';
import { OpenAIService } from './openai-service';
import { GeminiService } from './gemini-service';

/**
 * AI 服务工厂
 */
export class AIServiceFactory {
  private static services: Map<AIProvider, AIService> = new Map<AIProvider, AIService>([
    ['openai', new OpenAIService()],
    ['gemini', new GeminiService()],
  ]);

  /**
   * 获取指定提供商的服务实例
   */
  static getService(provider: AIProvider): AIService {
    const service = this.services.get(provider);
    if (!service) {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
    return service;
  }

  /**
   * 获取模型配置（统一接口）
   * 通过调用 chat completion API 来验证连接并获取配置
   */
  static async getConfig(provider: AIProvider, config: AIServiceConfig): Promise<AIConfigResult> {
    const service = this.getService(provider);
    return service.getConfig(config);
  }
}

export * from './types';
export * from 'src/types/ai/interfaces';
export * from 'src/constants/ai';
