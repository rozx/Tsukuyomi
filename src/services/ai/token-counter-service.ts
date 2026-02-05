import type { ChatMessage } from 'src/services/ai/types/ai-service';
import type { AIModel, AIProvider } from 'src/services/ai/types/ai-model';
import { countMessagesTokens, countTextTokens } from 'src/utils/ai-token-utils';
import { GeminiService } from 'src/services/ai/providers/gemini-service';

/**
 * Token 计数服务
 *
 * 提供统一的 token 计数接口，支持不同的 AI 提供商：
 * - OpenAI: 使用 gpt-tokenizer 进行本地精确计算（同步）
 * - Gemini: 支持使用 Gemini API 的 countTokens 进行精确计算（异步），
 *           也可使用本地估算（同步）
 */
export class TokenCounterService {
  private static geminiService: GeminiService | null = null;

  /**
   * 获取 GeminiService 实例（懒加载）
   */
  private static getGeminiService(): GeminiService {
    if (!this.geminiService) {
      this.geminiService = new GeminiService();
    }
    return this.geminiService;
  }

  /**
   * 同步计算消息的 token 数量
   *
   * 对于所有提供商都使用 gpt-tokenizer 进行计算
   * 这个方法是同步的，适合 UI 显示等需要即时结果的场景
   *
   * @param messages 消息数组
   * @param _provider 提供商（目前未使用，保留用于未来扩展）
   * @returns token 数量
   */
  static countMessagesSync(
    messages: ChatMessage[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _provider?: AIProvider,
  ): number {
    return countMessagesTokens(messages);
  }

  /**
   * 同步计算文本的 token 数量
   *
   * @param text 文本内容
   * @param _provider 提供商（目前未使用，保留用于未来扩展）
   * @returns token 数量
   */
  static countTextSync(
    text: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _provider?: AIProvider,
  ): number {
    return countTextTokens(text);
  }

  /**
   * 异步计算文本的 token 数量
   *
   * 对于 Gemini 提供商，可以使用 API 进行精确计算
   * 对于其他提供商，回退到同步计算
   *
   * @param text 文本内容
   * @param model AI 模型配置（包含 provider、apiKey、model 等）
   * @returns token 数量
   */
  static async countTextAsync(
    text: string,
    model?: Pick<AIModel, 'provider' | 'apiKey' | 'baseUrl' | 'model'>,
  ): Promise<number> {
    // 如果没有提供模型配置或不是 Gemini，使用同步计算
    if (!model || model.provider !== 'gemini') {
      return countTextTokens(text);
    }

    // 使用 Gemini API 计算
    try {
      const geminiService = this.getGeminiService();
      return await geminiService.countTokens(
        {
          apiKey: model.apiKey,
          baseUrl: model.baseUrl,
          model: model.model,
        },
        text,
      );
    } catch (error) {
      console.warn('Gemini API countTokens 失败，回退到本地计算:', error);
      return countTextTokens(text);
    }
  }

  /**
   * 异步计算消息的 token 数量
   *
   * 对于 Gemini 提供商，将消息转换为文本后使用 API 进行精确计算
   * 对于其他提供商，回退到同步计算
   *
   * @param messages 消息数组
   * @param model AI 模型配置
   * @returns token 数量
   */
  static async countMessagesAsync(
    messages: ChatMessage[],
    model?: Pick<AIModel, 'provider' | 'apiKey' | 'baseUrl' | 'model'>,
  ): Promise<number> {
    // 如果没有提供模型配置或不是 Gemini，使用同步计算
    if (!model || model.provider !== 'gemini') {
      return countMessagesTokens(messages);
    }

    // 将消息转换为文本
    const text = messages
      .map((msg) => {
        const parts: string[] = [];
        if (msg.content) parts.push(msg.content);
        if (msg.tool_calls) {
          try {
            parts.push(JSON.stringify(msg.tool_calls));
          } catch {
            parts.push('tool_calls_placeholder');
          }
        }
        if (msg.tool_call_id) parts.push(msg.tool_call_id);
        if (msg.name) parts.push(msg.name);
        if (msg.reasoning_content) parts.push(msg.reasoning_content);
        return parts.join('\n');
      })
      .join('\n');

    return this.countTextAsync(text, model);
  }
}
