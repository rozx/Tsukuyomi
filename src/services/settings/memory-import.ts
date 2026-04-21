/**
 * 共享 Memory 导入逻辑 —— 供 SPA 的 ImportExportTab 与 Electron 的 useElectronSettings 复用。
 *
 * 覆盖语义：先清空所有本地 memories，再按快照重建。
 * - 清空：否则旧 memory 会残留进入检索，与 UI "覆盖" 文案不符
 * - id 保留：快照里每条 memory 的 id 原样写回 —— backup restore 幂等，不会制造重复
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
 * 覆盖式导入：即便传入空数组也会清空本地 memories（与 UI "覆盖" 文案一致）。
 * undefined 表示快照里根本没有 memories 字段 —— 这时跳过以避免无意义地抹掉本地数据。
 * @param logPrefix 出错时 console.warn 前缀，用于区分调用方
 */
export async function importMemoriesPreservingIdentity(
  memories: Memory[] | undefined,
  logPrefix: string,
): Promise<void> {
  if (memories === undefined) return;

  try {
    await MemoryService.clearAllMemories();
  } catch (error) {
    console.warn(`${logPrefix} 清空本地 Memory 失败：`, error);
    return;
  }

  if (memories.length === 0) return;

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
