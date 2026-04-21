/**
 * 章节内容加载器 — 叶子模块，直接读 IndexedDB 的 `chapter-contents` store，
 * 自带 LRU 内存缓存。
 *
 * 存在的原因：chapter-content-service 过去既做"写 + 副作用编排"又做"读 + 缓存"，
 * 被 chapter-embedding-service / full-text-index-service / novel-utils 等多方
 * import 形成循环依赖。把只读 + 缓存路径抽到本叶子模块后，读侧消费者不再
 * import chapter-content-service，环断开。
 *
 * 缓存由本模块独占管理；chapter-content-service 的写入路径通过本模块导出
 * 的 `setCacheEntry` / `deleteCacheEntry` / `clearCache` 保持缓存一致。
 */

import { getDB } from 'src/utils/indexed-db';
import type { Paragraph } from 'src/models/novel';

/**
 * 缓存条目：同时保存解析后的对象与不可变序列化快照（用于变更检测）
 */
export interface ChapterContentCacheEntry {
  parsed: Paragraph[];
  serialized: string;
}

type CacheValue = ChapterContentCacheEntry | null;

const CACHE_MAX_SIZE = 100;
const contentCache = new Map<string, CacheValue>();

/**
 * LRU 淘汰：缓存超过 CACHE_MAX_SIZE 时删除最旧的 20%
 */
function evictCacheIfNeeded(): void {
  if (contentCache.size > CACHE_MAX_SIZE) {
    const entriesToDelete = Math.floor(CACHE_MAX_SIZE * 0.2);
    const keysToDelete = Array.from(contentCache.keys()).slice(0, entriesToDelete);
    for (const key of keysToDelete) {
      contentCache.delete(key);
    }
  }
}

/**
 * 更新访问顺序（LRU 行为）：把 chapterId 对应条目移到 Map 末尾表示最近使用
 */
function touchCacheEntry(chapterId: string): void {
  if (contentCache.has(chapterId)) {
    const cached = contentCache.get(chapterId)!;
    contentCache.delete(chapterId);
    contentCache.set(chapterId, cached);
  }
}

/**
 * 加载章节内容（带缓存）。
 * 找不到返回 undefined；加载失败也返回 undefined 并缓存 null 避免重复尝试。
 */
export async function loadChapterContent(
  chapterId: string,
): Promise<Paragraph[] | undefined> {
  // 检查缓存
  if (contentCache.has(chapterId)) {
    const cached = contentCache.get(chapterId);
    touchCacheEntry(chapterId);
    if (cached === undefined) {
      contentCache.delete(chapterId);
    } else {
      return cached === null ? undefined : cached.parsed;
    }
  }

  try {
    const db = await getDB();
    const chapterContent = await db.get('chapter-contents', chapterId);
    if (!chapterContent?.content) {
      // 缓存 null 表示不存在，避免重复查询
      contentCache.set(chapterId, null);
      evictCacheIfNeeded();
      return undefined;
    }
    const serialized = chapterContent.content;
    const parsed = JSON.parse(serialized) as Paragraph[];
    contentCache.set(chapterId, { parsed, serialized });
    evictCacheIfNeeded();
    return parsed;
  } catch (error) {
    console.error(`Failed to load chapter content for ${chapterId}:`, error);
    contentCache.set(chapterId, null);
    evictCacheIfNeeded();
    return undefined;
  }
}

/**
 * 批量加载章节内容（单事务内并行读取，分批避免一次性加载过多）。
 */
export async function loadChapterContentsBatch(
  chapterIds: string[],
): Promise<Map<string, Paragraph[] | undefined>> {
  const result = new Map<string, Paragraph[] | undefined>();
  const uncachedIds: string[] = [];

  for (const chapterId of chapterIds) {
    if (contentCache.has(chapterId)) {
      const cached = contentCache.get(chapterId);
      touchCacheEntry(chapterId);
      if (cached === undefined) {
        contentCache.delete(chapterId);
        uncachedIds.push(chapterId);
      } else {
        result.set(chapterId, cached === null ? undefined : cached.parsed);
      }
    } else {
      uncachedIds.push(chapterId);
    }
  }

  if (uncachedIds.length === 0) {
    return result;
  }

  try {
    const db = await getDB();
    const tx = db.transaction('chapter-contents', 'readonly');
    const store = tx.objectStore('chapter-contents');

    const batchSize = 50;
    const batches: string[][] = [];
    for (let i = 0; i < uncachedIds.length; i += batchSize) {
      batches.push(uncachedIds.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      const promises = batch.map(async (chapterId) => {
        try {
          const chapterContent = await store.get(chapterId);
          if (!chapterContent?.content) {
            contentCache.set(chapterId, null);
            return { chapterId, content: undefined as Paragraph[] | undefined };
          }
          const serialized = chapterContent.content;
          const parsed = JSON.parse(serialized) as Paragraph[];
          contentCache.set(chapterId, { parsed, serialized });
          return { chapterId, content: parsed };
        } catch (error) {
          console.error(`Failed to load chapter content for ${chapterId}:`, error);
          contentCache.set(chapterId, null);
          return { chapterId, content: undefined as Paragraph[] | undefined };
        }
      });

      const batchResults = await Promise.all(promises);
      for (const { chapterId, content } of batchResults) {
        result.set(chapterId, content);
      }
    }

    await tx.done;
    evictCacheIfNeeded();

    return result;
  } catch (error) {
    console.error('Failed to batch load chapter contents:', error);
    // 回退到单个加载
    for (const chapterId of uncachedIds) {
      const content = await loadChapterContent(chapterId);
      result.set(chapterId, content);
    }
    return result;
  }
}

/**
 * 读缓存条目（用于 hasContentChanged 的 serialized 对比）
 */
export function peekCacheEntry(chapterId: string): CacheValue | undefined {
  return contentCache.get(chapterId);
}

/**
 * 写入缓存（由 chapter-content-service 的写路径调用以保持一致）
 */
export function setCacheEntry(chapterId: string, entry: ChapterContentCacheEntry): void {
  contentCache.set(chapterId, entry);
  evictCacheIfNeeded();
}

/**
 * 写入"此章节不存在"标记（避免重复查询）
 */
export function setCacheMiss(chapterId: string): void {
  contentCache.set(chapterId, null);
  evictCacheIfNeeded();
}

/**
 * 删除指定章节缓存
 */
export function deleteCacheEntry(chapterId: string): void {
  contentCache.delete(chapterId);
}

/**
 * 清空所有缓存
 */
export function clearCache(): void {
  contentCache.clear();
}

/**
 * 访问顺序更新（LRU 行为）；供 chapter-content-service 的 hasContentChanged
 * 在命中缓存时保持 LRU 语义。
 */
export function touch(chapterId: string): void {
  touchCacheEntry(chapterId);
}
