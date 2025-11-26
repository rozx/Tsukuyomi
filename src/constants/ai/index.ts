/**
 * AI 服务相关常量
 */

/**
 * 默认的上下文窗口使用比例（用于估算 maxInputTokens）
 */
export const DEFAULT_CONTEXT_WINDOW_RATIO = 0.8;

/**
 * 默认的最大输出 token 数（用于配置请求）
 * 增加此值以确保配置 JSON 响应不会被截断
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 1000;

/**
 * 默认的温度值（用于配置请求）
 */
export const DEFAULT_TEMPERATURE = 0.1;

/**
 * 无限制 token 数的标识值
 */
export const UNLIMITED_TOKENS = -1;

/**
 * 导出所有提示词
 */
export * from './prompts';

/**
 * AI 任务类型标签映射
 */
export const TASK_TYPE_LABELS: Record<
  'translation' | 'proofreading' | 'polish' | 'termsTranslation' | 'assistant' | 'config' | 'other',
  string
> = {
  translation: '翻译',
  proofreading: '校对',
  polish: '润色',
  termsTranslation: '术语翻译',
  assistant: '助手',
  config: '配置获取',
  other: '其他',
} as const;
