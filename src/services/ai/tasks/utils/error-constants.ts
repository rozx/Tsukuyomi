/**
 * AI 任务执行过程中可能出现的特定错误标识符
 * 用于统一抛出和捕获错误，避免硬编码字符串耦合
 */
export const AI_ERROR_MARKERS = {
  /**
   * 检测到无效的状态值（非 planning, working, review, end）
   */
  INVALID_STATUS: '无效状态',

  /**
   * 检测到非法的状态流转（例如直接从 planning 跳到 end）
   */
  INVALID_TRANSITION: '状态转换错误',

  /**
   * 检测到状态与内容不匹配（例如在非 working 状态下输出内容）
   */
  CONTENT_STATE_MISMATCH: '状态与内容不匹配',
} as const;
