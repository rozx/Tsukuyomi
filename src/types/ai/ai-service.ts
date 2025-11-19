/**
 * AI 服务配置接口
 */
export interface AIServiceConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  model: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
}

/**
 * 模型信息接口
 */
export interface ModelInfo {
  id: string;
  name?: string | undefined;
  displayName?: string | undefined;
  ownedBy?: string | undefined;
  maxTokens?: number | undefined;
  contextWindow?: number | undefined;
}

/**
 * 速率限制信息接口
 */
export interface RateLimitInfo {
  limit?: number; // 速率限制（每分钟请求数）
}

/**
 * AI 配置获取结果接口
 */
export interface AIConfigResult {
  success: boolean;
  message: string;
  modelInfo?: ModelInfo | undefined;
  rateLimit?: RateLimitInfo | undefined;
  maxTokens?: number | undefined;
}

/**
 * 文本生成请求参数
 */
export interface TextGenerationRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * 文本生成结果
 */
export interface TextGenerationResult {
  text: string;
  model?: string;
}

/**
 * 流式文本生成块
 */
export interface TextGenerationChunk {
  text: string;
  done: boolean;
  model?: string;
}

/**
 * 流式文本生成回调函数类型
 */
export type TextGenerationStreamCallback = (chunk: TextGenerationChunk) => void | Promise<void>;

/**
 * 可用模型列表获取结果
 */
export interface AvailableModelsResult {
  success: boolean;
  message: string;
  models?: ModelInfo[];
}

/**
 * AI 服务抽象接口
 */
export interface AIService {
  /**
   * 获取模型配置信息
   * 通过调用 chat completion API 来验证连接并获取配置
   */
  getConfig(config: AIServiceConfig): Promise<AIConfigResult>;

  /**
   * 生成文本（流式模式）
   * @param config 服务配置
   * @param request 文本生成请求
   * @param onChunk 流式数据回调函数，每次收到数据块时调用
   * @returns 生成的完整文本结果
   */
  generateText(
    config: AIServiceConfig,
    request: TextGenerationRequest,
    onChunk?: TextGenerationStreamCallback,
  ): Promise<TextGenerationResult>;

  /**
   * 获取可用的模型列表
   * @param config 服务配置（至少需要 apiKey 和可选的 baseUrl）
   * @returns 可用模型列表
   */
  getAvailableModels(
    config: Pick<AIServiceConfig, 'apiKey' | 'baseUrl'>,
  ): Promise<AvailableModelsResult>;
}
