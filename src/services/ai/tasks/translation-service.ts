import type { AIModel } from 'src/types/ai/ai-model';
import type { AIServiceConfig, TextGenerationRequest } from 'src/types/ai/ai-service';
import { AIServiceFactory } from '../index';

/**
 * 翻译服务
 * 使用 AI 服务进行文本翻译
 */
export class TranslationService {
  /**
   * 翻译文本
   * @param text 要翻译的文本
   * @param model AI 模型配置
   * @param prompt 自定义提示词（可选）
   * @returns 翻译后的文本
   */
  static async translate(text: string, model: AIModel, prompt?: string): Promise<string> {
    if (!text?.trim()) {
      throw new Error('要翻译的文本不能为空');
    }

    if (!model.enabled) {
      throw new Error('所选模型未启用');
    }

    if (!model.isDefault.translation?.enabled) {
      throw new Error('所选模型不支持翻译任务');
    }

    const defaultPrompt = `请将以下日文小说标题翻译为简体中文，只返回翻译结果，不要包含任何其他内容：\n\n${text.trim()}`;
    const finalPrompt = prompt || defaultPrompt;

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: model.isDefault.translation?.temperature ?? 0.7,
      maxTokens: 100,
    };

    try {
      const service = AIServiceFactory.getService(model.provider);
      const request: TextGenerationRequest = {
        prompt: finalPrompt,
      };

      if (config.temperature !== undefined) {
        request.temperature = config.temperature;
      }

      if (config.maxTokens !== undefined) {
        request.maxTokens = config.maxTokens;
      }

      const result = await service.generateText(config, request);

      return result.text;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('翻译时发生未知错误');
    }
  }
}
