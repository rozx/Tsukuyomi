/**
 * 共享 Memory 导入逻辑 —— 供 SPA 的 ImportExportTab 与 Electron 的 useElectronSettings 复用。
 *
 * 行为：保留原 memory.id / createdAt / lastAccessedAt。
 * - id 保留：backup restore 后重复导入是幂等的，不会制造重复数据
 * - createdAt / lastAccessedAt 保留：不重写时间线，不破坏同步去重语义
 */

import { MemoryService } from 'src/services/memory-service';
import type { Memory } from 'src/models/memory';

function groupMemoriesByBook(memories: Memory[]): Map<string, Memory[]> {
  const byBook = new Map<string, Memory[]>();
  for (const memory of memories) {
    if (!byBook.has(memory.bookId)) byBook.set(memory.bookId, []);
    byBook.get(memory.bookId)!.push(memory);
  }
  return byBook;
}

function pickMemoryTimestamps(
  memory: Memory,
): { createdAt?: number; lastAccessedAt?: number } {
  return {
    ...(typeof memory.createdAt === 'number' ? { createdAt: memory.createdAt } : {}),
    ...(typeof memory.lastAccessedAt === 'number'
      ? { lastAccessedAt: memory.lastAccessedAt }
      : {}),
  };
}

/**
 * 按 bookId 分组导入记忆，跨书失败彼此独立。
 * @param logPrefix 出错时 console.warn 前缀，用于区分调用方
 */
export async function importMemoriesPreservingIdentity(
  memories: Memory[] | undefined,
  logPrefix: string,
): Promise<void> {
  if (!memories || memories.length === 0) return;
  const memoriesByBook = groupMemoriesByBook(memories);
  for (const [bookId, list] of memoriesByBook.entries()) {
    try {
      for (const memory of list) {
        await MemoryService.createMemoryWithId(
          bookId,
          memory.id,
          memory.content,
          memory.summary,
          pickMemoryTimestamps(memory),
        );
      }
    } catch (error) {
      console.warn(`${logPrefix} 导入书籍 ${bookId} 的 Memory 失败:`, error);
    }
  }
}
