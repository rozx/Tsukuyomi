/**
 * Memory 模型
 * 用于存储 AI 记忆的大块内容（如背景设定、章节摘要等）
 */
export interface Memory {
  id: string; // 短 ID（8 位十六进制字符串）
  bookId: string; // 关联的书籍 ID
  content: string; // 实际内容
  summary: string; // AI 生成的摘要
  createdAt: number; // 创建时间戳
  lastAccessedAt: number; // 最后访问时间戳（用于 LRU）
}

