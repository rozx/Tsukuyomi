import { getDB } from 'src/utils/indexed-db';
import { generateShortId } from 'src/utils/id-generator';
import type { Memory } from 'src/models/memory';

const MAX_MEMORIES_PER_BOOK = 500;

/**
 * Memory 存储结构（用于 IndexedDB）
 */
interface MemoryStorage {
  id: string;
  bookId: string;
  content: string;
  summary: string;
  createdAt: number;
  lastAccessedAt: number;
}

/**
 * Memory Service
 * 提供 Memory 的 CRUD 操作，支持 LRU 缓存和每本书最多 500 条记录的限制
 */
export class MemoryService {
  /**
   * Memory 变更事件（用于让 UI 在 IndexedDB 变更后自动刷新）
   * 注意：这是轻量事件总线，不做持久化。
   */
  private static readonly memoryEvents = new EventTarget();

  static addMemoryChangeListener(
    listener: (event: CustomEvent<{ bookId: string; memoryId?: string; action: string }>) => void,
  ): () => void {
    const handler = (event: Event) => {
      listener(event as CustomEvent<{ bookId: string; memoryId?: string; action: string }>);
    };

    this.memoryEvents.addEventListener('memory-changed', handler);
    return () => this.memoryEvents.removeEventListener('memory-changed', handler);
  }

  private static dispatchMemoryChanged(detail: { bookId: string; memoryId?: string; action: string }) {
    // Bun 测试环境可能没有 CustomEvent，做一个安全降级
    const hasCustomEvent = typeof (globalThis as any).CustomEvent !== 'undefined';
    const event = hasCustomEvent
      ? new CustomEvent('memory-changed', { detail })
      : (() => {
          const e = new Event('memory-changed') as Event & { detail?: typeof detail };
          (e as any).detail = detail;
          return e;
        })();

    this.memoryEvents.dispatchEvent(event);
  }

  // LRU 内存缓存，避免重复访问数据库
  // 使用 Map 的插入顺序实现 LRU：最近访问的条目会被移动到末尾
  private static memoryCache = new Map<string, Memory>();
  private static readonly CACHE_MAX_SIZE = 200; // 最多缓存 200 个记忆

  // 搜索结果缓存：缓存关键词组合到记忆 ID 列表的映射
  // 缓存键格式：search:${bookId}:${sortedKeywords.join(',')}
  private static searchResultCache = new Map<
    string,
    {
      memoryIds: string[];
      timestamp: number;
    }
  >();
  private static readonly SEARCH_CACHE_TTL = 120000; // 2 分钟
  private static readonly SEARCH_CACHE_MAX_SIZE = 100; // 最多缓存 100 个搜索结果

  /**
   * 清理缓存（当缓存过大时）
   * 使用 LRU 策略：删除最久未使用的 20% 的缓存项（Map 开头的条目）
   */
  private static evictCacheIfNeeded(): void {
    if (this.memoryCache.size > this.CACHE_MAX_SIZE) {
      // 删除最旧的 20% 的缓存项
      const entriesToDelete = Math.floor(this.CACHE_MAX_SIZE * 0.2);
      const keysToDelete = Array.from(this.memoryCache.keys()).slice(0, entriesToDelete);
      for (const key of keysToDelete) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * 更新缓存条目的访问顺序（LRU 行为）
   * 将指定的缓存条目移动到 Map 末尾，表示最近使用
   * @param cacheKey 缓存键（格式：bookId:memoryId）
   */
  private static touchCache(cacheKey: string): void {
    const memory = this.memoryCache.get(cacheKey);
    if (memory) {
      // 删除并重新添加，使其移动到 Map 末尾（最近使用）
      this.memoryCache.delete(cacheKey);
      this.memoryCache.set(cacheKey, memory);
    }
  }

  /**
   * 获取缓存键（bookId:memoryId）
   */
  private static getCacheKey(bookId: string, memoryId: string): string {
    return `${bookId}:${memoryId}`;
  }

  /**
   * 获取搜索结果缓存键
   */
  private static getSearchCacheKey(bookId: string, keywords: string[]): string {
    const sortedKeywords = [...keywords].sort().join(',');
    return `search:${bookId}:${sortedKeywords}`;
  }

  /**
   * 获取缓存的搜索结果
   */
  private static getCachedSearchResults(
    bookId: string,
    keywords: string[],
  ): string[] | null {
    const cacheKey = this.getSearchCacheKey(bookId, keywords);
    const cached = this.searchResultCache.get(cacheKey);

    if (!cached) return null;

    // 检查是否过期
    if (Date.now() - cached.timestamp > this.SEARCH_CACHE_TTL) {
      this.searchResultCache.delete(cacheKey);
      return null;
    }

    return cached.memoryIds;
  }

  /**
   * 设置搜索结果缓存
   */
  private static setCachedSearchResults(
    bookId: string,
    keywords: string[],
    memoryIds: string[],
  ): void {
    const cacheKey = this.getSearchCacheKey(bookId, keywords);

    // 如果缓存太大，删除最旧的（LRU）
    if (this.searchResultCache.size >= this.SEARCH_CACHE_MAX_SIZE) {
      const oldestKey = this.searchResultCache.keys().next().value;
      if (oldestKey) {
        this.searchResultCache.delete(oldestKey);
      }
    }

    this.searchResultCache.set(cacheKey, {
      memoryIds,
      timestamp: Date.now(),
    });
  }

  /**
   * 清除与指定书籍相关的搜索结果缓存
   * 当记忆被创建/更新/删除时调用
   */
  private static clearSearchCacheForBook(bookId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.searchResultCache.keys()) {
      if (key.startsWith(`search:${bookId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.searchResultCache.delete(key);
    }
  }

  /**
   * 批量更新记忆的访问时间（异步，不阻塞）
   */
  private static async updateAccessTimesBatch(
    memoryIds: string[],
    bookId: string,
  ): Promise<void> {
    if (memoryIds.length === 0) return;

    try {
      const db = await getDB();
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const now = Date.now();

      // 批量更新：使用 Promise.all 并行更新
      await Promise.all(
        memoryIds.map(async (memoryId) => {
          try {
            const memory = await store.get(memoryId);
            if (memory && memory.bookId === bookId) {
              const updatedMemory: MemoryStorage = {
                ...memory,
                lastAccessedAt: now,
              };
              await store.put(updatedMemory);
            }
          } catch (error) {
            // 单个更新失败不影响其他更新
            console.warn(`Failed to update access time for memory ${memoryId}:`, error);
          }
        }),
      );

      await tx.done;
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Failed to batch update access times:', error);
    }
  }
  /**
   * 获取指定书籍的所有 Memory ID（用于 ID 生成器）
   */
  private static async getMemoryIdsForBook(bookId: string): Promise<string[]> {
    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);
      return allMemories.map((m) => m.id);
    } catch (error) {
      console.error('Failed to get memory IDs for book:', error);
      return [];
    }
  }

  /**
   * 获取指定书籍的 Memory 数量
   */
  private static async getMemoryCountForBook(bookId: string): Promise<number> {
    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const count = await index.count(bookId);
      return count;
    } catch (error) {
      console.error('Failed to get memory count for book:', error);
      return 0;
    }
  }

  /**
   * 创建新的 Memory
   * 高性能优化版本：
   * 1. 使用延迟 ID 生成策略（只在碰撞时检查，避免获取所有 ID）
   * 2. 使用游标查找最旧的记录，避免加载所有数据到内存
   * 3. 最小化数据库查询次数
   */
  static async createMemory(bookId: string, content: string, summary: string): Promise<Memory> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!content) {
      throw new Error('内容不能为空');
    }
    if (!summary) {
      throw new Error('摘要不能为空');
    }

    try {
      const db = await getDB();
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const bookIdIndex = store.index('by-bookId');

      // 1. 快速检查数量（使用 count，非常快）
      const count = await bookIdIndex.count(bookId);

      // 2. 如果达到限制，找到并删除最旧的记录
      if (count >= MAX_MEMORIES_PER_BOOK) {
        // 使用 getAll() 获取所有该书籍的记忆（利用索引，非常快）
        // 然后在内存中查找最旧的记录（内存操作比游标迭代快得多）
        const allMemories = await bookIdIndex.getAll(bookId);
        
        // 在内存中查找 lastAccessedAt 最小的记录（O(n) 但非常快）
        let oldestId: string | null = null;
        let oldestTime = Number.MAX_SAFE_INTEGER;
        
        for (const memory of allMemories) {
          if (memory.lastAccessedAt < oldestTime) {
            oldestTime = memory.lastAccessedAt;
            oldestId = memory.id;
          }
        }

        // 删除最旧的记录
        if (oldestId) {
          await store.delete(oldestId);
          // 清除缓存
          const cacheKey = this.getCacheKey(bookId, oldestId);
          this.memoryCache.delete(cacheKey);
        }
      }

      // 3. 生成唯一 ID（使用延迟检查策略，避免获取所有 ID）
      // 由于 8 位十六进制字符串的碰撞概率极低（16^8 = 4.3 亿），
      // 我们可以先生成 ID，然后检查是否存在，只在碰撞时重试
      let id: string | null = null;
      let attempts = 0;
      const maxAttempts = 10; // 理论上几乎不会超过 1 次

      while (attempts < maxAttempts) {
        const candidateId = generateShortId();
        // 快速检查 ID 是否已存在（只查询单个键，非常快）
        const existing = await store.get(candidateId);
        if (!existing) {
          // ID 不存在，可以使用
          id = candidateId;
          break;
        }
        attempts++;
      }

      if (!id) {
        throw new Error('无法生成唯一 ID，请重试');
      }

      // 4. 创建新 Memory
      const now = Date.now();
      const memory: MemoryStorage = {
        id,
        bookId,
        content,
        summary,
        createdAt: now,
        lastAccessedAt: now,
      };

      await store.put(memory);
      await tx.done;

      const result: Memory = {
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
      };

      // 更新缓存
      const cacheKey = this.getCacheKey(bookId, memory.id);
      this.memoryCache.set(cacheKey, result);
      this.evictCacheIfNeeded();

      // 清除该书籍的搜索结果缓存（因为新增了记忆）
      this.clearSearchCacheForBook(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId: result.id, action: 'created' });

      return result;
    } catch (error) {
      console.error('Failed to create memory:', error);
      throw new Error('创建 Memory 失败');
    }
  }

  /**
   * 以指定 ID 创建 Memory（用于同步/导入）
   * 注意：普通创建请使用 createMemory()，它会自动生成全局唯一的短 ID。
   */
  static async createMemoryWithId(
    bookId: string,
    memoryId: string,
    content: string,
    summary: string,
    timestamps?: { createdAt?: number; lastAccessedAt?: number },
  ): Promise<Memory> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!memoryId) {
      throw new Error('Memory ID 不能为空');
    }
    if (!content) {
      throw new Error('内容不能为空');
    }
    if (!summary) {
      throw new Error('摘要不能为空');
    }

    try {
      const db = await getDB();
      const tx = db.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      const bookIdIndex = store.index('by-bookId');

      const existing = (await store.get(memoryId)) as MemoryStorage | undefined;
      if (existing) {
        // 如果已存在，视为“更新”（避免同步重复创建）
        if (existing.bookId !== bookId) {
          throw new Error(`Memory ID 冲突：${memoryId}`);
        }

        const updatedMemory: MemoryStorage = {
          ...existing,
          content,
          summary,
          createdAt:
            typeof timestamps?.createdAt === 'number'
              ? Math.min(existing.createdAt, timestamps.createdAt)
              : existing.createdAt,
          lastAccessedAt:
            typeof timestamps?.lastAccessedAt === 'number'
              ? Math.max(existing.lastAccessedAt, timestamps.lastAccessedAt)
              : existing.lastAccessedAt,
        };

        await store.put(updatedMemory);
        await tx.done;

        const result: Memory = {
          id: updatedMemory.id,
          bookId: updatedMemory.bookId,
          content: updatedMemory.content,
          summary: updatedMemory.summary,
          createdAt: updatedMemory.createdAt,
          lastAccessedAt: updatedMemory.lastAccessedAt,
        };

        const cacheKey = this.getCacheKey(bookId, memoryId);
        this.memoryCache.set(cacheKey, result);
        this.evictCacheIfNeeded();
        this.clearSearchCacheForBook(bookId);

        this.dispatchMemoryChanged({ bookId, memoryId, action: 'imported' });

        return result;
      }

      // 新建：如果达到限制，删除最旧的记录
      const count = await bookIdIndex.count(bookId);
      if (count >= MAX_MEMORIES_PER_BOOK) {
        const allMemories = (await bookIdIndex.getAll(bookId)) as MemoryStorage[];

        let oldestId: string | null = null;
        let oldestTime = Number.MAX_SAFE_INTEGER;

        for (const memory of allMemories) {
          if (memory.lastAccessedAt < oldestTime) {
            oldestTime = memory.lastAccessedAt;
            oldestId = memory.id;
          }
        }

        if (oldestId) {
          await store.delete(oldestId);
          const cacheKey = this.getCacheKey(bookId, oldestId);
          this.memoryCache.delete(cacheKey);
        }
      }

      const now = Date.now();
      const createdAt = typeof timestamps?.createdAt === 'number' ? timestamps.createdAt : now;
      const lastAccessedAt =
        typeof timestamps?.lastAccessedAt === 'number'
          ? timestamps.lastAccessedAt
          : createdAt;

      const memory: MemoryStorage = {
        id: memoryId,
        bookId,
        content,
        summary,
        createdAt,
        lastAccessedAt: Math.max(lastAccessedAt, createdAt),
      };

      await store.put(memory);
      await tx.done;

      const result: Memory = {
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
      };

      const cacheKey = this.getCacheKey(bookId, memory.id);
      this.memoryCache.set(cacheKey, result);
      this.evictCacheIfNeeded();
      this.clearSearchCacheForBook(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId: result.id, action: 'imported' });

      return result;
    } catch (error) {
      console.error('Failed to create memory with id:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('创建 Memory 失败');
    }
  }

  /**
   * 根据 ID 获取 Memory
   */
  static async getMemory(bookId: string, memoryId: string): Promise<Memory | null> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!memoryId) {
      throw new Error('Memory ID 不能为空');
    }

    const cacheKey = this.getCacheKey(bookId, memoryId);

    // 先检查缓存
    const cachedMemory = this.memoryCache.get(cacheKey);
    if (cachedMemory) {
      // 更新缓存访问顺序（LRU）
      this.touchCache(cacheKey);
      // 异步更新数据库中的访问时间（不阻塞返回）
      this.updateAccessTimeInDB(bookId, memoryId).catch((error) => {
        console.warn('Failed to update access time in DB:', error);
      });
      return cachedMemory;
    }

    try {
      const db = await getDB();
      const memory = await db.get('memories', memoryId);

      if (!memory) {
        return null;
      }

      // 验证是否属于指定的书籍
      if (memory.bookId !== bookId) {
        return null;
      }

      // 更新最后访问时间（LRU）
      const now = Date.now();
      const updatedMemory: MemoryStorage = {
        ...memory,
        lastAccessedAt: now,
      };
      await db.put('memories', updatedMemory);

      const result: Memory = {
        id: updatedMemory.id,
        bookId: updatedMemory.bookId,
        content: updatedMemory.content,
        summary: updatedMemory.summary,
        createdAt: updatedMemory.createdAt,
        lastAccessedAt: updatedMemory.lastAccessedAt,
      };

      // 更新缓存
      this.memoryCache.set(cacheKey, result);
      this.evictCacheIfNeeded();

      return result;
    } catch (error) {
      console.error('Failed to get memory:', error);
      throw new Error('获取 Memory 失败');
    }
  }

  /**
   * 异步更新数据库中的访问时间（用于缓存命中时）
   */
  private static async updateAccessTimeInDB(bookId: string, memoryId: string): Promise<void> {
    try {
      const db = await getDB();
      const memory = await db.get('memories', memoryId);

      if (!memory || memory.bookId !== bookId) {
        return;
      }

      const updatedMemory: MemoryStorage = {
        ...memory,
        lastAccessedAt: Date.now(),
      };
      await db.put('memories', updatedMemory);
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Failed to update access time in DB:', error);
    }
  }

  /**
   * 根据关键词搜索 Memory 的摘要（支持单个关键词，向后兼容）
   */
  static async searchMemoriesByKeyword(bookId: string, keyword: string): Promise<Memory[]> {
    if (!keyword || !keyword.trim()) {
      throw new Error('关键词不能为空');
    }
    return this.searchMemoriesByKeywords(bookId, [keyword]);
  }

  /**
   * 根据多个关键词搜索 Memory 的摘要
   * 返回包含所有关键词的 Memory（AND 逻辑）
   * 
   * 优化：
   * 1. 搜索结果缓存：缓存关键词组合到记忆 ID 列表的映射（1-2 分钟）
   * 2. 批量更新优化：使用 Promise.all 批量更新 lastAccessedAt
   * 3. 延迟更新：异步更新 lastAccessedAt，不阻塞搜索结果返回
   * 4. 早期退出：如果找到足够的结果，提前停止搜索（可选，当前未实现）
   */
  static async searchMemoriesByKeywords(bookId: string, keywords: string[]): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('关键词数组不能为空');
    }

    // 过滤掉空字符串并规范化
    const validKeywords = keywords
      .filter((k) => k && typeof k === 'string' && k.trim().length > 0)
      .map((k) => k.trim().toLowerCase());
    if (validKeywords.length === 0) {
      throw new Error('关键词数组不能为空');
    }

    try {
      // 优化 1: 检查搜索结果缓存
      const cachedMemoryIds = this.getCachedSearchResults(bookId, validKeywords);
      if (cachedMemoryIds) {
        // 从缓存获取记忆（优先从内存缓存，否则从数据库）
        const cachedMemories: Memory[] = [];
        const missingIds: string[] = [];

        for (const memoryId of cachedMemoryIds) {
          const cacheKey = this.getCacheKey(bookId, memoryId);
          const cachedMemory = this.memoryCache.get(cacheKey);
          if (cachedMemory) {
            cachedMemories.push(cachedMemory);
            // 更新缓存访问顺序（LRU）
            this.touchCache(cacheKey);
          } else {
            missingIds.push(memoryId);
          }
        }

        // 如果有缺失的记忆，从数据库加载
        if (missingIds.length > 0) {
          const db = await getDB();
          for (const memoryId of missingIds) {
            const memory = await db.get('memories', memoryId);
            if (memory && memory.bookId === bookId) {
              const result: Memory = {
                id: memory.id,
                bookId: memory.bookId,
                content: memory.content,
                summary: memory.summary,
                createdAt: memory.createdAt,
                lastAccessedAt: memory.lastAccessedAt,
              };
              cachedMemories.push(result);
              // 更新缓存
              const cacheKey = this.getCacheKey(bookId, memory.id);
              this.memoryCache.set(cacheKey, result);
            }
          }
          this.evictCacheIfNeeded();
        }

        // 按最后访问时间排序
        cachedMemories.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

        // 优化 3: 延迟更新访问时间（不阻塞返回）
        if (cachedMemoryIds.length > 0) {
          this.updateAccessTimesBatch(cachedMemoryIds, bookId).catch((error) => {
            console.warn('Failed to update access times asynchronously:', error);
          });
        }

        return cachedMemories;
      }

      // 缓存未命中，执行数据库搜索
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      // 过滤匹配的记忆
      const matchingMemories = allMemories.filter((memory) => {
        const summaryLower = memory.summary.toLowerCase();
        // 所有关键词都必须出现在摘要中（AND 逻辑）
        return validKeywords.every((keyword) => summaryLower.includes(keyword));
      });

      // 按最后访问时间倒序排序（最近访问的在前）
      matchingMemories.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      // 提取记忆 ID 列表
      const matchingMemoryIds = matchingMemories.map((m) => m.id);

      // 优化 1: 缓存搜索结果
      this.setCachedSearchResults(bookId, validKeywords, matchingMemoryIds);

      // 构建结果
      const results = matchingMemories.map((memory) => {
        const result: Memory = {
          id: memory.id,
          bookId: memory.bookId,
          content: memory.content,
          summary: memory.summary,
          createdAt: memory.createdAt,
          lastAccessedAt: memory.lastAccessedAt, // 暂时使用旧时间，异步更新后会更新
        };

        // 更新缓存
        const cacheKey = this.getCacheKey(bookId, memory.id);
        this.memoryCache.set(cacheKey, result);
        return result;
      });

      this.evictCacheIfNeeded();

      // 优化 3: 延迟更新访问时间（不阻塞返回）
      if (matchingMemoryIds.length > 0) {
        this.updateAccessTimesBatch(matchingMemoryIds, bookId).catch((error) => {
          console.warn('Failed to update access times asynchronously:', error);
        });
      }

      return results;
    } catch (error) {
      console.error('Failed to search memories by keywords:', error);
      throw new Error('搜索 Memory 失败');
    }
  }

  /**
   * 更新 Memory
   */
  static async updateMemory(
    bookId: string,
    memoryId: string,
    content: string,
    summary: string,
  ): Promise<Memory> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!memoryId) {
      throw new Error('Memory ID 不能为空');
    }
    if (!content) {
      throw new Error('内容不能为空');
    }
    if (!summary) {
      throw new Error('摘要不能为空');
    }

    try {
      const db = await getDB();
      const memory = await db.get('memories', memoryId);

      if (!memory) {
        throw new Error(`Memory 不存在: ${memoryId}`);
      }

      // 验证是否属于指定的书籍
      if (memory.bookId !== bookId) {
        throw new Error(`Memory 不属于指定的书籍: ${bookId}`);
      }

      const now = Date.now();
      const updatedMemory: MemoryStorage = {
        ...memory,
        content,
        summary,
        lastAccessedAt: now,
      };

      await db.put('memories', updatedMemory);

      const result: Memory = {
        id: updatedMemory.id,
        bookId: updatedMemory.bookId,
        content: updatedMemory.content,
        summary: updatedMemory.summary,
        createdAt: updatedMemory.createdAt,
        lastAccessedAt: updatedMemory.lastAccessedAt,
      };

      // 更新缓存
      const cacheKey = this.getCacheKey(bookId, memoryId);
      this.memoryCache.set(cacheKey, result);
      this.evictCacheIfNeeded();

      // 清除该书籍的搜索结果缓存（因为记忆内容/摘要已更新）
      this.clearSearchCacheForBook(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId, action: 'updated' });

      return result;
    } catch (error) {
      console.error('Failed to update memory:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('更新 Memory 失败');
    }
  }

  /**
   * 删除 Memory
   */
  static async deleteMemory(bookId: string, memoryId: string): Promise<void> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!memoryId) {
      throw new Error('Memory ID 不能为空');
    }

    try {
      const db = await getDB();
      const memory = await db.get('memories', memoryId);

      if (!memory) {
        throw new Error(`Memory 不存在: ${memoryId}`);
      }

      // 验证是否属于指定的书籍
      if (memory.bookId !== bookId) {
        throw new Error(`Memory 不属于指定的书籍: ${bookId}`);
      }

      await db.delete('memories', memoryId);

      // 清除缓存
      const cacheKey = this.getCacheKey(bookId, memoryId);
      this.memoryCache.delete(cacheKey);

      // 清除该书籍的搜索结果缓存（因为删除了记忆）
      this.clearSearchCacheForBook(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId, action: 'deleted' });
    } catch (error) {
      console.error('Failed to delete memory:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('删除 Memory 失败');
    }
  }

  /**
   * 获取指定书籍的所有 Memory（用于调试/管理）
   */
  static async getAllMemories(bookId: string): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }

    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      // 按最后访问时间倒序排序
      allMemories.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      const results = allMemories.map((memory) => {
        const result: Memory = {
          id: memory.id,
          bookId: memory.bookId,
          content: memory.content,
          summary: memory.summary,
          createdAt: memory.createdAt,
          lastAccessedAt: memory.lastAccessedAt,
        };

        // 更新缓存
        const cacheKey = this.getCacheKey(bookId, memory.id);
        this.memoryCache.set(cacheKey, result);
        return result;
      });

      this.evictCacheIfNeeded();

      return results;
    } catch (error) {
      console.error('Failed to get all memories:', error);
      throw new Error('获取所有 Memory 失败');
    }
  }

  /**
   * 批量获取多本书籍的所有 Memory
   * @param bookIds 书籍 ID 列表
   * @returns Map<bookId, Memory[]> 按书籍 ID 分组的 Memory 列表
   */
  static async getAllMemoriesForBooks(bookIds: string[]): Promise<Map<string, Memory[]>> {
    if (!bookIds || bookIds.length === 0) {
      return new Map();
    }

    const result = new Map<string, Memory[]>();

    // 并发加载所有书籍的 Memory
    await Promise.all(
      bookIds.map(async (bookId) => {
        try {
          const memories = await this.getAllMemories(bookId);
          if (memories.length > 0) {
            result.set(bookId, memories);
          }
        } catch (error) {
          console.warn(`[MemoryService] 加载书籍 ${bookId} 的 Memory 失败:`, error);
          // 不中断其他书籍的加载
        }
      }),
    );

    return result;
  }

  /**
   * 批量获取多本书籍的所有 Memory（返回扁平数组）
   * @param bookIds 书籍 ID 列表
   * @returns 所有书籍的 Memory 扁平数组
   */
  static async getAllMemoriesForBooksFlat(bookIds: string[]): Promise<Memory[]> {
    const memoriesMap = await this.getAllMemoriesForBooks(bookIds);
    const allMemories: Memory[] = [];
    for (const memories of memoriesMap.values()) {
      allMemories.push(...memories);
    }
    return allMemories;
  }

  /**
   * 获取最近的 Memory（用于 AI 上下文）
   * @param bookId 书籍 ID
   * @param limit 返回的记忆数量限制（默认 10）
   * @param sortBy 排序方式：'createdAt' 按创建时间，'lastAccessedAt' 按最后访问时间（默认）
   * @param updateAccessTime 是否更新最后访问时间（默认 true）
   * @returns 最近的 Memory 列表
   */
  static async getRecentMemories(
    bookId: string,
    limit: number = 10,
    sortBy: 'createdAt' | 'lastAccessedAt' = 'lastAccessedAt',
    updateAccessTime: boolean = true,
  ): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (limit <= 0) {
      throw new Error('限制数量必须大于 0');
    }

    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      // 按指定字段排序
      if (sortBy === 'createdAt') {
        allMemories.sort((a, b) => b.createdAt - a.createdAt);
      } else {
        allMemories.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);
      }

      // 取前 limit 条
      const recentMemories = allMemories.slice(0, limit);

      // 如果需要更新访问时间
      if (updateAccessTime && recentMemories.length > 0) {
        const now = Date.now();
        const tx = db.transaction('memories', 'readwrite');
        for (const memory of recentMemories) {
          const updatedMemory: MemoryStorage = {
            ...memory,
            lastAccessedAt: now,
          };
          await tx.store.put(updatedMemory);
        }
        await tx.done;

        // 返回更新后的记忆
        const results = recentMemories.map((memory) => {
          const result: Memory = {
            id: memory.id,
            bookId: memory.bookId,
            content: memory.content,
            summary: memory.summary,
            createdAt: memory.createdAt,
            lastAccessedAt: now,
          };

          // 更新缓存
          const cacheKey = this.getCacheKey(bookId, memory.id);
          this.memoryCache.set(cacheKey, result);
          return result;
        });

        this.evictCacheIfNeeded();
        return results;
      }

      // 返回未更新的记忆
      const results = recentMemories.map((memory) => {
        const result: Memory = {
          id: memory.id,
          bookId: memory.bookId,
          content: memory.content,
          summary: memory.summary,
          createdAt: memory.createdAt,
          lastAccessedAt: memory.lastAccessedAt,
        };

        // 更新缓存
        const cacheKey = this.getCacheKey(bookId, memory.id);
        this.memoryCache.set(cacheKey, result);
        return result;
      });

      this.evictCacheIfNeeded();
      return results;
    } catch (error) {
      console.error('Failed to get recent memories:', error);
      throw new Error('获取最近 Memory 失败');
    }
  }
}
