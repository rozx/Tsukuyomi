import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { MemoryService } from '../services/memory-service';
import type { Memory } from '../models/memory';

// Mock IndexedDB
const mockStoreGet = mock((_key: string) => Promise.resolve(undefined as unknown));
const mockStorePut = mock(() => Promise.resolve(undefined));
const mockStoreDelete = mock(() => Promise.resolve(undefined));
const mockStoreClear = mock(() => Promise.resolve(undefined));
const mockStoreGetAll = mock(() => Promise.resolve([]));
const mockStoreCount = mock(() => Promise.resolve(0));

const mockIndexGetAll = mock<(_key: string) => Promise<Memory[]>>((_key: string) =>
  Promise.resolve([]),
);
const mockIndexCount = mock((_key: string) => Promise.resolve(0));

const mockTransactionStorePut = mock(() => Promise.resolve(undefined));

// 用于存储测试数据的内存存储，供游标使用
let testMemoryData: Memory[] = [];
// 存储当前游标的状态
let currentCursorBookId: string | null = null;
let currentCursorIndex = 0;

const mockTransaction = mock((_mode: 'readonly' | 'readwrite') => {
  return {
    objectStore: () => ({
      get: mockStoreGet,
      put: mockStorePut,
      delete: mockStoreDelete,
      clear: mockStoreClear,
      getAll: mockStoreGetAll,
      count: mockStoreCount,
      index: (name: string) => {
        return {
          getAll: mockIndexGetAll,
          count: mockIndexCount,
          openCursor: (bookId: string) => {
            // 重置游标状态
            currentCursorBookId = bookId;
            currentCursorIndex = 0;
            const filtered = testMemoryData.filter((m) => m.bookId === bookId);
            
            // 创建游标类型
            type CursorType = {
              value: Memory;
              continue: () => Promise<CursorType | null>;
            } | null;
            
            // 创建游标函数
            const createNextCursor = (): CursorType => {
              if (currentCursorIndex >= filtered.length) {
                return null;
              }
              const current = filtered[currentCursorIndex];
              if (!current) {
                return null;
              }
              currentCursorIndex++;
              
              return {
                value: current,
                continue: () => {
                  return Promise.resolve(createNextCursor());
                },
              };
            };
            
            return Promise.resolve(createNextCursor());
          },
        };
      },
    }),
    store: {
      get: mockStoreGet,
      put: mockTransactionStorePut, // 用于 searchMemoriesByKeyword 中的更新
      delete: mockStoreDelete,
      index: () => ({
        getAll: mockIndexGetAll,
        count: mockIndexCount,
      }),
    },
    done: Promise.resolve(),
  };
});

const mockPut = mock((_storeName: string, _value: unknown) => Promise.resolve(undefined));
const mockGet = mock((_storeName: string, _key: string) => Promise.resolve(undefined as unknown));
const mockDelete = mock((_storeName: string, _key: string) => Promise.resolve(undefined));

const mockDb = {
  getAll: mock(() => Promise.resolve([])),
  get: mockGet,
  put: mockPut,
  delete: mockDelete,
  transaction: mockTransaction,
};

// Mock the module
await mock.module('src/utils/indexed-db', () => ({
  getDB: () => Promise.resolve(mockDb),
}));

// 辅助函数：创建测试用 Memory
function createTestMemory(
  id: string,
  bookId: string,
  content: string,
  summary: string,
  createdAt?: number,
  lastAccessedAt?: number,
): Memory {
  const now = Date.now();
  return {
    id,
    bookId,
    content,
    summary,
    createdAt: createdAt || now,
    lastAccessedAt: lastAccessedAt || now,
  };
}

describe('MemoryService', () => {
  beforeEach(() => {
    // 重置所有 mock
    mockPut.mockClear();
    mockGet.mockClear();
    mockDelete.mockClear();
    mockStoreGet.mockClear();
    mockStorePut.mockClear();
    mockStoreDelete.mockClear();
    mockStoreGetAll.mockClear();
    mockStoreCount.mockClear();
    mockIndexGetAll.mockClear();
    mockIndexCount.mockClear();
    mockTransaction.mockClear();
    mockTransactionStorePut.mockClear();
    // 重置测试数据
    testMemoryData = [];
    currentCursorBookId = null;
    currentCursorIndex = 0;
  });

  describe('createMemory', () => {
    it('应该成功创建 Memory', async () => {
      const bookId = 'book-1';
      const content = '这是测试内容';
      const summary = '测试摘要';

      // Mock: 没有现有记录
      mockIndexCount.mockResolvedValue(0);
      // Mock: ID 检查返回 undefined（ID 不存在，可以使用）
      mockStoreGet.mockResolvedValue(undefined);

      const memory = await MemoryService.createMemory(bookId, content, summary);

      expect(memory).toBeTruthy();
      expect(memory.bookId).toBe(bookId);
      expect(memory.content).toBe(content);
      expect(memory.summary).toBe(summary);
      expect(memory.id).toBeTruthy();
      expect(memory.id.length).toBe(8); // 短 ID 应该是 8 位
      expect(memory.createdAt).toBeGreaterThan(0);
      expect(memory.lastAccessedAt).toBeGreaterThan(0);
      // 应该调用了 store.put 来保存新的 Memory
      expect(mockStorePut).toHaveBeenCalled();
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

      // Mock: 已有 500 条记录
      mockIndexCount.mockResolvedValue(500);
      const oldMemories = Array.from({ length: 500 }, (_, i) =>
        createTestMemory(`id-${i}`, bookId, `content-${i}`, `summary-${i}`, 1000 + i, 1000 + i),
      );
      // Mock: index.getAll() 返回所有记录
      mockIndexGetAll.mockResolvedValue(oldMemories);
      // 设置测试数据，供游标使用
      testMemoryData = oldMemories;
      
      // Mock: ID 检查返回 undefined（ID 不存在，可以使用）
      mockStoreGet.mockResolvedValue(undefined);

      const memory = await MemoryService.createMemory(bookId, content, summary);

      expect(memory).toBeTruthy();
      // 应该调用了 store.delete 来删除最旧的记录（通过事务内的 store）
      expect(mockStoreDelete).toHaveBeenCalled();
    });
  });

  describe('getMemory', () => {
    it('应该成功获取 Memory', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      // Mock: 返回 Memory
      mockGet.mockResolvedValue(memory);

      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result).toBeTruthy();
      expect(result?.id).toBe(memoryId);
      expect(result?.bookId).toBe(bookId);
      expect(result?.content).toBe('内容');
      expect(result?.summary).toBe('摘要');
      expect(mockGet).toHaveBeenCalledWith('memories', memoryId);
      // 应该更新了 lastAccessedAt
      expect(mockPut).toHaveBeenCalled();
    });

    it('应该在 Memory 不存在时返回 null', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';

      // Mock: 返回 undefined
      mockGet.mockResolvedValue(undefined);

      const result = await MemoryService.getMemory(bookId, memoryId);

      expect(result).toBeNull();
    });

    it('应该在 Memory 不属于指定书籍时返回 null', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, 'book-2', '内容', '摘要'); // 不同的 bookId

      // Mock: 返回 Memory
      mockGet.mockResolvedValue(memory);

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
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const oldTime = 1000;
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要', oldTime, oldTime);

      // Mock: 返回 Memory
      mockGet.mockResolvedValue(memory);

      const beforeAccess = Date.now();
      const result = await MemoryService.getMemory(bookId, memoryId);
      const afterAccess = Date.now();

      expect(result).toBeTruthy();
      expect(result?.lastAccessedAt).toBeGreaterThanOrEqual(beforeAccess);
      expect(result?.lastAccessedAt).toBeLessThanOrEqual(afterAccess);
      // 应该调用了 put 来更新 lastAccessedAt
      expect(mockPut).toHaveBeenCalled();
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

      // Mock: 返回所有 Memory
      mockIndexGetAll.mockResolvedValue(memories);

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

      mockIndexGetAll.mockResolvedValue(memories);

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

      mockIndexGetAll.mockResolvedValue(memories);

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

      mockIndexGetAll.mockResolvedValue(memories);

      const beforeSearch = Date.now();
      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);
      const afterSearch = Date.now();

      expect(results).toHaveLength(1);
      expect(results[0]?.lastAccessedAt).toBeGreaterThanOrEqual(beforeSearch);
      expect(results[0]?.lastAccessedAt).toBeLessThanOrEqual(afterSearch);
      // 应该调用了 transaction.store.put 来更新 lastAccessedAt
      expect(mockTransactionStorePut).toHaveBeenCalled();
    });
  });

  describe('deleteMemory', () => {
    it('应该成功删除 Memory', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, bookId, '内容', '摘要');

      // Mock: 返回 Memory
      mockGet.mockResolvedValue(memory);
      // Mock: 删除成功
      mockDelete.mockResolvedValue(undefined);

      await MemoryService.deleteMemory(bookId, memoryId);

      expect(mockDelete).toHaveBeenCalledWith('memories', memoryId);
    });

    it('应该在 Memory 不存在时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';

      // Mock: 返回 undefined
      mockGet.mockResolvedValue(undefined);

      await (expect(MemoryService.deleteMemory(bookId, memoryId)).rejects.toThrow(
        `Memory 不存在: ${memoryId}`,
      ) as unknown as Promise<void>);
    });

    it('应该在 Memory 不属于指定书籍时抛出错误', async () => {
      const bookId = 'book-1';
      const memoryId = 'memory-1';
      const memory = createTestMemory(memoryId, 'book-2', '内容', '摘要'); // 不同的 bookId

      // Mock: 返回 Memory
      mockGet.mockResolvedValue(memory);

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

      // Mock: 返回所有 Memory
      mockIndexGetAll.mockResolvedValue(memories);

      const results = await MemoryService.getAllMemories(bookId);

      expect(results).toHaveLength(3);
      // 应该按 lastAccessedAt 倒序排序
      expect(results[0]?.lastAccessedAt).toBeGreaterThanOrEqual(results[1]?.lastAccessedAt || 0);
      expect(results[1]?.lastAccessedAt).toBeGreaterThanOrEqual(results[2]?.lastAccessedAt || 0);
    });

    it('应该在没有任何 Memory 时返回空数组', async () => {
      const bookId = 'book-1';

      // Mock: 返回空数组
      mockIndexGetAll.mockResolvedValue([]);

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

      // Mock: IndexedDB 索引查询只返回匹配的 bookId
      const filteredMemories = memories.filter((m) => m.bookId === bookId);
      mockIndexGetAll.mockResolvedValue(filteredMemories);

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

  describe('不同书籍的隔离', () => {
    it('应该确保不同书籍的 Memory 相互隔离', async () => {
      const bookId1 = 'book-1';
      const bookId2 = 'book-2';

      const memories1 = [
        createTestMemory('id-1', bookId1, '内容1', '摘要1'),
        createTestMemory('id-2', bookId1, '内容2', '摘要2'),
      ];

      const memories2 = [createTestMemory('id-3', bookId2, '内容3', '摘要3')];

      // Mock: 根据 bookId 返回不同的 Memory
      mockIndexGetAll.mockImplementation((bookId: string) => {
        if (bookId === bookId1) {
          return Promise.resolve(memories1);
        } else if (bookId === bookId2) {
          return Promise.resolve(memories2);
        }
        return Promise.resolve([]);
      });

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

      mockGet.mockResolvedValue(memory);

      const beforeAccess = Date.now();
      await MemoryService.getMemory(bookId, memoryId);
      const afterAccess = Date.now();

      // 验证 put 被调用，且 lastAccessedAt 已更新
      expect(mockPut).toHaveBeenCalled();
      const putCall = mockPut.mock.calls[0];
      if (putCall && putCall[1]) {
        const updatedMemory = putCall[1] as Memory;
        expect(updatedMemory.lastAccessedAt).toBeGreaterThanOrEqual(beforeAccess);
        expect(updatedMemory.lastAccessedAt).toBeLessThanOrEqual(afterAccess);
      }
    });

    it('应该在搜索 Memory 时更新匹配项的 lastAccessedAt', async () => {
      const bookId = 'book-1';
      const keyword = '测试';

      const memories = [
        createTestMemory('id-1', bookId, '内容1', '测试摘要', 1000, 1000),
        createTestMemory('id-2', bookId, '内容2', '其他摘要', 1001, 1001),
      ];

      mockIndexGetAll.mockResolvedValue(memories);

      const beforeSearch = Date.now();
      const results: Memory[] = await (MemoryService.searchMemoriesByKeyword(
        bookId,
        keyword,
      ) as Promise<Memory[]>);
      const afterSearch = Date.now();

      expect(results).toHaveLength(1);
      expect(results[0]?.lastAccessedAt).toBeGreaterThanOrEqual(beforeSearch);
      expect(results[0]?.lastAccessedAt).toBeLessThanOrEqual(afterSearch);
    });
  });
});
