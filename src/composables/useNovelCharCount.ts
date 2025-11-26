import { ref } from 'vue';
import type { Novel } from 'src/models/novel';
import { getNovelCharCount, getNovelCharCountAsync } from 'src/utils';

/**
 * 书籍字符数加载和缓存 composable
 * 提供书籍级别的字符数加载、缓存和加载状态管理
 */
export function useNovelCharCount() {
  // 字符数缓存（使用对象而不是 Map，确保 Vue 响应式）
  const bookCharCounts = ref<Record<string, number>>({});
  // 正在加载字符数的书籍 ID 集合
  const loadingCharCounts = ref<Set<string>>(new Set());

  /**
   * 异步加载书籍字符数
   * @param book 书籍对象
   * @returns 字符数
   */
  const loadBookCharCount = async (book: Novel): Promise<number> => {
    // 如果已缓存，直接返回
    if (bookCharCounts.value[book.id] !== undefined) {
      return bookCharCounts.value[book.id] || 0;
    }

    // 检查是否有章节需要加载内容
    const hasChapters = book.volumes?.some((v) => v.chapters && v.chapters.length > 0) || false;
    if (!hasChapters) {
      // 没有章节，字符数为 0
      bookCharCounts.value[book.id] = 0;
      return 0;
    }

    // 先尝试同步计算（如果内容已加载）
    const syncCount = getNovelCharCount(book);
    // 如果同步计算有结果且大于0，或者所有章节的内容都已加载，使用同步结果
    const allContentLoaded = book.volumes?.every((v) =>
      v.chapters?.every((c) => c.content !== undefined),
    );
    if (allContentLoaded && syncCount >= 0) {
      bookCharCounts.value[book.id] = syncCount;
      return syncCount;
    }

    // 异步加载（从 IndexedDB）
    loadingCharCounts.value.add(book.id);
    try {
      const count = await getNovelCharCountAsync(book);
      bookCharCounts.value[book.id] = count;
      return count;
    } catch (error) {
      console.error(`Failed to load char count for book ${book.id}:`, error);
      // 如果异步加载失败，使用同步结果作为后备
      bookCharCounts.value[book.id] = syncCount;
      return syncCount;
    } finally {
      loadingCharCounts.value.delete(book.id);
    }
  };

  /**
   * 获取书籍字符数（带缓存）
   * @param book 书籍对象
   * @returns 字符数，如果未加载则返回 0
   */
  const getTotalWords = (book: Novel): number => {
    return bookCharCounts.value[book.id] ?? 0;
  };

  /**
   * 检查书籍是否正在加载字符数
   * @param book 书籍对象
   * @returns 是否正在加载
   */
  const isLoadingCharCount = (book: Novel): boolean => {
    return loadingCharCounts.value.has(book.id);
  };

  /**
   * 清除指定书籍的缓存
   * @param bookId 书籍 ID
   */
  const clearCache = (bookId?: string) => {
    if (bookId) {
      delete bookCharCounts.value[bookId];
      loadingCharCounts.value.delete(bookId);
    } else {
      // 清除所有缓存
      bookCharCounts.value = {};
      loadingCharCounts.value.clear();
    }
  };

  return {
    bookCharCounts,
    loadingCharCounts,
    loadBookCharCount,
    getTotalWords,
    isLoadingCharCount,
    clearCache,
  };
}

