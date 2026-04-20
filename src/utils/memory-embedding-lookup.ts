/**
 * Memory embedding 查询/写入叶子工具 — 直接读写 IndexedDB 的 `memories` 表，
 * 供 embedding-queue 等不能 import `MemoryService`（会形成循环依赖）的模块使用。
 *
 * 关注点：只做 DB 层面的操作，不做 LRU 缓存同步、也不派发 'memory-changed'
 * 事件。MemoryService 的 `memoryCache` / `bookMemoryCache` 在下次读取时会
 * 因 TTL 刷新或自然命中 DB 读，从而与 embedding 字段最终一致。UI 的
 * 'embedding-updated' 通知在此路径下不会发送 —— 对 MemoryDetailDialog 等
 * 组件的影响是"嵌入完成后不自动刷新"，用户需要重新打开 Dialog。
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

function storageToMemory(storage: MemoryStorage): Memory {
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
 */
export async function updateMemoryEmbeddingInDB(
  memoryId: string,
  embedding: number[],
  embeddingModel: string,
): Promise<void> {
  if (!memoryId) throw new Error('Memory ID 不能为空');
  if (!embedding || embedding.length === 0) throw new Error('embedding 不能为空');
  if (!embeddingModel) throw new Error('embeddingModel 不能为空');

  try {
    const db = await getDB();
    const existing = (await db.get('memories', memoryId)) as MemoryStorage | undefined;
    if (!existing) return;
    const updated: MemoryStorage = { ...existing, embedding, embeddingModel };
    await db.put('memories', updated);
  } catch (error) {
    console.warn(`[memory-embedding-lookup] 写入 embedding 失败 (${memoryId}):`, error);
  }
}
