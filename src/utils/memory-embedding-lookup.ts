/**
 * Memory embedding 查询/写入叶子工具 — 直接读写 IndexedDB 的 `memories` 表，
 * 供 embedding-queue 等不能 import `MemoryService`（会形成循环依赖）的模块使用。
 *
 * 关注点：只做 DB 层面的 get/put。LRU 缓存同步与 'embedding-updated' 事件派发
 * 走 `services/memory-cache` 这个中性叶子，由调用方（MemoryService 和 EmbeddingQueue）
 * 自行组合：先 `updateMemoryEmbeddingInDB` 再 `syncMemoryEmbeddingCaches + dispatchMemoryChanged`。
 * 这样两个子系统都只依赖叶子，彼此之间没有反向依赖，循环依赖得以避免。
 */

import { getDB } from 'src/utils/indexed-db';
import type { Memory } from 'src/models/memory';
import { MODEL_VERSION } from 'src/services/embedding-service';

/**
 * Memory 存储结构（IndexedDB）
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
 * 把 IndexedDB 里的 MemoryStorage 转成对外 Memory，保留可选的 embedding 字段。
 * 叶子 DB 工具与 MemoryService 的读路径共用（MemoryService 直接 re-export 这个函数）。
 */
export function storageToMemory(storage: MemoryStorage): Memory {
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
 * 单一事实源 — 判定一条 memory 是否需要(重新)嵌入。
 * 集中在叶子模块避免"比对逻辑在各处独立漂移"。
 */
export function isMemoryEmbeddingStale(memory: {
  embedding?: number[] | undefined;
  embeddingModel?: string | undefined;
}): boolean {
  if (!memory.embedding || memory.embedding.length === 0) return true;
  if (memory.embeddingModel !== MODEL_VERSION) return true;
  return false;
}

/**
 * 按 ID 读取单条 Memory（无副作用：不更新 lastAccessedAt，不触发任何事件）。
 */
export async function getMemoryByIdFromDB(memoryId: string): Promise<Memory | null> {
  if (!memoryId) return null;
  try {
    const db = await getDB();
    const storage = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
    if (!storage) return null;
    return storageToMemory(storage);
  } catch (error) {
    console.warn(`[memory-embedding-lookup] getMemoryByIdFromDB 失败 (${memoryId}):`, error);
    return null;
  }
}

/**
 * 读取某本书的全部 Memory（无缓存、无事件）。调用方若需缓存，应在自己层面处理。
 */
export async function getAllBookMemoriesFromDB(bookId: string): Promise<Memory[]> {
  if (!bookId) return [];
  try {
    const db = await getDB();
    const index = db.transaction('memories', 'readonly').store.index('by-bookId');
    const rows = (await index.getAll(bookId)) as MemoryStorage[];
    return rows.map(storageToMemory);
  } catch (error) {
    console.warn(`[memory-embedding-lookup] getAllBookMemoriesFromDB 失败 (${bookId}):`, error);
    return [];
  }
}

/**
 * 只写入 embedding 字段（不更新 lastAccessedAt，不影响同步 dirty flag）。
 * 不同步 MemoryService 缓存、不派发事件 —— 见文件头注释。
 *
 * 错误处理：失败时抛出（配额、事务中止等），不吞掉。调用方（MemoryService.updateMemoryEmbeddingOnly
 * 与 EmbeddingQueue.processMemoryBatch）各自 try/catch 决定是否跳过缓存同步 / 事件派发。
 * 早期在此吞错会导致 IDB 写失败但缓存标记"已嵌入"，UI 读到假阳性。
 */
export async function updateMemoryEmbeddingInDB(
  memoryId: string,
  embedding: number[],
  embeddingModel: string,
): Promise<void> {
  if (!memoryId) throw new Error('Memory ID 不能为空');
  if (!embedding || embedding.length === 0) throw new Error('embedding 不能为空');
  if (!embeddingModel) throw new Error('embeddingModel 不能为空');

  const db = await getDB();
  const existing = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
  // 记录被删除是合法状态（不是错误），直接 return；缓存侧也没有东西要更新
  if (!existing) return;
  const updated: MemoryStorage = { ...existing, embedding, embeddingModel };
  await db.put('memories', updated);
}

/**
 * 写入后读回记录所属 bookId（供写路径同步缓存用）。记录已删时返回 null。
 */
export async function lookupMemoryBookId(memoryId: string): Promise<string | null> {
  const db = await getDB();
  const existing = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
  return existing ? existing.bookId : null;
}
