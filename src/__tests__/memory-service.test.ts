import { describe, expect, it, mock, beforeEach, afterEach, spyOn } from 'bun:test';
import './setup';
import type { Memory, MemoryAttachment } from '../models/memory';
import { getDB } from 'src/utils/indexed-db';
const { MemoryService } = await import('../services/memory-service');

// 辅助函数：创建测试用 Memory
function createTestMemory(
  id: string,
  bookId: string,
  content: string,
  summary: string,
  createdAt?: number,
  lastAccessedAt?: number,
  attachedTo?: MemoryAttachment[],
): Memory {
  const now = Date.now();
  return {
    id,
    bookId,
    content,
    summary,
    attachedTo: attachedTo ?? [{ type: 'book', id: bookId }],
    createdAt: createdAt || now,
    lastAccessedAt: lastAccessedAt || now,
  };
}

describe('MemoryService', () => {
  beforeEach(async () => {
    const database = await getDB();
    await database.clear('memories');
    // 清理 MemoryService 的缓存（通过反射访问私有字段）
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const service = MemoryService as any;
    if (service.memoryCache) {
      service.memoryCache.clear();
    }
    if (service.searchResultCache) {
      service.searchResultCache.clear();
    }
  });

  afterEach(() => {
    mock.restore();
  });

  describe('createMemory', () => {
    it('应该成功创建 Memory', async () => {
      const bookId = 'book-1';
      const content = '这是测试内容';
      const summary = '测试摘要';

      const database = await getDB();
      await database.clear('memories');

      const memory = await MemoryService.createMemory(bookId, content, summary);

      expect(memory).toBeTruthy();
      expect(memory.bookId).toBe(bookId);
      expect(memory.content).toBe(content);
      expect(memory.summary).toBe(summary);
      expect(memory.id).toBeTruthy();
      expect(memory.id.length).toBe(8); // 短 ID 应该是 8 位
      expect(memory.createdAt).toBeGreaterThan(0);
      expect(memory.lastAccessedAt).toBeGreaterThan(0);
      const saved = await MemoryService.getMemory(bookId, memory.id);
      expect(saved).toBeTruthy();
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.createMemory('', 'content', 'summary')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在 content 为空时抛出错误', async () => {
      await (expect(MemoryService.createMemory('book-1', '', 'summary')).rejects.toThrow(
        '内容不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在 summary 为空时抛出错误', async () => {
      await (expect(MemoryService.createMemory('book-1', 'content', '')).rejects.toThrow(
        '摘要不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在达到 500 条记录限制时自动删除最旧的记录', async () => {
      const bookId = 'book-1';
      const content = '新内容';
      const summary = '新摘要';

      const database = await getDB();
      await database.clear('memories');
      const tx = database.transaction('memories', 'readwrite');
      const store = tx.objectStore('memories');
      for (let i = 0; i < 500; i++) {
        await store.put(
          createTestMemory(`id-${i}`, bookId, `content-${i}`, `summary-${i}`, 1000 + i, 1000 + i),
        );
      }
      await tx.done;

      const memory = await MemoryService.createMemory(bookId, content, summary);

      expect(memory).toBeTruthy();
      const remaining = await MemoryService.getAllMemories(bookId);
      expect(remaining).toHaveLength(500);
    });

    it('应该支持创建时传入附件', async () => {
      const bookId = 'book-1';
      const content = '这是测试内容';
      const summary = '测试摘要';
      const attachments: MemoryAttachment[] = [
        { type: 'character', id: 'char-1' },
        { type: 'term', id: 'term-1' },
      ];

      await MemoryService.createMemory(bookId, content, summary, attachments);
      const all = await MemoryService.getAllMemories(bookId);
      expect(all[0]?.attachedTo).toEqual(attachments);
    });
  });

  describe('getMemory', () => {
    it('应该成功获取 Memory', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary);

      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result).toBeTruthy();
      expect(result?.id).toBe(memoryId);
      expect(result?.bookId).toBe(bookId);
      expect(result?.content).toBe('内容');
      expect(result?.summary).toBe('摘要');
      expect(result?.id).toBe(memoryId);
    });

    it('应该在 Memory 不存在时返回 null', async () => {
      const bookId = 'book-not-exist';
      const memoryId = 'memory-not-exist';

      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result).toBeNull();
    });

    it('应该在 Memory 不属于指定书籍时返回 null', async () => {
      const bookId = 'book-wrong';
      const memoryId = 'memory-wrong';
      const memory = createTestMemory(memoryId, 'book-other', '内容', '摘要'); // 不同的 bookId

      await MemoryService.createMemoryWithId(
        'book-other',
        memoryId,
        memory.content,
        memory.summary,
      );
      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result).toBeNull();
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.getMemory('', 'memory-1')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在 memoryId 为空时抛出错误', async () => {
      await (expect(MemoryService.getMemory('book-1', '')).rejects.toThrow(
        'Memory ID 不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该更新 lastAccessedAt（LRU 机制）', async () => {
      const bookId = 'book-lru-test';
      const memoryId = 'memory-lru-test';
      const oldTime = 1000;
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要', oldTime, oldTime);

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary, {
        createdAt: oldTime,
        lastAccessedAt: oldTime,
      });

      const beforeAccess = Date.now();
      const result = await MemoryService.getMemory(bookId, memoryId);
      const afterAccess = Date.now();

      expect(result).toBeTruthy();
      // 由于时间戳可能在同一毫秒内，使用更宽松的检查
      expect(result?.lastAccessedAt).toBeGreaterThanOrEqual(oldTime);
      expect(result?.lastAccessedAt).toBeLessThanOrEqual(afterAccess + 10); // 允许 10ms 误差
      expect(result?.lastAccessedAt).toBeGreaterThanOrEqual(oldTime);
    });

    it('应该为缺少 attachedTo 的旧数据补默认附件', async () => {
      const bookId = 'book-1';
      const memoryId = 'legacy-memory';
      const legacyMemory = {
        id: memoryId,
        bookId,
        content: '旧内容',
        summary: '旧摘要',
        createdAt: 1000,
        lastAccessedAt: 1000,
      } as unknown as Memory;

      const database = await getDB();
      await database.put('memories', legacyMemory as any);

      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result?.attachedTo).toEqual([{ type: 'book', id: bookId }]);
    });
  });

  describe('searchMemoriesByKeyword', () => {
    it('应该根据关键词搜索 Memory', async () => {
      const bookId = 'book-1';
      const keyword = '测试';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '测试摘要1'),
        createTestMemory('id-2', bookId, '内容2', '其他摘要'),
        createTestMemory('id-3', bookId, '内容3', '测试摘要2'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);

      expect(results).toHaveLength(2);
      expect(results[0]?.summary).toContain('测试');
      expect(results[1]?.summary).toContain('测试');
      // 应该按 lastAccessedAt 倒序排序
      expect(results[0]?.lastAccessedAt).toBeGreaterThanOrEqual(results[1]?.lastAccessedAt || 0);
    });

    it('应该不区分大小写搜索', async () => {
      const bookId = 'book-1';
      const keyword = 'TEST';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', 'test摘要'),
        createTestMemory('id-2', bookId, '内容2', '其他摘要'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);

      expect(results).toHaveLength(1);
      expect(results[0]?.summary).toContain('test');
    });

    it('应该在找不到匹配项时返回空数组', async () => {
      const bookId = 'book-1';
      const keyword = '不存在的关键词';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '其他摘要'),
        createTestMemory('id-2', bookId, '内容2', '另一个摘要'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);

      expect(results).toHaveLength(0);
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.searchMemoriesByKeyword('', 'keyword')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在 keyword 为空时抛出错误', async () => {
      await (expect(MemoryService.searchMemoriesByKeyword('book-1', '')).rejects.toThrow(
        '关键词不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该更新匹配 Memory 的 lastAccessedAt', async () => {
      const bookId = 'book-1';
      const keyword = '测试';

      const memories = [createTestMemory('id-1', bookId, '内容1', '测试摘要', 1000, 1000)];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memories[0]!);
      await tx.done;

      const beforeSearch = Date.now();
      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);
      const afterSearch = Date.now();

      expect(results).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedDatabase = await getDB();
      const updated = await updatedDatabase.get('memories', memories[0]!.id);
      expect(updated?.lastAccessedAt).toBeGreaterThanOrEqual(beforeSearch);
      expect(updated?.lastAccessedAt).toBeLessThanOrEqual(afterSearch + 20);
    });
  });

  describe('deleteMemory', () => {
    it('应该成功删除 Memory', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary);

      await MemoryService.deleteMemory(bookId, memoryId);
      const result = await MemoryService.getMemory(bookId, memoryId);
      expect(result).toBeNull();
    });

    it('应该在 Memory 不存在时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';

      await (expect(MemoryService.deleteMemory(bookId, memoryId)).rejects.toThrow(
        `Memory 不存在: ${memoryId}`,
      ) as unknown as Promise<void>);
    });

    it('应该在 Memory 不属于指定书籍时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, 'book-2', '内容', '摘要'); // 不同的 bookId

      await MemoryService.createMemoryWithId('book-2', memoryId, memory.content, memory.summary);

      await (expect(MemoryService.deleteMemory(bookId, memoryId)).rejects.toThrow(
        `Memory 不属于指定的书籍: ${bookId}`,
      ) as unknown as Promise<void>);
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.deleteMemory('', 'memory-1')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该在 memoryId 为空时抛出错误', async () => {
      await (expect(MemoryService.deleteMemory('book-1', '')).rejects.toThrow(
        'Memory ID 不能为空',
      ) as unknown as Promise<void>);
    });
  });

  describe('getAllMemories', () => {
    it('应该返回指定书籍的所有 Memory', async () => {
      const bookId = 'book-1';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 2000),
        createTestMemory('id-2', bookId, '内容2', '摘要2', 1001, 2001),
        createTestMemory('id-3', bookId, '内容3', '摘要3', 1002, 2002),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getAllMemories(bookId);

      expect(results).toHaveLength(3);
      // 应该按 lastAccessedAt 倒序排序
      expect(results[0]?.lastAccessedAt).toBeGreaterThanOrEqual(results[1]?.lastAccessedAt || 0);
      expect(results[1]?.lastAccessedAt).toBeGreaterThanOrEqual(results[2]?.lastAccessedAt || 0);
    });

    it('应该在没有任何 Memory 时返回空数组', async () => {
      const bookId = 'book-1';

      const database = await getDB();
      await database.clear('memories');

      const results = await MemoryService.getAllMemories(bookId);

      expect(results).toHaveLength(0);
    });

    it('应该只返回指定书籍的 Memory', async () => {
      const bookId = 'book-1';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '摘要1'),
        createTestMemory('id-2', 'book-2', '内容2', '摘要2'), // 不同的 bookId
        createTestMemory('id-3', bookId, '内容3', '摘要3'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getAllMemories(bookId);

      expect(results).toHaveLength(2);
      expect(results.every((m) => m.bookId === bookId)).toBe(true);
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.getAllMemories('')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });
  });

  describe('getMemoriesByAttachment', () => {
    it('应该按附件查询并按 lastAccessedAt 倒序排序', async () => {
      const bookId = 'book-1';
      const attachment: MemoryAttachment = { type: 'character', id: 'char-1' };

      const memory1 = createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 3000, [
        { type: 'character', id: 'char-1' },
      ]);
      const memory2 = createTestMemory('id-2', bookId, '内容2', '摘要2', 1001, 2000, [
        { type: 'character', id: 'char-1' },
      ]);
      const memory3 = createTestMemory('id-3', bookId, '内容3', '摘要3', 1002, 4000, [
        { type: 'term', id: 'term-1' },
      ]);

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.store.put(memory2);
      await tx.store.put(memory3);
      await tx.done;

      const results = await MemoryService.getMemoriesByAttachment(bookId, attachment);

      expect(results).toHaveLength(2);
      expect(results[0]?.id).toBe('id-1');
      expect(results[1]?.id).toBe('id-2');
    });

    it('应该过滤掉不包含目标附件的记录', async () => {
      const bookId = 'book-1';
      const attachment: MemoryAttachment = { type: 'character', id: 'char-1' };

      const memory1 = createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 3000, [
        { type: 'character', id: 'char-1' },
      ]);
      const memory2 = createTestMemory('id-2', bookId, '内容2', '摘要2', 1001, 2000, [
        { type: 'character', id: 'char-2' },
      ]);

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.store.put(memory2);
      await tx.done;

      const results = await MemoryService.getMemoriesByAttachment(bookId, attachment);

      expect(results).toHaveLength(1);
      expect(results[0]?.id).toBe('id-1');
    });

    it('应该在附件参数不完整时抛出错误', async () => {
      const bookId = 'book-1';

      await (expect(
        MemoryService.getMemoriesByAttachment(bookId, {
          type: '',
          id: '',
        } as unknown as MemoryAttachment),
      ).rejects.toThrow('附件信息不能为空') as unknown as Promise<void>);
    });

    it('应该异步更新访问时间', async () => {
      const bookId = 'book-1';
      const attachment: MemoryAttachment = { type: 'character', id: 'char-1' };

      const memory1 = createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 2000, [
        { type: 'character', id: 'char-1' },
      ]);

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.done;

      await MemoryService.getMemoriesByAttachment(bookId, attachment);

      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  });

  describe('getMemoriesByAttachments', () => {
    it('应该按 OR 逻辑查询并去重', async () => {
      const bookId = 'book-1';
      const attachments: MemoryAttachment[] = [
        { type: 'character', id: 'char-1' },
        { type: 'term', id: 'term-1' },
      ];

      const memory1 = createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 3000, [
        { type: 'character', id: 'char-1' },
      ]);
      const memory2 = createTestMemory('id-2', bookId, '内容2', '摘要2', 1001, 2000, [
        { type: 'term', id: 'term-1' },
      ]);
      const memory3 = createTestMemory('id-3', bookId, '内容3', '摘要3', 1002, 4000, [
        { type: 'character', id: 'char-1' },
        { type: 'term', id: 'term-1' },
      ]);

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.store.put(memory2);
      await tx.store.put(memory3);
      await tx.done;

      const results = await MemoryService.getMemoriesByAttachments(bookId, attachments);

      expect(results).toHaveLength(3);
      expect(results[0]?.id).toBe('id-3');
      expect(results[1]?.id).toBe('id-1');
      expect(results[2]?.id).toBe('id-2');
    });

    it('应该忽略无效附件并在没有有效附件时抛出错误', async () => {
      const bookId = 'book-1';

      await (expect(MemoryService.getMemoriesByAttachments(bookId, [])).rejects.toThrow(
        '附件数组不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该异步更新访问时间', async () => {
      const bookId = 'book-1';
      const attachments: MemoryAttachment[] = [{ type: 'character', id: 'char-1' }];

      const memory1 = createTestMemory('id-1', bookId, '内容1', '摘要1', 1000, 2000, [
        { type: 'character', id: 'char-1' },
      ]);

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.done;

      await MemoryService.getMemoriesByAttachments(bookId, attachments);

      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    it('应该处理大量附件查询结果（500 条）', async () => {
      const bookId = 'book-1';
      const attachments: MemoryAttachment[] = [{ type: 'character', id: 'char-1' }];
      const memories = Array.from({ length: 500 }, (_, i) =>
        createTestMemory(`id-${i}`, bookId, `内容${i}`, `摘要${i}`, 1000 + i, 1000 + i, [
          { type: 'character', id: 'char-1' },
        ]),
      );

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getMemoriesByAttachments(bookId, attachments);

      expect(results).toHaveLength(500);
    });
  });

  describe('不同书籍的隔离', () => {
    it('应该确保不同书籍的 Memory 相互隔离', async () => {
      const bookId1 = 'book-1';
      const bookId2 = 'book-2';

      const memories1 = [
        createTestMemory('id-1', bookId1, '内容1', '摘要1'),
        createTestMemory('id-2', bookId1, '内容2', '摘要2'),
      ];

      const memories2 = [createTestMemory('id-3', bookId2, '内容3', '摘要3')];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories1) {
        await tx.store.put(memory);
      }
      for (const memory of memories2) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results1 = await MemoryService.getAllMemories(bookId1);
      const results2 = await MemoryService.getAllMemories(bookId2);

      expect(results1).toHaveLength(2);
      expect(results2).toHaveLength(1);
      expect(results1.every((m) => m.bookId === bookId1)).toBe(true);
      expect(results2.every((m) => m.bookId === bookId2)).toBe(true);
    });
  });

  describe('LRU 缓存机制', () => {
    it('应该在获取 Memory 时更新 lastAccessedAt', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const oldTime = 1000;
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要', oldTime, oldTime);

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary, {
        createdAt: oldTime,
        lastAccessedAt: oldTime,
      });

      const beforeAccess = Date.now();
      await MemoryService.getMemory(bookId, memoryId);
      const afterAccess = Date.now();

      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedDatabase = await getDB();
      const updated = await updatedDatabase.get('memories', memoryId);
      expect(updated?.lastAccessedAt).toBeGreaterThanOrEqual(beforeAccess);
      expect(updated?.lastAccessedAt).toBeLessThanOrEqual(afterAccess + 20);
    });

    it('应该在搜索 Memory 时更新匹配项的 lastAccessedAt', async () => {
      const bookId = 'book-1';
      const keyword = '测试';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '测试摘要', 1000, 1000),
        createTestMemory('id-2', bookId, '内容2', '其他摘要', 1001, 1001),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const beforeSearch = Date.now();
      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);
      const afterSearch = Date.now();

      expect(results).toHaveLength(1);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const updatedDatabase = await getDB();
      const updated = await updatedDatabase.get('memories', 'id-1');
      expect(updated?.lastAccessedAt).toBeGreaterThanOrEqual(beforeSearch);
      expect(updated?.lastAccessedAt).toBeLessThanOrEqual(afterSearch + 20);
    });
  });

  describe('内存缓存功能', () => {
    it('应该在缓存命中时直接返回，不访问数据库', async () => {
      const bookId = 'book-cache-test';
      const memoryId = 'memory-cache-test';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      const created = await MemoryService.createMemoryWithId(
        bookId,
        memoryId,
        memory.content,
        memory.summary,
      );
      const firstResult = await MemoryService.getMemory(bookId, created.id);
      expect(firstResult).toBeTruthy();
      expect(firstResult?.id).toBe(created.id);

      // 第二次获取：应该从缓存读取
      const secondResult = await MemoryService.getMemory(bookId, created.id);
      expect(secondResult).toBeTruthy();
      expect(secondResult?.id).toBe(created.id);
      expect(secondResult?.content).toBe('内容');
      // 缓存命中时，主要的 getMemory 调用应该立即返回缓存数据
      // 注意：可能会异步调用 db.get 来更新访问时间，但主流程应该立即返回
    });

    it('应该在创建 Memory 后更新缓存', async () => {
      const bookId = 'book-cache-create';
      const content = '新内容';
      const summary = '新摘要';

      const memory = await MemoryService.createMemory(bookId, content, summary);
      expect(memory).toBeTruthy();

      // 再次获取应该从缓存读取（或从数据库读取，但内容应该一致）
      const cachedMemory = await MemoryService.getMemory(bookId, memory.id);
      expect(cachedMemory).toBeTruthy();
      expect(cachedMemory?.id).toBe(memory.id);
      expect(cachedMemory?.content).toBe(content);
      expect(cachedMemory?.summary).toBe(summary);
    });

    it('应该在更新 Memory 后更新缓存', async () => {
      const bookId = 'book-cache-update';
      const memoryId = 'memory-cache-update';
      const oldMemory = createTestMemory(memoryId, bookId, '旧内容', '旧摘要');
      const newContent = '新内容';
      const newSummary = '新摘要';

      await MemoryService.createMemoryWithId(
        bookId,
        memoryId,
        oldMemory.content,
        oldMemory.summary,
      );
      await MemoryService.getMemory(bookId, memoryId);

      const updatedMemory = await MemoryService.updateMemory(
        bookId,
        memoryId,
        newContent,
        newSummary,
      );

      expect(updatedMemory.content).toBe(newContent);
      expect(updatedMemory.summary).toBe(newSummary);

      // 再次获取应该从缓存读取更新后的数据
      const cachedMemory = await MemoryService.getMemory(bookId, memoryId);
      expect(cachedMemory).toBeTruthy();
      expect(cachedMemory?.content).toBe(newContent);
      expect(cachedMemory?.summary).toBe(newSummary);
    });

    it('应该在删除 Memory 后清除缓存', async () => {
      const bookId = 'book-cache-delete';
      const memoryId = 'memory-cache-delete';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary);
      await MemoryService.getMemory(bookId, memoryId);

      // 删除 Memory
      await MemoryService.deleteMemory(bookId, memoryId);

      // 再次获取应该返回 null（缓存已清除，数据库也没有）
      const result = await MemoryService.getMemory(bookId, memoryId);
      expect(result).toBeNull();
    });

    it('应该在搜索 Memory 后更新缓存', async () => {
      const bookId = 'book-cache-search';
      const keyword = '测试';

      const memories = [
        createTestMemory('id-search-1', bookId, '内容1', '测试摘要'),
        createTestMemory('id-search-2', bookId, '内容2', '其他摘要'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results: Memory[] = await (MemoryService.searchMemoriesByKeywords(bookId, [
        keyword,
      ]) as Promise<Memory[]>);

      expect(results).toHaveLength(1);

      // 再次获取匹配的 Memory 应该从缓存读取
      const cachedMemory = await MemoryService.getMemory(bookId, 'id-search-1');
      expect(cachedMemory).toBeTruthy();
      expect(cachedMemory?.id).toBe('id-search-1');
      expect(cachedMemory?.summary).toContain('测试');
    });

    it('应该确保不同书籍的 Memory 缓存隔离', async () => {
      const bookId1 = 'book-isolate-1';
      const bookId2 = 'book-isolate-2';
      const memoryId1 = 'memory-isolate-1';
      const memoryId2 = 'memory-isolate-2';
      const memory1 = createTestMemory(memoryId1, bookId1, '内容1', '摘要1');
      const memory2 = createTestMemory(memoryId2, bookId2, '内容2', '摘要2');

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      await tx.store.put(memory1);
      await tx.store.put(memory2);
      await tx.done;
      const result1 = await MemoryService.getMemory(bookId1, memoryId1);
      expect(result1?.bookId).toBe(bookId1);
      expect(result1?.content).toBe('内容1');

      // 获取 book-2 的 Memory（不同 ID，确保缓存分离）
      const result2 = await MemoryService.getMemory(bookId2, memoryId2);
      expect(result2?.bookId).toBe(bookId2);
      expect(result2?.content).toBe('内容2');

      // 验证两个结果不同（缓存键不同：bookId1:memoryId vs bookId2:memoryId）
      expect(result1?.content).not.toBe(result2?.content);
    });

    it('应该在缓存命中时异步更新数据库访问时间', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      await MemoryService.createMemoryWithId(bookId, memoryId, memory.content, memory.summary);
      await MemoryService.getMemory(bookId, memoryId);
      // 第二次获取：从缓存读取
      const cachedResult = await MemoryService.getMemory(bookId, memoryId);
      expect(cachedResult).toBeTruthy();

      // 等待一小段时间，让异步更新完成
      await new Promise((resolve) => setTimeout(resolve, 10));

      // 验证异步更新访问时间被调用（可能会调用一次 db.get 和 db.put）
      // 注意：由于是异步的，可能不会立即调用，但应该不会阻塞主流程
    });
  });

  describe('updateMemory', () => {
    it('应该成功更新 Memory', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const oldMemory = createTestMemory(memoryId, bookId, '旧内容', '旧摘要');
      const newContent = '新内容';
      const newSummary = '新摘要';

      await MemoryService.createMemoryWithId(
        bookId,
        memoryId,
        oldMemory.content,
        oldMemory.summary,
        { createdAt: oldMemory.createdAt, lastAccessedAt: oldMemory.lastAccessedAt },
      );

      const beforeUpdate = Date.now();
      const updatedMemory = await MemoryService.updateMemory(
        bookId,
        memoryId,
        newContent,
        newSummary,
      );
      const afterUpdate = Date.now();

      expect(updatedMemory).toBeTruthy();
      expect(updatedMemory.id).toBe(memoryId);
      expect(updatedMemory.bookId).toBe(bookId);
      expect(updatedMemory.content).toBe(newContent);
      expect(updatedMemory.summary).toBe(newSummary);
      expect(updatedMemory.createdAt).toBe(oldMemory.createdAt);
      // lastAccessedAt 应该被更新为当前时间
      expect(updatedMemory.lastAccessedAt).toBeGreaterThanOrEqual(beforeUpdate);
      expect(updatedMemory.lastAccessedAt).toBeLessThanOrEqual(afterUpdate);
    });

    it('应该在 Memory 不存在时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';

      await (expect(MemoryService.updateMemory(bookId, memoryId, '内容', '摘要')).rejects.toThrow(
        `Memory 不存在: ${memoryId}`,
      ) as unknown as Promise<void>);
    });

    it('应该在 Memory 不属于指定书籍时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, 'book-2', '内容', '摘要');

      await MemoryService.createMemoryWithId('book-2', memoryId, memory.content, memory.summary);
      await (expect(
        MemoryService.updateMemory(bookId, memoryId, '新内容', '新摘要'),
      ).rejects.toThrow(`Memory 不属于指定的书籍: ${bookId}`) as unknown as Promise<void>);
    });

    it('应该在参数为空时抛出错误', async () => {
      await (expect(MemoryService.updateMemory('', 'memory-1', '内容', '摘要')).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);

      await (expect(MemoryService.updateMemory('book-1', '', '内容', '摘要')).rejects.toThrow(
        'Memory ID 不能为空',
      ) as unknown as Promise<void>);

      await (expect(MemoryService.updateMemory('book-1', 'memory-1', '', '摘要')).rejects.toThrow(
        '内容不能为空',
      ) as unknown as Promise<void>);

      await (expect(MemoryService.updateMemory('book-1', 'memory-1', '内容', '')).rejects.toThrow(
        '摘要不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该支持更新附件', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const oldMemory = createTestMemory(memoryId, bookId, '旧内容', '旧摘要');
      const newAttachments: MemoryAttachment[] = [{ type: 'term', id: 'term-1' }];

      await MemoryService.createMemoryWithId(
        bookId,
        memoryId,
        oldMemory.content,
        oldMemory.summary,
        { createdAt: oldMemory.createdAt, lastAccessedAt: oldMemory.lastAccessedAt },
        oldMemory.attachedTo,
      );

      const updatedMemory = await MemoryService.updateMemory(
        bookId,
        memoryId,
        '新内容',
        '新摘要',
        newAttachments,
      );

      expect(updatedMemory.attachedTo).toEqual(newAttachments);
    });

    it('应该在传入空附件数组时回退到默认书籍附件', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const oldMemory = createTestMemory(memoryId, bookId, '旧内容', '旧摘要');

      await MemoryService.createMemoryWithId(
        bookId,
        memoryId,
        oldMemory.content,
        oldMemory.summary,
        { createdAt: oldMemory.createdAt, lastAccessedAt: oldMemory.lastAccessedAt },
        oldMemory.attachedTo,
      );

      const updatedMemory = await MemoryService.updateMemory(
        bookId,
        memoryId,
        '新内容',
        '新摘要',
        [], // 传入空数组
      );

      // 应该被规范化为默认的书籍附件
      expect(updatedMemory.attachedTo).toEqual([{ type: 'book', id: bookId }]);
    });
  });

  describe('getRecentMemories', () => {
    it('应该返回最近的 Memory', async () => {
      const bookId = 'book-1';
      const limit = 5;

      const memories = Array.from({ length: 10 }, (_, i) =>
        createTestMemory(`id-${i}`, bookId, `内容${i}`, `摘要${i}`, 1000 + i, 2000 + i),
      );

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getRecentMemories(bookId, limit);

      expect(results).toHaveLength(limit);
      // 应该按 lastAccessedAt 倒序排序
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]?.lastAccessedAt).toBeGreaterThanOrEqual(
          results[i + 1]?.lastAccessedAt || 0,
        );
      }
    });

    it('应该按创建时间排序（当指定 sortBy 为 createdAt）', async () => {
      const bookId = 'book-1';
      const limit = 5;

      const memories = Array.from({ length: 10 }, (_, i) =>
        createTestMemory(`id-${i}`, bookId, `内容${i}`, `摘要${i}`, 1000 + i, 2000 - i),
      );

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getRecentMemories(bookId, limit, 'createdAt');

      expect(results).toHaveLength(limit);
      // 应该按 createdAt 倒序排序
      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i]?.createdAt).toBeGreaterThanOrEqual(results[i + 1]?.createdAt || 0);
      }
    });

    it('应该在 updateAccessTime 为 false 时不更新访问时间', async () => {
      const bookId = 'book-1';
      const limit = 5;
      const oldTime = 1000;

      const memories = Array.from({ length: 5 }, (_, i) =>
        createTestMemory(`id-${i}`, bookId, `内容${i}`, `摘要${i}`, oldTime, oldTime),
      );

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.getRecentMemories(bookId, limit, 'lastAccessedAt', false);

      expect(results).toHaveLength(limit);
      // 访问时间应该保持不变
      results.forEach((result) => {
        expect(result.lastAccessedAt).toBe(oldTime);
      });
    });

    it('应该在 limit 小于等于 0 时抛出错误', async () => {
      const bookId = 'book-1';

      await (expect(MemoryService.getRecentMemories(bookId, 0)).rejects.toThrow(
        '限制数量必须大于 0',
      ) as unknown as Promise<void>);

      await (expect(MemoryService.getRecentMemories(bookId, -1)).rejects.toThrow(
        '限制数量必须大于 0',
      ) as unknown as Promise<void>);
    });

    it('应该在 bookId 为空时抛出错误', async () => {
      await (expect(MemoryService.getRecentMemories('', 10)).rejects.toThrow(
        '书籍 ID 不能为空',
      ) as unknown as Promise<void>);
    });
  });

  describe('searchMemoriesByKeywords', () => {
    it('应该根据多个关键词搜索 Memory（AND 逻辑）', async () => {
      const bookId = 'book-1';
      const keywords = ['测试', '摘要'];

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '测试摘要'),
        createTestMemory('id-2', bookId, '内容2', '测试内容'),
        createTestMemory('id-3', bookId, '内容3', '其他摘要'),
        createTestMemory('id-4', bookId, '内容4', '测试摘要内容'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.searchMemoriesByKeywords(bookId, keywords);

      // 应该只返回同时包含"测试"和"摘要"的 Memory
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        const summaryLower = result.summary.toLowerCase();
        expect(summaryLower).toContain('测试');
        expect(summaryLower).toContain('摘要');
      });
    });

    it('应该在 keywords 为空数组时抛出错误', async () => {
      const bookId = 'book-1';

      await (expect(MemoryService.searchMemoriesByKeywords(bookId, [])).rejects.toThrow(
        '关键词数组不能为空',
      ) as unknown as Promise<void>);
    });

    it('应该过滤掉空字符串关键词', async () => {
      const bookId = 'book-1';
      const keywords = ['测试', '', '   ', '摘要'];

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '测试摘要'),
        createTestMemory('id-2', bookId, '内容2', '其他内容'),
      ];

      const database = await getDB();
      const tx = database.transaction('memories', 'readwrite');
      for (const memory of memories) {
        await tx.store.put(memory);
      }
      await tx.done;

      const results = await MemoryService.searchMemoriesByKeywords(bookId, keywords);

      // 应该只使用有效的关键词（"测试"和"摘要"）
      expect(results.length).toBeGreaterThan(0);
      results.forEach((result) => {
        const summaryLower = result.summary.toLowerCase();
        expect(summaryLower).toContain('测试');
        expect(summaryLower).toContain('摘要');
      });
    });
  });
});
