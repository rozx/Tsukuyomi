import type { Novel } from 'src/models/novel';

/**
 * 操作详情项接口
 */
export interface ActionDetail {
  label: string;
  value: string;
}

/**
 * 操作详情上下文接口（用于获取相关数据）
 */
export interface ActionDetailsContext {
  /** 获取书籍的函数 */
  getBookById: (bookId: string) => Novel | undefined;
  /** 获取当前书籍 ID 的函数 */
  getCurrentBookId: () => string | null;
}

/**
 * 文本预览：超过 maxLength 则截断追加 "..."
 */
export function preview(text: string, maxLength: number): string {
  return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}
