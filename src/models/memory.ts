/**
 * Memory 模型
 * 用于存储 AI 记忆的大块内容（如背景设定、关键情节、角色关系等）
 */
export interface Memory {
  id: string; // 短 ID（8 位十六进制字符串）
  bookId: string; // 关联的书籍 ID
  content: string; // 实际内容
  summary: string; // AI 生成的摘要
  createdAt: number; // 创建时间戳
  lastAccessedAt: number; // 最后访问时间戳（用于 LRU）
  embedding?: number[]; // 语义向量（256 维 Matryoshka 截断，L2 归一化）
  embeddingModel?: string; // 生成该向量的模型版本标识，例如 "embeddinggemma-300m@256"
}
