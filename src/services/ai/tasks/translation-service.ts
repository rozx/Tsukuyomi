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

    const trimmedText = text.trim();
    const defaultPrompt = `请将以下日文文本翻译为简体中文，保持原文的格式和结构，只返回翻译结果，不要包含任何其他内容：\n\n${trimmedText}`;
    const finalPrompt = prompt || defaultPrompt;

    // 动态计算 maxTokens：
    // 日文和中文通常每个字符约为 1-2 tokens，为了确保完整翻译，我们使用更保守的估算
    // 估算输入 token 数（日文每个字符约 1.5 tokens）
    const estimatedInputTokens = Math.ceil(trimmedText.length * 1.5);
    // 输出通常与输入长度相似或稍长（中文翻译），加上一些缓冲
    // 使用输入 token 数的 2 倍作为输出上限，确保有足够空间
    const estimatedOutputTokens = estimatedInputTokens * 2;
    const minTokens = 500; // 最小 500 tokens，确保足够翻译较长的文本
    const maxTokensLimit = model.maxTokens && model.maxTokens > 0 ? model.maxTokens : 8000; // 使用模型限制或默认 8000
    const calculatedMaxTokens = Math.max(minTokens, Math.min(estimatedOutputTokens, maxTokensLimit));

    const config: AIServiceConfig = {
      apiKey: model.apiKey,
      baseUrl: model.baseUrl,
      model: model.model,
      temperature: model.isDefault.translation?.temperature ?? 0.7,
      maxTokens: calculatedMaxTokens,
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
