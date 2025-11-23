import type {
  AIService,
  AIServiceConfig,
  AIConfigResult,
  ModelInfo,
  TextGenerationRequest,
  TextGenerationResult,
  TextGenerationStreamCallback,
  AvailableModelsResult,
} from 'src/services/ai/types/ai-service';
import type {
  ParsedResponse,
  ConfigJson,
  ConfigParseResult,
} from 'src/services/ai/types/interfaces';
import { CONFIG_PROMPT, DEFAULT_CONTEXT_WINDOW_RATIO, UNLIMITED_TOKENS } from 'src/constants/ai';

/**
 * AI 服务基础抽象类
 * 提供通用的配置获取逻辑和错误处理
 */
export abstract class BaseAIService implements AIService {
  /**
   * 获取配置信息的提示词
   */
  protected readonly CONFIG_PROMPT = CONFIG_PROMPT;

  /**
   * 获取模型配置信息
   * 子类需要实现 makeConfigRequest 方法
   */
  async getConfig(config: AIServiceConfig): Promise<AIConfigResult> {
    try {
      // 验证配置
      this.validateConfig(config);

      // 发送请求并解析响应
      const parsedResponse = await this.makeConfigRequest(config);

      // 构建模型信息
      const modelInfo = this.buildModelInfo(config, parsedResponse);

      // 解析配置 JSON
      const { maxInputTokens, contextWindow } = this.parseConfigJson(parsedResponse.content);

      // 更新模型信息
      if (contextWindow) {
        modelInfo.contextWindow = contextWindow;
      }

      // 计算最终的最大 token 数
      const finalMaxTokens = this.calculateMaxTokens(maxInputTokens, contextWindow);

      // 构建结果
      const result: AIConfigResult = {
        success: true,
        message: `模型 "${config.model}" 配置已获取`,
        modelInfo: {
          ...modelInfo,
          maxTokens: finalMaxTokens,
        },
        maxTokens: finalMaxTokens,
      };

      return result;
    } catch (error) {
      return this.handleError(error, config.model);
    }
  }

  /**
   * 验证配置参数
   */
  protected validateConfig(config: AIServiceConfig): void {
    if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
      throw new Error('API Key 不能为空');
    }
    if (!config.model || typeof config.model !== 'string' || config.model.trim() === '') {
      throw new Error('模型名称不能为空');
    }
  }

  /**
   * 发送配置请求并解析响应（子类需要实现）
   * 返回解析后的响应数据
   */
  protected abstract makeConfigRequest(config: AIServiceConfig): Promise<ParsedResponse>;

  /**
   * 估算文本的 token 数（粗略估算）
   * 对于日文和中文，每个字符大约 1-2 tokens
   * 使用保守估算：每个字符 2 tokens
   */
  protected estimateTokenCount(text: string): number {
    if (!text) return 0;
    // 保守估算：每个字符 2 tokens（对于日文和中文）
    return Math.ceil(text.length * 2);
  }

  /**
   * 生成文本（流式模式，子类需要实现）
   * @param config 服务配置
   * @param request 文本生成请求
   * @param onChunk 流式数据回调函数，每次收到数据块时调用
   * @returns 生成的完整文本结果
   */
  async generateText(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ): Promise<TextGenerationResult> {
    // 验证配置
    this.validateConfig(config);

    // 验证请求
    const hasPrompt = !!request.prompt?.trim();
    const hasMessages = request.messages && request.messages.length > 0;

    if (!hasPrompt && !hasMessages) {
      throw new Error('提示词或消息列表不能为空');
    }

    // 检查 prompt 长度，如果可能超过限制则显示警告（但不截断）
    // 注意：这里我们无法准确知道模型的 maxInputTokens，所以只做粗略检查
    // 如果 prompt 很长（比如超过 10000 字符），显示警告
    let estimatedTokens = 0;
    let promptLength = 0;

    if (hasPrompt) {
      promptLength = request.prompt!.length;
      estimatedTokens = this.estimateTokenCount(request.prompt!);
    } else if (hasMessages) {
      // 粗略估算消息的 token 数
      const messagesContent = request.messages!.map((m) => m.content || '').join('\n');
      promptLength = messagesContent.length;
      estimatedTokens = this.estimateTokenCount(messagesContent);
    }

    // 如果估算的 token 数超过限制，显示警告
    // 只有当 maxTokens 是有效正数时才进行检查（UNLIMITED_TOKENS = -1 表示无限制）
    const maxTokens = config.maxTokens ?? 100000;
    if (maxTokens > 0 && estimatedTokens > maxTokens) {
      console.warn(
        `[AI Service] 警告：提示词可能超过模型限制。估算 token 数: ${estimatedTokens}，字符数: ${promptLength}，模型限制: ${maxTokens}。文本将完整发送，但可能被模型截断。`,
      );
    }

    // 调用子类实现（流式模式）
    return this.makeTextGenerationRequest(config, request, onChunk);
  }

  /**
   * 发送文本生成请求（流式模式，子类需要实现）
   */
  protected abstract makeTextGenerationRequest(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ): Promise<TextGenerationResult>;

  /**
   * 获取可用的模型列表
   * 子类需要实现 makeAvailableModelsRequest 方法
   */
  async getAvailableModels(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
  ): Promise<AvailableModelsResult> {
    try {
      // 验证配置
      if (!config.apiKey || typeof config.apiKey !== 'string' || config.apiKey.trim() === '') {
        throw new Error('API Key 不能为空');
      }

      // 调用子类实现获取模型列表
      const models = await this.makeAvailableModelsRequest(config);

      return {
        success: true,
        message: '模型列表获取成功',
        models,
      };
    } catch (error) {
      return this.handleAvailableModelsError(error);
    }
  }

  /**
   * 获取可用模型列表（子类需要实现）
   * @param config 服务配置（至少需要 apiKey 和可选的 baseUrl）
   * @returns 模型信息列表
   */
  protected abstract makeAvailableModelsRequest(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
  ): Promise<ModelInfo[]>;

  /**
   * 处理获取模型列表时的错误
   */
  protected handleAvailableModelsError(error: unknown): AvailableModelsResult {
    let errorMessage = '获取模型列表失败：未知错误';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    }

    return {
      success: false,
      message: errorMessage,
    };
  }

  /**
   * 构建模型信息
   */
  protected buildModelInfo(config: AIServiceConfig, parsedResponse: ParsedResponse): ModelInfo {
    return {
      id: parsedResponse.modelId || config.model,
      name: parsedResponse.modelId || config.model,
    };
  }

  /**
   * 解析配置 JSON
   */
  protected parseConfigJson(content: string | null): ConfigParseResult {
    if (!content) {
      return {};
    }

    let maxInputTokens: number | undefined;
    let contextWindow: number | undefined;

    try {
      // 尝试解析 JSON
      const configJson: ConfigJson = JSON.parse(content);
      if (typeof configJson.maxInputTokens === 'number') {
        maxInputTokens = configJson.maxInputTokens;
      }
      if (typeof configJson.contextWindow === 'number') {
        contextWindow = configJson.contextWindow;
      }
    } catch {
      // JSON 解析失败，尝试从文本中提取
      const extracted = this.extractConfigFromText(content);
      maxInputTokens = extracted.maxInputTokens;
      contextWindow = extracted.contextWindow;
    }

    // 如果没有 maxInputTokens 但有 contextWindow，使用默认比例作为估算值
    if (!maxInputTokens && contextWindow) {
      maxInputTokens = Math.floor(contextWindow * DEFAULT_CONTEXT_WINDOW_RATIO);
    }

    // 仅在值存在时包含属性，以符合 exactOptionalPropertyTypes
    const result: ConfigParseResult = {};
    if (maxInputTokens !== undefined) {
      result.maxInputTokens = maxInputTokens;
    }
    if (contextWindow !== undefined) {
      result.contextWindow = contextWindow;
    }
    return result;
  }

  /**
   * 从文本中提取配置信息
   */
  protected extractConfigFromText(text: string): ConfigParseResult {
    const maxInputTokensMatch = text.match(/maxInputTokens["\s:]+(\d+)/i);
    const contextMatch = text.match(/contextWindow["\s:]+(\d+)/i);

    const result: ConfigParseResult = {};

    if (maxInputTokensMatch && maxInputTokensMatch[1]) {
      const value = parseInt(maxInputTokensMatch[1], 10);
      if (!isNaN(value) && value > 0) {
        result.maxInputTokens = value;
      }
    }

    if (contextMatch && contextMatch[1]) {
      const value = parseInt(contextMatch[1], 10);
      if (!isNaN(value) && value > 0) {
        result.contextWindow = value;
      }
    }

    return result;
  }

  /**
   * 计算最终的最大 token 数
   */
  protected calculateMaxTokens(maxInputTokens?: number, contextWindow?: number): number {
    // 如果提供了 maxInputTokens 且有效，直接使用
    if (
      maxInputTokens !== undefined &&
      typeof maxInputTokens === 'number' &&
      !isNaN(maxInputTokens) &&
      maxInputTokens > 0
    ) {
      return maxInputTokens;
    }

    // 如果有 contextWindow，使用默认比例作为估算值
    if (
      contextWindow !== undefined &&
      typeof contextWindow === 'number' &&
      !isNaN(contextWindow) &&
      contextWindow > 0
    ) {
      return Math.floor(contextWindow * DEFAULT_CONTEXT_WINDOW_RATIO);
    }

    // 默认返回 UNLIMITED_TOKENS 表示无限制
    return UNLIMITED_TOKENS;
  }

  /**
   * 处理错误并返回标准化的错误结果
   */
  protected handleError(error: unknown, _modelName: string): AIConfigResult {
    // 处理错误
    let errorMessage = '获取配置失败：未知错误';

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (error && typeof error === 'object' && 'message' in error) {
      errorMessage = String(error.message);
    }

    return {
      success: false,
      message: errorMessage,
    };
  }
}
