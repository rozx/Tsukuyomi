/**
 * Memory 缓存与事件通道 —— 中性叶子模块。
 *
 * 存在理由：让 `MemoryService` 和 `EmbeddingQueue` 两个子系统能共享同一份
 * LRU 缓存与 'memory-changed' / 'embedding-updated' 事件通道，而不需要互相
 * import。 MemoryService 与 EmbeddingQueue 都只 import 本模块，避免循环依赖。
 *
 * 本模块不做 IO —— 不读写 IndexedDB，也不编解码 Memory 字段，只负责进程内的
 * 缓存状态与事件广播。
 */

import type { Memory } from 'src/models/memory';

export const MEMORY_CACHE_MAX_SIZE = 200;
export const BOOK_MEMORY_CACHE_TTL_MS = 60_000;

/** 单条 Memory 的 LRU 缓存，键为 `${bookId}:${memoryId}`。Map 的插入顺序天然支持 LRU。 */
export const memoryCache = new Map<string, Memory>();

/** 书籍级全量缓存（记忆注入打分时一次性取整本 Memory）。 */
export const bookMemoryCache = new Map<string, { data: Memory[]; expiresAt: number }>();

export function buildMemoryCacheKey(bookId: string, memoryId: string): string {
  return `${bookId}:${memoryId}`;
}

const memoryEvents = new EventTarget();

export interface MemoryChangedDetail {
  bookId: string;
  memoryId?: string;
  action: string;
}

export function dispatchMemoryChanged(detail: MemoryChangedDetail): void {
  // Node/Bun 测试环境在某些 jsdom 配置下可能缺少 CustomEvent，安全降级到普通 Event
  const hasCustomEvent = typeof (globalThis as unknown as { CustomEvent?: unknown }).CustomEvent !== 'undefined';
  const event = hasCustomEvent
    ? new CustomEvent('memory-changed', { detail })
    : (() => {
        const e = new Event('memory-changed') as Event & { detail?: MemoryChangedDetail };
        e.detail = detail;
        return e;
      })();
  memoryEvents.dispatchEvent(event);
}

export function addMemoryChangeListener(
  listener: (event: CustomEvent<MemoryChangedDetail>) => void,
): () => void {
  const handler = (event: Event) => {
    listener(event as CustomEvent<MemoryChangedDetail>);
  };
  memoryEvents.addEventListener('memory-changed', handler);
  return () => memoryEvents.removeEventListener('memory-changed', handler);
}

/**
 * 把 embedding 写入后的结果同步到两级缓存（不触发事件）。
 * 调用方负责确保 IndexedDB 写入已成功。
 */
export function syncMemoryEmbeddingCaches(
  bookId: string,
  memoryId: string,
  embedding: number[],
  embeddingModel: string,
): void {
  const cacheKey = buildMemoryCacheKey(bookId, memoryId);
  const cachedSingle = memoryCache.get(cacheKey);
  if (cachedSingle) {
    memoryCache.set(cacheKey, {
      ...cachedSingle,
      embedding,
      embeddingModel,
    });
  }

  const cachedBook = bookMemoryCache.get(bookId);
  if (cachedBook) {
    const next = cachedBook.data.map((m) =>
      m.id === memoryId ? { ...m, embedding, embeddingModel } : m,
    );
    bookMemoryCache.set(bookId, {
      data: next,
      expiresAt: cachedBook.expiresAt,
    });
  }
}

/** LRU 淘汰到指定上限（默认 CACHE_MAX_SIZE）。 */
export function trimMemoryCacheIfOverflow(maxSize: number = MEMORY_CACHE_MAX_SIZE): void {
  if (memoryCache.size <= maxSize) return;
  const entriesToDelete = memoryCache.size - maxSize;
  const keysToDelete = Array.from(memoryCache.keys()).slice(0, entriesToDelete);
  for (const key of keysToDelete) memoryCache.delete(key);
}
