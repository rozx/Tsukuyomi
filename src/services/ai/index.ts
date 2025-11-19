import type { AIProvider } from 'src/types/ai/ai-model';
import type {
  AIService,
  AIServiceConfig,
  AIConfigResult,
  TextGenerationRequest,
  TextGenerationResult,
  AvailableModelsResult,
} from 'src/types/ai/ai-service';
import { OpenAIService } from './providers';
import { GeminiService } from './providers';

/**
 * AI 服务工厂
 * 提供统一的 AI 服务访问接口
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
   * 生成文本（流式模式，统一接口）
   * @param provider AI 提供商
   * @param config 服务配置
   * @param request 文本生成请求
   * @param onChunk 流式数据回调函数，每次收到数据块时调用
   * @returns 生成的完整文本结果
   */
  static async generateText(
    provider: AIProvider,
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: import('src/types/ai/ai-service').TextGenerationStreamCallback,
  ): Promise<TextGenerationResult> {
    const service = this.getService(provider);
    return service.generateText(config, request, onChunk);
  }

  /**
   * 获取可用模型列表（统一接口）
   * @param provider AI 提供商
   * @param config 服务配置（至少需要 apiKey 和可选的 baseUrl）
   * @returns 可用模型列表
   */
  static async getAvailableModels(
    provider: AIProvider,
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
  ): Promise<AvailableModelsResult> {
    const service = this.getService(provider);
    return service.getAvailableModels(config);
  }
}

// 导出类型和接口
export * from 'src/types/ai/ai-service';
export * from 'src/types/ai/interfaces';
export * from 'src/constants/ai';

// 导出核心服务
export * from './core';

// 导出提供商服务
export * from './providers';

// 导出任务服务
export * from './tasks';
