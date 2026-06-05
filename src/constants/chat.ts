/**
 * 当模型没有正文只调用工具时使用的占位符。
 * 老对话历史里仍可能存在 `（调用工具）` / `(调用工具)`，过滤器需向后兼容。
 */
export const TOOL_CALL_PLACEHOLDER = '（月詠施术中）';

/**
 * 需要从输出、计数、摘要输入中过滤掉的工具调用占位符变体集合。
 */
export const TOOL_CALL_PLACEHOLDER_VARIANTS = [
  TOOL_CALL_PLACEHOLDER,
  '（调用工具）',
  '(调用工具)',
] as const;
