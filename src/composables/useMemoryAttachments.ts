import { ref, computed, type Ref } from 'vue';
import type { MemoryAttachment, MemoryAttachmentType } from 'src/models/memory';
import { useBooksStore } from 'src/stores/books';

/**
 * 带名称的附件接口
 */
export interface AttachmentWithName extends MemoryAttachment {
  name: string;
  loading: boolean;
}

/**
 * useMemoryAttachments 配置选项
 */
export interface UseMemoryAttachmentsOptions {
  bookId: Ref<string>;
  maxCacheSize?: number;
}

/**
 * 缓存键类型
 */
type CacheKey = `${MemoryAttachmentType}:${string}`;

/**
 * 创建缓存键
 */
function createCacheKey(type: MemoryAttachmentType, id: string): CacheKey {
  return `${type}:${id}`;
}

/**
 * Memory 附件名称解析 Composable
 * 提供懒加载、批量解析和 LRU 缓存功能
 */
export function useMemoryAttachments(options: UseMemoryAttachmentsOptions) {
  const { bookId, maxCacheSize = 100 } = options;
  const booksStore = useBooksStore();

  // 名称缓存: Map<cacheKey, name>
  const nameCache = ref(new Map<CacheKey, string>());

  // 缓存大小
  const cacheSize = computed(() => nameCache.value.size);

  /**
   * LRU 缓存清理
   * 当缓存超过最大大小时，删除最旧的 20% 条目
   */
  function evictCacheIfNeeded(): void {
    if (nameCache.value.size > maxCacheSize) {
      const entriesToDelete = Math.floor(maxCacheSize * 0.2);
      const keys = Array.from(nameCache.value.keys()).slice(0, entriesToDelete);
      keys.forEach((key) => nameCache.value.delete(key));
    }
  }

  /**
   * 获取书籍名称
   */
  function getBookName(bookIdValue: string): string | undefined {
    const book = booksStore.getBookById(bookIdValue);
    return book?.title;
  }

  /**
   * 获取角色名称
   */
  function getCharacterName(bookIdValue: string, charId: string): string | undefined {
    const book = booksStore.getBookById(bookIdValue);
    if (!book?.characterSettings) return undefined;
    const char = book.characterSettings.find((c) => c.id === charId);
    return char?.name;
  }

  /**
   * 获取术语名称
   */
  function getTermName(bookIdValue: string, termId: string): string | undefined {
    const book = booksStore.getBookById(bookIdValue);
    if (!book?.terminologies) return undefined;
    const term = book.terminologies.find((t) => t.id === termId);
    return term?.name;
  }

  /**
   * 获取章节名称
   */
  function getChapterName(bookIdValue: string, chapterId: string): string | undefined {
    const book = booksStore.getBookById(bookIdValue);
    if (!book?.volumes) return undefined;

    for (const volume of book.volumes) {
      if (!volume.chapters) continue;
      const chapter = volume.chapters.find((c) => c.id === chapterId);
      if (chapter) {
        // 返回章节标题（优先使用翻译，否则使用原文）
        if (typeof chapter.title === 'string') {
          return chapter.title;
        }
        return chapter.title.translation?.translation || chapter.title.original;
      }
    }
    return undefined;
  }

  /**
   * 获取单个名称（同步，从 store 或缓存）
   */
  function getName(type: MemoryAttachmentType, id: string): string | undefined {
    const currentBookId = bookId.value;

    // 首先检查缓存
    const cacheKey = createCacheKey(type, id);
    const cachedName = nameCache.value.get(cacheKey);
    if (cachedName !== undefined) {
      // 刷新 LRU 位置（删除后重新添加，使其成为最新的）
      nameCache.value.delete(cacheKey);
      nameCache.value.set(cacheKey, cachedName);
      return cachedName;
    }

    // 如果没有缓存，直接从 store 获取
    let name: string | undefined;
    switch (type) {
      case 'book':
        name = getBookName(id);
        break;
      case 'character':
        name = getCharacterName(currentBookId, id);
        break;
      case 'term':
        name = getTermName(currentBookId, id);
        break;
      case 'chapter':
        name = getChapterName(currentBookId, id);
        break;
    }

    // 缓存结果
    if (name !== undefined) {
      nameCache.value.set(cacheKey, name);
      evictCacheIfNeeded();
    }

    return name;
  }

  /**
   * 解析附件名称（同步，带缓存）
   * 返回带名称的附件列表
   */
  function resolveNames(attachments: MemoryAttachment[]): AttachmentWithName[] {
    if (attachments.length === 0) return [];

    const currentBookId = bookId.value;
    const result: AttachmentWithName[] = [];

    for (const attachment of attachments) {
      const cacheKey = createCacheKey(attachment.type, attachment.id);
      let name = nameCache.value.get(cacheKey);

      // 如果缓存中没有，尝试从 store 获取
      if (name === undefined) {
        switch (attachment.type) {
          case 'book':
            name = getBookName(attachment.id);
            break;
          case 'character':
            name = getCharacterName(currentBookId, attachment.id);
            break;
          case 'term':
            name = getTermName(currentBookId, attachment.id);
            break;
          case 'chapter':
            name = getChapterName(currentBookId, attachment.id);
            break;
        }

        // 缓存结果
        if (name !== undefined) {
          nameCache.value.set(cacheKey, name);
        }
      } else {
        // 刷新 LRU 位置
        nameCache.value.delete(cacheKey);
        nameCache.value.set(cacheKey, name);
      }

      result.push({
        ...attachment,
        name: name || '',
        loading: name === undefined,
      });
    }

    evictCacheIfNeeded();
    return result;
  }

  /**
   * 清除缓存
   */
  function clearCache(): void {
    nameCache.value.clear();
  }

  /**
   * 更新缓存中的名称（当实体被重命名时调用）
   */
  function updateCacheEntry(type: MemoryAttachmentType, id: string, name: string): void {
    const cacheKey = createCacheKey(type, id);
    nameCache.value.set(cacheKey, name);
  }

  /**
   * 从缓存中删除条目（当实体被删除时调用）
   */
  function removeCacheEntry(type: MemoryAttachmentType, id: string): void {
    const cacheKey = createCacheKey(type, id);
    nameCache.value.delete(cacheKey);
  }

  return {
    resolveNames,
    getName,
    clearCache,
    updateCacheEntry,
    removeCacheEntry,
    cacheSize,
  };
}
