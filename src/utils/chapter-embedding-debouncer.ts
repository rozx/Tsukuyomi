/**
 * ChapterEmbeddingDebouncer — per-chapter 60s 防抖
 *
 * 段落文本或译文变动时调用 `markDirty(chapterId)`,每次调用刷新该章节的定时器。
 * 静默期达到后自动把章节入队 EmbeddingQueue 重新嵌入。
 *
 * 新建章节或批量导入时不应走防抖,直接调用 `EmbeddingQueue.enqueueChapter`。
 */

import { EmbeddingQueue } from 'src/services/embedding-queue';

const DEFAULT_DEBOUNCE_MS = 60_000;

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const debounceMs = DEFAULT_DEBOUNCE_MS;

/**
 * 标记章节为 "dirty",60 秒后自动入队。
 * 连续调用会刷新定时器。
 */
export function markChapterDirty(chapterId: string): void {
  if (!chapterId) return;
  const existing = timers.get(chapterId);
  if (existing) clearTimeout(existing);
  const handle = setTimeout(() => {
    timers.delete(chapterId);
    try {
      EmbeddingQueue.enqueueChapter(chapterId);
    } catch (error) {
      console.warn('[chapter-embedding-debouncer] enqueueChapter 失败:', error);
    }
  }, debounceMs);
  timers.set(chapterId, handle);
}

/**
 * 取消防抖(通常用于章节被删除)。
 */
export function cancelChapterDirty(chapterId: string): void {
  if (!chapterId) return;
  const existing = timers.get(chapterId);
  if (existing) {
    clearTimeout(existing);
    timers.delete(chapterId);
  }
}

