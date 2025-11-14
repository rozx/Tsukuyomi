/**
 * AI 模型提供者类型
 */
export type AIProvider = 'openai' | 'gemini';

/**
 * AI 模型默认任务配置
 */
export interface AIModelDefaultTasks {
  translation: boolean;
  proofreading: boolean;
  polishing: boolean;
  characterExtraction: boolean;
  terminologyExtraction: boolean;
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
  apiKey: string;
  baseUrl: string;
  isDefault: AIModelDefaultTasks;
  enabled: boolean;
}
