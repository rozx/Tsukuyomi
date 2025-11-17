/**
 * AI 服务相关常量
 */

/**
 * 默认的上下文窗口使用比例（用于估算 maxInputTokens）
 */
export const DEFAULT_CONTEXT_WINDOW_RATIO = 0.8;

/**
 * 默认的最大输出 token 数（用于配置请求）
 */
export const DEFAULT_MAX_OUTPUT_TOKENS = 200;

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
