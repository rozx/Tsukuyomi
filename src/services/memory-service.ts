import type { IDBPDatabase, IDBPIndex, IDBPObjectStore } from 'idb';
import { getDB } from 'src/utils/indexed-db';
import { generateShortId } from 'src/utils/id-generator';
import type { Memory } from 'src/models/memory';

// 从 getDB() 的返回类型反推数据库 schema（TsukuyomiDB 未从 indexed-db.ts 导出）
type MemoryDB = Awaited<ReturnType<typeof getDB>> extends IDBPDatabase<infer S> ? S : never;
type MemoryStore = IDBPObjectStore<MemoryDB, ['memories'], 'memories', 'readwrite'>;
type MemoryBookIdIndex = IDBPIndex<MemoryDB, ['memories'], 'memories', 'by-bookId', 'readwrite'>;
import { useSettingsStore } from 'src/stores/settings';
import { EmbeddingQueue } from 'src/services/embedding-queue';
// isMemoryEmbeddingStale 的真实定义已下沉到 `utils/memory-embedding-lookup`
// 叶子模块（为了让 embedding-queue 不必 import MemoryService）。本文件从
// 叶子重新导出，保持既有消费者（MemoryCard / MemoryPanel / Dialog 等）的
// import 路径稳定。
export { isMemoryEmbeddingStale } from 'src/utils/memory-embedding-lookup';
import {
  storageToMemory as storageToMemoryWithEmbedding,
  updateMemoryEmbeddingInDB,
  lookupMemoryBookId,
} from 'src/utils/memory-embedding-lookup';
import {
  MEMORY_CACHE_MAX_SIZE,
  BOOK_MEMORY_CACHE_TTL_MS,
  memoryCache,
  bookMemoryCache,
  buildMemoryCacheKey,
  dispatchMemoryChanged,
  syncMemoryEmbeddingCaches,
  addMemoryChangeListener,
  trimMemoryCacheIfOverflow,
  type MemoryChangedDetail,
} from 'src/services/memory-cache';

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
  // 事件订阅 / 缓存 / 分派行为已下沉到中性 `services/memory-cache` 叶子模块，
  // 让 EmbeddingQueue 与 MemoryService 不再通过 MemoryService 互相依赖而形成循环。
  static readonly addMemoryChangeListener = addMemoryChangeListener;
  private static readonly memoryCache = memoryCache;
  private static readonly bookMemoryCache = bookMemoryCache;
  private static readonly CACHE_MAX_SIZE = MEMORY_CACHE_MAX_SIZE;
  private static readonly BOOK_CACHE_TTL_MS = BOOK_MEMORY_CACHE_TTL_MS;

  private static dispatchMemoryChanged(detail: MemoryChangedDetail) {
    dispatchMemoryChanged(detail);
  }

  /**
   * LRU 淘汰：保持 memoryCache 的上限，删除最久未使用的一批。
   */
  private static evictCacheIfNeeded(): void {
    // 删除 20% 的冷条目，避免每次写都要淘汰一次；仅在超过上限时才触发。
    if (this.memoryCache.size > this.CACHE_MAX_SIZE) {
      const target = this.CACHE_MAX_SIZE - Math.floor(this.CACHE_MAX_SIZE * 0.2);
      trimMemoryCacheIfOverflow(target);
    }
  }

  /**
   * 把命中的缓存条目挪到 Map 末尾，体现最近使用。
   */
  private static touchCache(cacheKey: string): void {
    const entry = this.memoryCache.get(cacheKey);
    if (!entry) return;
    this.memoryCache.delete(cacheKey);
    this.memoryCache.set(cacheKey, entry);
  }

  /**
   * updateMemory / deleteMemory 读路径共用的"按 ID 取并校验 ownership"流程。
   */
  private static async loadOwnedMemoryOrThrow(
    bookId: string,
    memoryId: string,
  ): Promise<MemoryStorage> {
    const db = await getDB();
    const memory = await db.get('memories', memoryId);

    if (!memory) {
      throw new Error(`Memory 不存在: ${memoryId}`);
    }

    if (memory.bookId !== bookId) {
      throw new Error(`Memory 不属于指定的书籍: ${bookId}`);
    }

    return memory as MemoryStorage;
  }

  /**
   * createMemoryWithId / updateMemory 顶部共用的四项必填字段校验。
   * 抽出后避免每个写操作重复 4 个 if-throw 分支。
   */
  private static assertMemoryFields(
    bookId: string,
    memoryId: string,
    content: string,
    summary: string,
  ): void {
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
  }

  /**
   * 获取缓存键（bookId:memoryId）
   */
  /**
   * 创建 / 导入 Memory 后的共用收尾步骤：
   * 构建对外的 Memory 对象、更新缓存、失效书籍缓存、派发变更事件、入列 embedding 队列。
   */
  private static finalizeMemoryPersistence(
    memory: MemoryStorage,
    action: 'created' | 'imported',
  ): Memory {
    const result: Memory = {
      id: memory.id,
      bookId: memory.bookId,
      content: memory.content,
      summary: memory.summary,
      createdAt: memory.createdAt,
      lastAccessedAt: memory.lastAccessedAt,
    };

    const cacheKey = this.getCacheKey(memory.bookId, memory.id);
    this.memoryCache.set(cacheKey, result);
    this.evictCacheIfNeeded();

    this.invalidateBookMemoryCache(memory.bookId);
    this.dispatchMemoryChanged({ bookId: memory.bookId, memoryId: result.id, action });
    EmbeddingQueue.enqueue(result.id, memory.bookId);

    return result;
  }

  private static getCacheKey(bookId: string, memoryId: string): string {
    return buildMemoryCacheKey(bookId, memoryId);
  }

  /**
   * 容量保护：若该书籍记忆数已达 MAX_MEMORIES_PER_BOOK，删除 lastAccessedAt 最旧的一条。
   * 在 createMemory / createMemoryWithId 的 insert 前调用，使用同一事务的 store/index 引用。
   */
  private static async evictOldestMemoryIfAtCapacity(
    store: MemoryStore,
    bookIdIndex: MemoryBookIdIndex,
    bookId: string,
  ): Promise<void> {
    const count = await bookIdIndex.count(bookId);
    if (count < MAX_MEMORIES_PER_BOOK) return;

    // 使用 getAll() 获取所有该书籍的记忆（利用索引，非常快）
    // 然后在内存中查找最旧的记录（内存操作比游标迭代快得多）
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

  /**
   * 写路径（update / upsert 更新分支）共用的缓存同步步骤：
   * 1. 把 storage 折叠成对外 Memory 对象（不含 embedding 字段）
   * 2. 更新单条 LRU 缓存，必要时触发淘汰
   * 3. 失效书籍级全量缓存
   * 4. 派发 memory-changed 事件
   *
   * 注意：embedding 队列入队策略因调用方而异（依赖 content/summary 是否变化），
   * 所以 enqueue 仍由各自调用方显式处理，不放进这个 helper。
   */
  private static syncCachesAfterMutation(
    bookId: string,
    memoryId: string,
    storage: MemoryStorage,
    action: 'imported' | 'updated',
  ): Memory {
    const result: Memory = {
      id: storage.id,
      bookId: storage.bookId,
      content: storage.content,
      summary: storage.summary,
      createdAt: storage.createdAt,
      lastAccessedAt: storage.lastAccessedAt,
    };

    const cacheKey = this.getCacheKey(bookId, memoryId);
    this.memoryCache.set(cacheKey, result);
    this.evictCacheIfNeeded();
    this.invalidateBookMemoryCache(bookId);
    this.dispatchMemoryChanged({ bookId, memoryId, action });

    return result;
  }

  /**
   * 读取路径更新 lastAccessedAt 后的统一收尾：
   * - 同步进程内缓存，避免 recency 缓存短时间内仍是旧值
   * - 派发 accessed 事件，让同步状态栏刷新待上传的 memory hash 变化
   */
  private static syncAccessTimesAfterRead(
    bookId: string,
    memoryIds: string[],
    accessedAt: number,
  ): void {
    if (memoryIds.length === 0) return;
    const idSet = new Set(memoryIds);

    for (const memoryId of idSet) {
      const cacheKey = this.getCacheKey(bookId, memoryId);
      const cached = this.memoryCache.get(cacheKey);
      if (cached) {
        this.memoryCache.set(cacheKey, {
          ...cached,
          lastAccessedAt: accessedAt,
        });
      }
    }

    const cachedBook = this.bookMemoryCache.get(bookId);
    if (cachedBook) {
      this.bookMemoryCache.set(bookId, {
        data: cachedBook.data.map((memory) =>
          idSet.has(memory.id) ? { ...memory, lastAccessedAt: accessedAt } : memory,
        ),
        expiresAt: cachedBook.expiresAt,
      });
    }

    this.dispatchMemoryChanged({
      bookId,
      ...(idSet.size === 1 ? { memoryId: memoryIds[0] } : {}),
      action: 'accessed',
    });
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
      const updatedIds: string[] = [];

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
              updatedIds.push(memoryId);
            }
          } catch (error) {
            // 单个更新失败不影响其他更新
            console.warn(`Failed to update access time for memory ${memoryId}:`, error);
          }
        }),
      );

      await tx.done;
      this.syncAccessTimesAfterRead(bookId, updatedIds, now);
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

      // 1. 容量保护：若已达上限则淘汰最旧一条
      await this.evictOldestMemoryIfAtCapacity(store, bookIdIndex, bookId);

      // 2. 生成唯一 ID（使用延迟检查策略，避免获取所有 ID）
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

      // 3. 创建新 Memory
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

      return this.finalizeMemoryPersistence(memory, 'created');
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
    this.assertMemoryFields(bookId, memoryId, content, summary);

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

        const result = this.syncCachesAfterMutation(bookId, memoryId, updatedMemory, 'imported');

        if (existing.content !== content || existing.summary !== summary) {
          EmbeddingQueue.enqueue(memoryId, bookId);
        }

        return result;
      }

      // 新建：如果达到限制，删除最旧的记录
      await this.evictOldestMemoryIfAtCapacity(store, bookIdIndex, bookId);

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

      return this.finalizeMemoryPersistence(memory, 'imported');
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

      const result = storageToMemoryWithEmbedding(updatedMemory);

      // 更新缓存
      this.memoryCache.set(cacheKey, result);
      this.evictCacheIfNeeded();
      this.syncAccessTimesAfterRead(bookId, [memoryId], now);

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
      this.syncAccessTimesAfterRead(bookId, [memoryId], updatedMemory.lastAccessedAt);
    } catch (error) {
      // 静默失败，不影响主流程
      console.warn('Failed to update access time in DB:', error);
    }
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

    try {
      const allMemories = await this.getAllBookMemories(bookId);

      let chunkEmbedding: Float32Array | undefined;
      let expectedModelVersion: string | undefined;
      try {
        const { EmbeddingService, MODEL_VERSION } = await import('src/services/embedding-service');
        if (EmbeddingService.isReady()) {
          const vec = await EmbeddingService.embed(queryText, 'query');
          if (vec) {
            chunkEmbedding = vec;
            // 当前 query 向量已对齐到 MODEL_VERSION,传入让 scoreMemory 跳过版本不符的 stale 记录
            expectedModelVersion = MODEL_VERSION;
          }
        }
      } catch {
        // 语义搜索不可用时静默降级
      }

      const { scoreMemoriesBatch, filterByRelativeRanking, DEFAULT_MIN_SCORE } =
        await import('src/services/memory-scoring');
      const now = Date.now();
      // 传 rawQuery(不是 whitespace-split 出来的 token),让 scoreMemoriesBatch 走
      // 部分匹配打分 — 对无空格 CJK 自然语言查询友好很多。chunkEntities 传空即可。
      const scored = scoreMemoriesBatch(allMemories, {
        chunkEntities: [],
        rawQuery: queryText,
        chunkEmbedding,
        now,
        expectedModelVersion,
      });

      // 默认阈值与 selectByBudget 保持一致(DEFAULT_MIN_SCORE = 0.3),
      // 让"搜索工具"和"翻译注入"走相同的过滤规则,避免 AI 通过 search_memories
      // 看到注入阶段会被过滤掉的低分项,产生行为不一致。
      let minScore = DEFAULT_MIN_SCORE;
      try {
        const { useSettingsStore } = await import('src/stores/settings');
        const cfg = useSettingsStore().settings?.memoryInjection;
        if (typeof cfg?.minScoreThreshold === 'number') minScore = cfg.minScoreThreshold;
      } catch {
        /* 保持默认 */
      }

      // 绝对阈值:严格按 total >= minScore 过滤,不再给"有关键词命中"开后门 —
      // 保证搜索和注入的收敛条件完全相同。
      const absoluteFiltered = scored.filter((s) => s.breakdown.total >= minScore);
      // 相对排名收缩:针对语义余弦噪声地板高的场景,把候选从"全员高分"压成
      // "top 附近的少数突出项",避免工具向 AI 返回一大堆中庸匹配。
      const filtered = filterByRelativeRanking(absoluteFiltered);

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
    this.assertMemoryFields(bookId, memoryId, content, summary);

    try {
      const memory = await this.loadOwnedMemoryOrThrow(bookId, memoryId);
      const db = await getDB();

      const now = Date.now();
      const updatedMemory: MemoryStorage = {
        ...memory,
        content,
        summary,
        lastAccessedAt: preserveLastAccessedAt ?? now,
      };

      await db.put('memories', updatedMemory);

      const result = this.syncCachesAfterMutation(bookId, memoryId, updatedMemory, 'updated');

      // 仅在文本内容实际变化时重新入队嵌入(避免无意义重算)
      if (memory.summary !== summary || memory.content !== content) {
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

      await this.loadOwnedMemoryOrThrow(bookId, memoryId);
      const db = await getDB();
      await db.delete('memories', memoryId);

      // 记录到删除列表（防止远程同步恢复已删除的 Memory）
      try {
        const settingsStore = useSettingsStore();
        const gistSync = settingsStore.gistSync;
        const deletedMemoryIds = gistSync.deletedMemoryIds || [];

        if (!deletedMemoryIds.find((record) => record.id === memoryId)) {
          deletedMemoryIds.push({
            id: memoryId,
            bookId,
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
   * 读取路径共用：把一组 MemoryStorage 转成对外 Memory，同时顺便把每条写入单条缓存，
   * 最后触发一次 LRU 淘汰。由 getAll / getRecent 两个热读入口共用。
   */
  private static mapMemoriesWithCache(memories: MemoryStorage[], bookId: string): Memory[] {
    const results = memories.map((memory) => {
      const result = storageToMemoryWithEmbedding(memory);
      const cacheKey = this.getCacheKey(bookId, memory.id);
      this.memoryCache.set(cacheKey, result);
      return result;
    });
    this.evictCacheIfNeeded();
    return results;
  }

  /**
   * 清理指定书籍的全量缓存(在 CRUD 写路径调用)
   */
  private static invalidateBookMemoryCache(bookId: string): void {
    this.bookMemoryCache.delete(bookId);
  }

  /**
   * 清空所有 Memory —— 用于"导入备份"这类覆盖语义：先清所有本地 memories，
   * 再按快照内容重建。清空 IDB + 进程内两级缓存。队列里残留的 memoryId 会在
   * `processMemoryBatch` 里 lookup miss 自然跳过，不必在此显式 purge。
   */
  static async clearAllMemories(): Promise<void> {
    const db = await getDB();
    await db.clear('memories');
    this.memoryCache.clear();
    this.bookMemoryCache.clear();
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
      const memories = rows.map((row) => storageToMemoryWithEmbedding(row));

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
   * 仅写入 embedding 字段(不更新 lastAccessedAt,不影响 Gist 同步 dirty flag)。
   * 会 dispatch 'embedding-updated' 事件供 UI 徽章订阅,但不触发 CRUD 类的 memory-changed。
   *
   * 设计约束:
   * - 直接 IDB put,绕过 updateMemory 公共入口,避免在嵌入队列批量写回时再次触发 CRUD diff 判断
   * - 不 dispatch 'memory-changed',避免 UI 将此视作"用户可见"的修改(badge 渲染由专门的
   *   'embedding-updated' 事件或组件轮询 bookMemoryCache 处理)
   * - 同步更新 memoryCache / bookMemoryCache 中的对应条目,使打分立即可见
   *
   * 错误处理：底层 IDB put 失败（配额 / 事务中止）会抛出到调用方；不在此处吞掉。
   * 若写入失败，`memoryCache` / `bookMemoryCache` 与 'embedding-updated' 事件都不会更新。
   * 记录不存在不视为错误（resolve + 无 side effect）。
   */
  static async updateMemoryEmbeddingOnly(
    memoryId: string,
    embedding: number[],
    embeddingModel: string,
  ): Promise<void> {
    // 三项参数校验 + IDB put 统一走 leaf `updateMemoryEmbeddingInDB`，
    // 失败直接抛出；缓存刷新与事件派发只在写入成功后执行。
    await updateMemoryEmbeddingInDB(memoryId, embedding, embeddingModel);

    // 记录被删除的合法边界：没有 bookId 就跳过缓存 / 事件。
    const bookId = await lookupMemoryBookId(memoryId);
    if (!bookId) return;

    syncMemoryEmbeddingCaches(bookId, memoryId, embedding, embeddingModel);
    // 'embedding-updated' 事件供 UI 徽章订阅；复用 memory-changed 通道但 action 明确区分。
    this.dispatchMemoryChanged({ bookId, memoryId, action: 'embedding-updated' });
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

      return this.mapMemoriesWithCache(allMemories as MemoryStorage[], bookId);
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
          const result = storageToMemoryWithEmbedding(memory as MemoryStorage);
          result.lastAccessedAt = now;

          const cacheKey = this.getCacheKey(bookId, memory.id);
          this.memoryCache.set(cacheKey, result);
          return result;
        });

        this.evictCacheIfNeeded();
        this.syncAccessTimesAfterRead(
          bookId,
          results.map((memory) => memory.id),
          now,
        );
        return results;
      }

      // 返回未更新的记忆
      return this.mapMemoriesWithCache(recentMemories as MemoryStorage[], bookId);
    } catch (error) {
      console.error('Failed to get recent memories:', error);
      throw new Error('获取最近 Memory 失败');
    }
  }
}
