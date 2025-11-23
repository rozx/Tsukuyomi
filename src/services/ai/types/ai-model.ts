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
  maxTokens: number;
  contextWindow?: number; // 上下文窗口大小（总 token 限制）
  rateLimit?: number; // 速率限制（每分钟请求数）
  apiKey: string;
  baseUrl: string;
  isDefault: AIModelDefaultTasks;
  enabled: boolean;
}
