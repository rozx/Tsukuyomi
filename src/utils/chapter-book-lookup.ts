/**
 * 通过 chapterId 反查 bookId + 章节元数据的叶子工具。
 *
 * 仅依赖 IndexedDB，不 import stores 或 services，避免 chapter-embedding-service /
 * embedding-queue 形成 "服务 → stores/books → 服务" 的循环依赖。
 *
 * 数据源与 books store 一致（`books` store 存的是不含章节内容的小说元数据），
 * 因此查出来的标题等字段与 Pinia store 中的值等价。
 */

import { getDB } from 'src/utils/indexed-db';
import type { Chapter, Novel } from 'src/models/novel';

export interface ChapterLookupResult {
  bookId: string;
  chapterTitle: string;
  chapter: Chapter;
}

/**
 * 从 IndexedDB 直接扫描所有 books，找到包含该 chapterId 的 book。
 * 不缓存结果（调用场景频率低，且 idb 已有操作系统层面的缓存）。
 */
export async function lookupChapterBookFromDB(
  chapterId: string,
): Promise<ChapterLookupResult | null> {
  if (!chapterId) return null;
  try {
    const db = await getDB();
    const books = (await db.getAll('books')) as Novel[];
    for (const book of books) {
      if (!book.volumes) continue;
      for (const volume of book.volumes) {
        if (!volume.chapters) continue;
        for (const chapter of volume.chapters) {
          if (chapter.id === chapterId) {
            const chapterTitle =
              typeof chapter.title === 'string'
                ? chapter.title
                : chapter.title?.original ?? '';
            return { bookId: book.id, chapterTitle, chapter };
          }
        }
      }
    }
  } catch (error) {
    console.warn('[chapter-book-lookup] lookupChapterBookFromDB 失败:', error);
  }
  return null;
}

/**
 * 给定 bookId，从 IndexedDB 直接加载 book 元数据（不含章节内容）。
 */
export async function loadBookMetaFromDB(bookId: string): Promise<Novel | null> {
  if (!bookId) return null;
  try {
    const db = await getDB();
    const book = (await db.get('books', bookId)) as Novel | undefined;
    return book ?? null;
  } catch (error) {
    console.warn('[chapter-book-lookup] loadBookMetaFromDB 失败:', error);
    return null;
  }
}
