/**
 * AI 模型提供者类型
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * 任务配置
 */
export interface TaskConfig {
  enabled: boolean;
  temperature: number;
}

/**
 * AI 模型默认任务配置
 */
export interface AIModelDefaultTasks {
  translation: TaskConfig;
  proofreading: TaskConfig; // 校对和润色合并为一个任务
  termsTranslation: TaskConfig;
  assistant: TaskConfig;
}

/**
 * AI 模型配置接口
 */
export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  model: string;
  temperature: number;
  /**
   * 最大输入 token 数（上下文窗口大小）
   * 0 表示无限制
   */
  maxInputTokens: number;
  /**
   * 最大输出 token 数
   * 0 表示无限制
   */
  maxOutputTokens: number;
  rateLimit?: number; // 速率限制（每分钟请求数）
  apiKey: string;
  baseUrl: string;
  isDefault: AIModelDefaultTasks;
  customHeaders?: Record<string, string> | undefined;
  /**
   * 是否使用 CORS 代理发送 API 请求（仅 SPA 模式有效）
   * undefined 或 true 表示启用（默认行为），false 表示跳过 CORS 代理
   */
  useCorsProxy?: boolean | undefined;
  enabled: boolean;
  /**
   * 最后编辑时间
   */
  lastEdited: Date;
}
