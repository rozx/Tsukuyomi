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
   */
  static async searchMemoriesByKeywords(bookId: string, keywords: string[]): Promise<Memory[]> {
    if (!bookId) {
      throw new Error('书籍 ID 不能为空');
    }
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      throw new Error('关键词数组不能为空');
    }

    // 过滤掉空字符串
    const validKeywords = keywords.filter((k) => k && k.trim().length > 0);
    if (validKeywords.length === 0) {
      throw new Error('关键词数组不能为空');
    }

    try {
      const db = await getDB();
      const index = db.transaction('memories', 'readonly').store.index('by-bookId');
      const allMemories = await index.getAll(bookId);

      const keywordsLower = validKeywords.map((k) => k.toLowerCase());
      const matchingMemories = allMemories.filter((memory) => {
        const summaryLower = memory.summary.toLowerCase();
        // 所有关键词都必须出现在摘要中（AND 逻辑）
        return keywordsLower.every((keyword) => summaryLower.includes(keyword));
      });

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
      console.error('Failed to search memories by keywords:', error);
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
        return recentMemories.map((memory) => ({
          id: memory.id,
          bookId: memory.bookId,
          content: memory.content,
          summary: memory.summary,
          createdAt: memory.createdAt,
          lastAccessedAt: now,
        }));
      }

      // 返回未更新的记忆
      return recentMemories.map((memory) => ({
        id: memory.id,
        bookId: memory.bookId,
        content: memory.content,
        summary: memory.summary,
        createdAt: memory.createdAt,
        lastAccessedAt: memory.lastAccessedAt,
      }));
    } catch (error) {
      console.error('Failed to get recent memories:', error);
      throw new Error('获取最近 Memory 失败');
    }
  }
}
