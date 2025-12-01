/**
 * AI 服务配置接口
 */
export interface AIServiceConfig {
  apiKey: string;
  baseUrl?: string | undefined;
  model: string;
  temperature?: number | undefined;
  maxTokens?: number | undefined;
  signal?: AbortSignal | undefined; // 用于取消请求
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
 * AI 工具定义
 */
export interface AITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

/**
 * AI 工具调用
 */
export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON 字符串
  };
}

/**
 * AI 工具调用结果
 */
export interface AIToolCallResult {
  tool_call_id: string;
  role: 'tool';
  name: string;
  content: string; // JSON 字符串或文本
}

/**
 * 聊天消息接口
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
  /**
   * 思考内容（reasoning_content）- DeepSeek 等模型在使用工具时需要此字段
   */
  reasoning_content?: string | null;
}

/**
 * 文本生成请求参数
 */
export interface TextGenerationRequest {
  prompt?: string; // 兼容旧接口，如果提供了 messages 则优先使用 messages
  messages?: ChatMessage[];
  tools?: AITool[];
  temperature?: number;
  maxTokens?: number;
}

/**
 * 文本生成结果
 */
export interface TextGenerationResult {
  text: string;
  model?: string;
  toolCalls?: AIToolCall[]; // 如果有工具调用
  finishReason?: string; // stop, length, tool_calls, content_filter, etc.
  reasoningContent?: string; // 思考内容（reasoning_content）- DeepSeek 等模型在使用工具时返回
}

/**
 * 流式文本生成块
 */
export interface TextGenerationChunk {
  text: string;
  done: boolean;
  model?: string;
  toolCalls?: AIToolCall[]; // 流式响应中可能包含工具调用片段（通常需要客户端拼接）
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
