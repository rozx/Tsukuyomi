import { getDB } from 'src/utils/indexed-db';
import { UniqueIdGenerator } from 'src/utils/id-generator';
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
   * 删除最旧的 Memory（LRU 策略）
   */
  private static async evictOldestMemory(bookId: string): Promise<void> {
    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readwrite').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      if (allMemories.length === 0) return;

      // 按 lastAccessedAt 排序，删除最旧的
      allMemories.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
      const oldest = allMemories[0];
      if (oldest) {
        await db.delete('memories', oldest.id);
      }
    } catch (error) {
      console.error('Failed to evict oldest memory:', error);
    }
  }

  /**
   * 创建新的 Memory
   */
  static async createMemory(
    bookId: string,
    content: string,
    summary: string,
  ): Promise<Memory> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!content) {
      throw new Error('内容不能为空');
    }
    if (!summary) {
      throw new Error('摘要不能为空');
    }

    // 检查是否达到最大数量限制
    const count = await this.getMemoryCountForBook(bookId);
    if (count >= MAX_MEMORIES_PER_BOOK) {
      // 删除最旧的 Memory
      await this.evictOldestMemory(bookId);
    }

    // 生成唯一 ID
    const existingIds = await this.getMemoryIdsForBook(bookId);
    const idGenerator = new UniqueIdGenerator(existingIds);
    const id = idGenerator.generate();

    const now = Date.now();
    const memory: MemoryStorage = {
      id,
      bookId,
      content,
      summary,
      createdAt: now,
      lastAccessedAt: now,
    };

    try {
      const db = await getDB();
      await db.put('memories', memory);

      return {
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
      };
    } catch (error) {
      console.error('Failed to create memory:', error);
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
      const updatedMemory: MemoryStorage = {
        ...memory,
        lastAccessedAt: Date.now(),
      };
      await db.put('memories', updatedMemory);

      return {
        id: updatedMemory.id,
        bookId: updatedMemory.bookId,
        content: updatedMemory.content,
        summary: updatedMemory.summary,
        createdAt: updatedMemory.createdAt,
        lastAccessedAt: updatedMemory.lastAccessedAt,
      };
    } catch (error) {
      console.error('Failed to get memory:', error);
      throw new Error('获取 Memory 失败');
    }
  }

  /**
   * 根据关键词搜索 Memory 的摘要
   */
  static async searchMemoriesByKeyword(
    bookId: string,
    keyword: string,
  ): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!keyword) {
      throw new Error('关键词不能为空');
    }

    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      const keywordLower = keyword.toLowerCase();
      const matchingMemories = allMemories.filter((memory) =>
        memory.summary.toLowerCase().includes(keywordLower),
      );

      // 按最后访问时间倒序排序（最近访问的在前）
      matchingMemories.sort((a, b) => b.lastAccessedAt - a.lastAccessedAt);

      // 更新所有匹配的 Memory 的最后访问时间
      const now = Date.now();
      const tx = db.transaction('memories', 'readwrite');
      for (const memory of matchingMemories) {
        const updatedMemory: MemoryStorage = {
          ...memory,
          lastAccessedAt: now,
        };
        await tx.store.put(updatedMemory);
      }
      await tx.done;

      return matchingMemories.map((memory) => ({
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: now, // 使用更新后的时间
      }));
    } catch (error) {
      console.error('Failed to search memories by keyword:', error);
      throw new Error('搜索 Memory 失败');
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

      return allMemories.map((memory) => ({
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
      }));
    } catch (error) {
      console.error('Failed to get all memories:', error);
      throw new Error('获取所有 Memory 失败');
    }
  }
}

