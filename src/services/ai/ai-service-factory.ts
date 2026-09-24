import type { AIProvider } from 'src/services/ai/types/ai-model';
import type {
  AIService,
  AIServiceConfig,
  AIConfigResult,
  AvailableModelsResult,
} from 'src/services/ai/types/ai-service';
import { OpenAIService } from 'src/services/ai/providers/openai-service';
import { GeminiService } from 'src/services/ai/providers/gemini-service';
import { AiSdkAIService } from 'src/services/ai/providers/ai-sdk/service';

/**
 * AI 服务工厂
 * 提供统一的 AI 服务访问接口
 */
export class AIServiceFactory {
  private static sdkServices: Map<AIProvider, AIService> = new Map([
    ['openai', new AiSdkAIService('openai')],
    ['gemini', new AiSdkAIService('gemini')],
  ]);
  private static services: Map<AIProvider, AIService> = new Map<AIProvider, AIService>([
    ['openai', new OpenAIService()],
    ['gemini', new GeminiService()],
  ]);

  /**
   * 获取指定提供商的服务实例
   */
  static getService(provider: AIProvider): AIService {
    let backend: string | null = null;
    try {
      backend = localStorage.getItem('tsukuyomi.aiProviderBackend');
    } catch {
      /* 存储被禁用时维持迁移期默认实现。 */
    }
    const service = (backend === 'ai-sdk' ? this.sdkServices : this.services).get(provider);
    if (!service) {
      throw new Error(`不支持的 AI 提供商: ${provider}`);
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

  /**
   * 获取可用模型列表（统一接口）
   * @param provider AI 提供商
   * @param config 服务配置（至少需要 apiKey 和可选的 baseUrl）
   * @returns 可用模型列表
   */
  static async getAvailableModels(
    provider: AIProvider,
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl' | 'customHeaders' | 'useCorsProxy'>,
  ): Promise<AvailableModelsResult> {
    const service = this.getService(provider);
    return service.getAvailableModels(config);
  }
}
