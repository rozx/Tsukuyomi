import { getDB } from 'src/utils/indexed-db';
import { generateShortId } from 'src/utils/id-generator';
import type { Memory } from 'src/models/memory';
import { useSettingsStore } from 'src/stores/settings';
import { EmbeddingQueue } from 'src/services/embedding-queue';

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
  embedding?: number[];
  embeddingModel?: string;
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

  private static dispatchMemoryChanged(detail: {
    bookId: string;
    memoryId?: string;
    action: string;
  }) {
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

  // 书籍级全量缓存：记忆注入打分时一次性读取整本书的所有 Memory
  // TTL 60s 足以覆盖同一翻译任务内多次分块的反复读取
  private static bookMemoryCache = new Map<string, { data: Memory[]; expiresAt: number }>();
  private static readonly BOOK_CACHE_TTL_MS = 60_000;

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
   * 批量更新记忆的访问时间（异步，不阻塞）
   */
  private static async updateAccessTimesBatch(memoryIds: string[], bookId: string): Promise<void> {
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
                ...(memory as MemoryStorage),
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

      this.invalidateBookMemoryCache(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId: result.id, action: 'created' });

      EmbeddingQueue.enqueue(result.id, bookId);

      return result;
    } catch (error) {
      console.error('Failed to create memory:', error);
      throw new Error('创建 Memory 失败');
    }
  }

  /**
   * 同步专用：按远端条目原样 upsert 一个 Memory。
   *
   * 与 `createMemoryWithId` 的区别：
   * - 不对 `createdAt` / `lastAccessedAt` 做任何钳制（min/max 合并）——远端是权威，
   *   若本地在 apply 时把时间戳钳成别的值，会导致下一轮重新计算的 hash 与远端 manifest
   *   不一致，触发空转上传
   * - 不强制写 `summary` 非空（远端导入场景允许空摘要）
   *
   * Embedding 处理（关键）：
   * `stripMemoryLocalFields` 在上传前就剥离了 `embedding` / `embeddingModel`，
   * 所以增量下载拿到的 Memory 通常**不带** embedding 字段。若直接 `put(storage)`，
   * 本地已经算好的 embedding 会被连带清掉，语义检索会退化。
   * 规则：
   * - 若 incoming 带 embedding：按远端字段原样保留（覆盖本地）
   * - 若 incoming 不带 embedding，但本地 IDB 已有：保留本地 embedding
   * - 若 incoming 的 content/summary 相对本地发生变化：既有 embedding 已陈旧，
   *   丢弃并入队 EmbeddingQueue 异步重算
   */
  static async upsertMemoryForSync(memory: Memory): Promise<void> {
    if (!memory?.id) {
      throw new Error('Memory ID 不能为空');
    }
    if (!memory.bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    const db = await getDB();
    const tx = db.transaction('memories', 'readwrite');
    const store = tx.objectStore('memories');

    const existing = (await store.get(memory.id)) as MemoryStorage | undefined;

    // 跨 book ID 冲突守卫：`memories` store 仅以 id 为主键。若同步路径盲目 put，
    // 另一本书里恰好同 id 的记录会被静默改 bookId / 覆盖。Memory id 是 8 位 hex，
    // 碰撞罕见但不是零——必须显式拒绝，让上层看到错误并回退到冲突解决。
    if (existing && existing.bookId !== memory.bookId) {
      throw new Error(`Memory ID 冲突：${memory.id}`);
    }

    const storage: MemoryStorage = {
      id: memory.id,
      bookId: memory.bookId,
      content: memory.content,
      summary: memory.summary,
      createdAt: memory.createdAt,
      lastAccessedAt: memory.lastAccessedAt,
    };

    let shouldEnqueueRecompute = false;
    if (memory.embedding !== undefined) {
      storage.embedding = memory.embedding;
      if (memory.embeddingModel !== undefined) storage.embeddingModel = memory.embeddingModel;
    } else if (existing?.embedding !== undefined) {
      // incoming 不带 embedding：本地已算好的 embedding 是否仍然可信？
      const contentChanged =
        existing.content !== memory.content || existing.summary !== memory.summary;
      if (contentChanged) {
        // 文本变了 → embedding 陈旧，不保留，交给 EmbeddingQueue 重算
        shouldEnqueueRecompute = true;
      } else {
        storage.embedding = existing.embedding;
        if (existing.embeddingModel !== undefined) storage.embeddingModel = existing.embeddingModel;
      }
    }

    await store.put(storage);
    await tx.done;

    if (shouldEnqueueRecompute) {
      EmbeddingQueue.enqueue(memory.id, memory.bookId);
    }

    const cachedMemory: Memory = {
      id: storage.id,
      bookId: storage.bookId,
      content: storage.content,
      summary: storage.summary,
      createdAt: storage.createdAt,
      lastAccessedAt: storage.lastAccessedAt,
    };
    if (storage.embedding !== undefined) cachedMemory.embedding = storage.embedding;
    if (storage.embeddingModel !== undefined) cachedMemory.embeddingModel = storage.embeddingModel;

    const cacheKey = this.getCacheKey(memory.bookId, memory.id);
    this.memoryCache.set(cacheKey, cachedMemory);
    this.evictCacheIfNeeded();
    this.invalidateBookMemoryCache(memory.bookId);
    this.dispatchMemoryChanged({ bookId: memory.bookId, memoryId: memory.id, action: 'imported' });
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

        this.invalidateBookMemoryCache(bookId);

        this.dispatchMemoryChanged({ bookId, memoryId, action: 'imported' });

        if (existing.content !== content || existing.summary !== summary) {
          EmbeddingQueue.enqueue(memoryId, bookId);
        }

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
        typeof timestamps?.lastAccessedAt === 'number' ? timestamps.lastAccessedAt : createdAt;

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

      this.invalidateBookMemoryCache(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId: result.id, action: 'imported' });

      EmbeddingQueue.enqueue(result.id, bookId);

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
        ...(memory as MemoryStorage),
        lastAccessedAt: now,
      };
      await db.put('memories', updatedMemory);

      const result = this.storageToMemoryWithEmbedding(updatedMemory);

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
        ...(memory as MemoryStorage),
        lastAccessedAt: Date.now(),
      };
      await db.put('memories', updatedMemory);
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Failed to update access time in DB:', error);
    }
  }

  /**
   * 根据关键词搜索 Memory（向后兼容，内部调用 searchMemories）
   */
  static async searchMemoriesByKeyword(bookId: string, keyword: string): Promise<Memory[]> {
    if (!keyword || !keyword.trim()) {
      throw new Error('关键词不能为空');
    }
    return this.searchMemories(bookId, keyword);
  }

  /**
   * 搜索 Memory（三信号打分：语义 + 关键词 + 时间衰减）。
   * 内部复用 memory-scoring 的 scoreMemory 统一管线，EmbeddingService 不可用时自动降级为纯关键词+时间衰减。
   * 过滤条件：keyword > 0 或 total > minScore（读取用户设置的 minScoreThreshold，默认 0.34），
   * 即只要有关键词命中就一定返回，否则按总分过滤。
   */
  static async searchMemories(bookId: string, query: string): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!query || !query.trim()) {
      throw new Error('搜索查询不能为空');
    }

    const queryText = query.trim();
    const queryTokens = queryText
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 0);

    try {
      const allMemories = await this.getAllBookMemories(bookId);

      let chunkEmbedding: Float32Array | undefined;
      try {
        const { EmbeddingService } = await import('src/services/embedding-service');
        if (EmbeddingService.isReady()) {
          const vec = await EmbeddingService.embed(queryText, 'query');
          if (vec) chunkEmbedding = vec;
        }
      } catch {
        // 语义搜索不可用时静默降级
      }

      const { scoreMemory } = await import('src/services/memory-scoring');
      const now = Date.now();
      const chunkEntities = queryTokens.map((t) => ({ name: t }));
      const scored = allMemories.map((memory) => {
        const breakdown = scoreMemory(memory, { chunkEntities, chunkEmbedding, now });
        return { memory, breakdown };
      });

      let minScore = 0.34;
      try {
        const { useSettingsStore } = await import('src/stores/settings');
        const cfg = useSettingsStore().settings?.memoryInjection;
        if (typeof cfg?.minScoreThreshold === 'number') minScore = cfg.minScoreThreshold;
      } catch {
        /* 保持默认 */
      }

      const filtered = scored.filter(
        (s) => s.breakdown.keyword > 0 || s.breakdown.total > minScore,
      );
      filtered.sort((a, b) => b.breakdown.total - a.breakdown.total);

      const resultIds = filtered.map((s) => s.memory.id);
      if (resultIds.length > 0) {
        this.updateAccessTimesBatch(resultIds, bookId).catch((error) => {
          console.warn('Failed to update access times asynchronously:', error);
        });
      }

      return filtered.map((s) => s.memory);
    } catch (error) {
      console.error('Failed to search memories:', error);
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
    /** 保留指定的 lastAccessedAt（用于同步场景，避免覆盖远程时间戳） */
    preserveLastAccessedAt?: number,
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
        ...(memory as MemoryStorage),
        content,
        summary,
        lastAccessedAt: preserveLastAccessedAt ?? now,
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

      this.invalidateBookMemoryCache(bookId);

      this.dispatchMemoryChanged({ bookId, memoryId, action: 'updated' });

      // 仅在文本内容实际变化时重新入队嵌入(避免无意义重算)
      const oldSummary = (memory as MemoryStorage).summary;
      const oldContent = (memory as MemoryStorage).content;
      if (oldSummary !== summary || oldContent !== content) {
        EmbeddingQueue.enqueue(memoryId, bookId);
      }

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
      EmbeddingQueue.cancel(memoryId);

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

      // 记录到删除列表（防止远程同步恢复已删除的 Memory）
      try {
        const settingsStore = useSettingsStore();
        const gistSync = settingsStore.gistSync;
        const deletedMemoryIds = gistSync.deletedMemoryIds || [];

        if (!deletedMemoryIds.find((record) => record.id === memoryId)) {
          deletedMemoryIds.push({
            id: memoryId,
            deletedAt: Date.now(),
          });
          await settingsStore.updateGistSync({
            deletedMemoryIds,
          });
        }
      } catch {
        // 记录删除记录失败不应阻止删除操作本身
        console.warn(`[MemoryService] 记录 Memory ${memoryId} 的删除记录失败`);
      }

      // 清除缓存
      const cacheKey = this.getCacheKey(bookId, memoryId);
      this.memoryCache.delete(cacheKey);

      // 清除该书籍的搜索结果缓存（因为删除了记忆）

      this.invalidateBookMemoryCache(bookId);

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
   * 从 MemoryStorage 构造 Memory,保留 embedding 字段(供打分模块使用)。
   */
  private static storageToMemoryWithEmbedding(storage: MemoryStorage): Memory {
    const result: Memory = {
      id: storage.id,
      bookId: storage.bookId,
      content: storage.content,
      summary: storage.summary,
      createdAt: storage.createdAt,
      lastAccessedAt: storage.lastAccessedAt,
    };
    if (storage.embedding !== undefined) result.embedding = storage.embedding;
    if (storage.embeddingModel !== undefined) result.embeddingModel = storage.embeddingModel;
    return result;
  }

  /**
   * 清理指定书籍的全量缓存(在 CRUD 写路径调用)
   */
  private static invalidateBookMemoryCache(bookId: string): void {
    this.bookMemoryCache.delete(bookId);
  }

  /**
   * 获取指定书籍的所有 Memory(带 60s TTL 缓存,返回的 Memory 保留 embedding 字段)。
   * 供记忆注入打分模块使用:同一翻译任务中多次分块只会读一次 IDB。
   */
  static async getAllBookMemories(bookId: string): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }

    const now = Date.now();
    const cached = this.bookMemoryCache.get(bookId);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const rows = (await index.getAll(bookId)) as MemoryStorage[];
      const memories = rows.map((row) => this.storageToMemoryWithEmbedding(row));

      this.bookMemoryCache.set(bookId, {
        data: memories,
        expiresAt: now + this.BOOK_CACHE_TTL_MS,
      });

      return memories;
    } catch (error) {
      console.error('Failed to get all book memories:', error);
      throw new Error('获取书籍全部 Memory 失败');
    }
  }

  /**
   * 按 memoryId 读取单条 Memory(无副作用:不更新 lastAccessedAt,不触发任何事件)。
   * 供嵌入队列、后台任务等"只读"场景使用,返回值保留 embedding 字段。
   * 未找到或失败时返回 null(而非抛异常)。
   */
  static async getMemoryByIdOnly(memoryId: string): Promise<Memory | null> {
    if (!memoryId) return null;
    try {
      const db = await getDB();
      const storage = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
      if (!storage) return null;
      return this.storageToMemoryWithEmbedding(storage);
    } catch (error) {
      console.warn(`[MemoryService] getMemoryByIdOnly 失败 (${memoryId}):`, error);
      return null;
    }
  }

  /**
   * 仅写入 embedding 字段(不更新 lastAccessedAt,不影响 Gist 同步 dirty flag)。
   * 会 dispatch 'embedding-updated' 事件供 UI 徽章订阅,但不触发 CRUD 类的 memory-changed。
   *
   * 设计约束:
   * - 直接 IDB put,绕过 updateMemory 公共入口,避免在嵌入队列批量写回时再次触发 CRUD diff 判断
   * - 不 dispatch 'memory-changed',避免 UI 将此视作"用户可见"的修改(badge 渲染由专门的
   *   'embedding-updated' 事件或组件轮询 bookMemoryCache 处理)
   * - 同步更新 memoryCache / bookMemoryCache 中的对应条目,使打分立即可见
   */
  static async updateMemoryEmbeddingOnly(
    memoryId: string,
    embedding: number[],
    embeddingModel: string,
  ): Promise<void> {
    if (!memoryId) {
      throw new Error('Memory ID 不能为空');
    }
    if (!embedding || embedding.length === 0) {
      throw new Error('embedding 不能为空');
    }
    if (!embeddingModel) {
      throw new Error('embeddingModel 不能为空');
    }

    try {
      const db = await getDB();
      const existing = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
      if (!existing) return;

      const updated: MemoryStorage = {
        ...existing,
        embedding,
        embeddingModel,
      };
      await db.put('memories', updated);

      // 同步内存缓存:单条 LRU
      const cacheKey = this.getCacheKey(existing.bookId, memoryId);
      const cachedSingle = this.memoryCache.get(cacheKey);
      if (cachedSingle) {
        this.memoryCache.set(cacheKey, {
          ...cachedSingle,
          embedding,
          embeddingModel,
        });
      }

      // 同步书级全量缓存(原地更新,避免整本缓存失效)
      const cachedBook = this.bookMemoryCache.get(existing.bookId);
      if (cachedBook) {
        const next = cachedBook.data.map((m) =>
          m.id === memoryId ? { ...m, embedding, embeddingModel } : m,
        );
        this.bookMemoryCache.set(existing.bookId, {
          data: next,
          expiresAt: cachedBook.expiresAt,
        });
      }

      // 广播"embedding 已更新"事件供 UI 徽章订阅,复用 memory-changed 通道但 action 明确区分
      this.dispatchMemoryChanged({
        bookId: existing.bookId,
        memoryId,
        action: 'embedding-updated',
      });
    } catch (error) {
      console.warn(`[MemoryService] 写入 embedding 失败 (${memoryId}):`, error);
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
        const result = this.storageToMemoryWithEmbedding(memory as MemoryStorage);

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
            ...(memory as MemoryStorage),
            lastAccessedAt: now,
          };
          await tx.store.put(updatedMemory);
        }
        await tx.done;

        // 返回更新后的记忆
        const results = recentMemories.map((memory) => {
          const result = this.storageToMemoryWithEmbedding(memory as MemoryStorage);
          result.lastAccessedAt = now;

          const cacheKey = this.getCacheKey(bookId, memory.id);
          this.memoryCache.set(cacheKey, result);
          return result;
        });

        this.evictCacheIfNeeded();
        return results;
      }

      // 返回未更新的记忆
      const results = recentMemories.map((memory) => {
        const result = this.storageToMemoryWithEmbedding(memory as MemoryStorage);

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
