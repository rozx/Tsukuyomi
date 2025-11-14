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
 * AI 服务抽象接口
 */
export interface AIService {
  /**
   * 获取模型配置信息
   * 通过调用 chat completion API 来验证连接并获取配置
   */
  getConfig(config: AIServiceConfig): Promise<AIConfigResult>;
}
