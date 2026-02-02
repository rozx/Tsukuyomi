import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import { MemoryService } from '../services/memory-service';
import type { Memory, MemoryAttachment } from '../models/memory';

let searchRelatedMemories: (
  bookId: string,
  keywords: string[],
  limit?: number,
) => Promise<Array<{ id: string; summary: string }>>;
let searchRelatedMemoriesHybrid: (
  bookId: string,
  attachments: MemoryAttachment[],
  keywords: string[],
  limit?: number,
) => Promise<Array<{ id: string; summary: string }>>;

describe('searchRelatedMemories', () => {
  let searchMemoriesByKeywordsSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    // 清理其他测试设置的 module mock，确保我们拿到真实实现
    mock.restore();

    // 重新导入模块，获取最新的（未被 mock 的）实现
    const memoryHelper = await import('../services/ai/tools/memory-helper');
    searchRelatedMemories = memoryHelper.searchRelatedMemories;

    searchMemoriesByKeywordsSpy = spyOn(
      MemoryService,
      'searchMemoriesByKeywords',
    ).mockResolvedValue([]);
  });

  afterEach(() => {
    if (searchMemoriesByKeywordsSpy) {
      searchMemoriesByKeywordsSpy.mockRestore();
    }
    // 确保不会影响其他测试
    mock.restore();
  });

  test('应该返回空数组当 bookId 为空', async () => {
    const result = await searchRelatedMemories('', ['keyword']);
    expect(result).toEqual([]);
    expect(searchMemoriesByKeywordsSpy).not.toHaveBeenCalled();
  });

  test('应该返回空数组当 keywords 为空', async () => {
    const result = await searchRelatedMemories('book-1', []);
    expect(result).toEqual([]);
    expect(searchMemoriesByKeywordsSpy).not.toHaveBeenCalled();
  });

  test('应该返回空数组当 keywords 为 null', async () => {
    const result = await searchRelatedMemories('book-1', null as unknown as string[]);
    expect(result).toEqual([]);
    expect(searchMemoriesByKeywordsSpy).not.toHaveBeenCalled();
  });

  test('应该调用 MemoryService.searchMemoriesByKeywords 并返回简化的记忆', async () => {
    const mockMemories: Memory[] = [
      {
        id: 'memory-1',
        bookId: 'book-1',
        content: '完整内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      },
      {
        id: 'memory-2',
        bookId: 'book-1',
        content: '完整内容2',
        summary: '摘要2',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      },
      {
        id: 'memory-3',
        bookId: 'book-1',
        content: '完整内容3',
        summary: '摘要3',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
      },
    ];

    searchMemoriesByKeywordsSpy.mockResolvedValue(mockMemories);

    const result = await searchRelatedMemories('book-1', ['keyword1', 'keyword2']);

    expect(searchMemoriesByKeywordsSpy).toHaveBeenCalledWith('book-1', ['keyword1', 'keyword2']);
    expect(result).toEqual([
      { id: 'memory-1', summary: '摘要1' },
      { id: 'memory-2', summary: '摘要2' },
      { id: 'memory-3', summary: '摘要3' },
    ]);
    // 验证不包含 content
    expect(result[0]).not.toHaveProperty('content');
  });

  test('应该限制返回数量为 limit', async () => {
    const mockMemories: Memory[] = Array.from({ length: 10 }, (_, i) => ({
      id: `memory-${i}`,
      bookId: 'book-1',
      content: `完整内容${i}`,
      summary: `摘要${i}`,
      attachedTo: [{ type: 'book', id: 'book-1' }],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }));

    searchMemoriesByKeywordsSpy.mockResolvedValue(mockMemories);

    const result = await searchRelatedMemories('book-1', ['keyword'], 5);

    expect(result).toHaveLength(5);
    expect(result[0]).toEqual({ id: 'memory-0', summary: '摘要0' });
    expect(result[4]).toEqual({ id: 'memory-4', summary: '摘要4' });
  });

  test('应该使用默认 limit 为 5', async () => {
    const mockMemories: Memory[] = Array.from({ length: 10 }, (_, i) => ({
      id: `memory-${i}`,
      bookId: 'book-1',
      content: `完整内容${i}`,
      summary: `摘要${i}`,
      attachedTo: [{ type: 'book', id: 'book-1' }],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }));

    searchMemoriesByKeywordsSpy.mockResolvedValue(mockMemories);

    const result = await searchRelatedMemories('book-1', ['keyword']);

    expect(result).toHaveLength(5);
  });

  test('应该静默处理错误并返回空数组', async () => {
    const consoleWarnSpy = spyOn(console, 'warn').mockImplementation(() => {});
    searchMemoriesByKeywordsSpy.mockRejectedValue(new Error('Database error'));

    const result = await searchRelatedMemories('book-1', ['keyword']);

    expect(result).toEqual([]);
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      'Failed to search related memories:',
      expect.any(Error),
    );
    consoleWarnSpy.mockRestore();
  });

  test('应该只返回 id 和 summary，不返回其他字段', async () => {
    const mockMemories: Memory[] = [
      {
        id: 'memory-1',
        bookId: 'book-1',
        content: '完整内容',
        summary: '摘要',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: 1234567890,
        lastAccessedAt: 1234567890,
      },
    ];

    searchMemoriesByKeywordsSpy.mockResolvedValue(mockMemories);

    const result = await searchRelatedMemories('book-1', ['keyword']);

    expect(result[0]).toEqual({
      id: 'memory-1',
      summary: '摘要',
    });
    expect(result[0]).not.toHaveProperty('content');
    expect(result[0]).not.toHaveProperty('bookId');
    expect(result[0]).not.toHaveProperty('createdAt');
    expect(result[0]).not.toHaveProperty('lastAccessedAt');
  });
});

describe('searchRelatedMemoriesHybrid', () => {
  let searchMemoriesByKeywordsSpy: ReturnType<typeof spyOn>;
  let getMemoriesByAttachmentsSpy: ReturnType<typeof spyOn>;

  beforeEach(async () => {
    mock.restore();

    const memoryHelper = await import('../services/ai/tools/memory-helper');
    searchRelatedMemoriesHybrid = memoryHelper.searchRelatedMemoriesHybrid;

    searchMemoriesByKeywordsSpy = spyOn(
      MemoryService,
      'searchMemoriesByKeywords',
    ).mockResolvedValue([]);
    getMemoriesByAttachmentsSpy = spyOn(
      MemoryService,
      'getMemoriesByAttachments',
    ).mockResolvedValue([]);
  });

  afterEach(() => {
    if (searchMemoriesByKeywordsSpy) {
      searchMemoriesByKeywordsSpy.mockRestore();
    }
    if (getMemoriesByAttachmentsSpy) {
      getMemoriesByAttachmentsSpy.mockRestore();
    }
    mock.restore();
  });

  test('附件优先，关键词补充，去重并保持顺序', async () => {
    const attachedMemories: Memory[] = [
      {
        id: 'm1',
        bookId: 'book-1',
        content: '内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'character', id: 'char-1' }],
        createdAt: 1,
        lastAccessedAt: 1,
      },
      {
        id: 'm2',
        bookId: 'book-1',
        content: '内容2',
        summary: '摘要2',
        attachedTo: [{ type: 'character', id: 'char-1' }],
        createdAt: 2,
        lastAccessedAt: 2,
      },
    ];
    const keywordMemories: Memory[] = [
      {
        id: 'm2',
        bookId: 'book-1',
        content: '内容2',
        summary: '摘要2',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: 2,
        lastAccessedAt: 2,
      },
      {
        id: 'm3',
        bookId: 'book-1',
        content: '内容3',
        summary: '摘要3',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: 3,
        lastAccessedAt: 3,
      },
    ];

    getMemoriesByAttachmentsSpy.mockResolvedValue(attachedMemories);
    searchMemoriesByKeywordsSpy.mockResolvedValue(keywordMemories);

    const result = await searchRelatedMemoriesHybrid(
      'book-1',
      [{ type: 'character', id: 'char-1' }],
      ['角色名'],
      5,
    );

    expect(result).toEqual([
      { id: 'm1', summary: '摘要1' },
      { id: 'm2', summary: '摘要2' },
      { id: 'm3', summary: '摘要3' },
    ]);
  });

  test('仅关键词时仍可查询', async () => {
    const keywordMemories: Memory[] = [
      {
        id: 'm1',
        bookId: 'book-1',
        content: '内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'book', id: 'book-1' }],
        createdAt: 1,
        lastAccessedAt: 1,
      },
    ];

    searchMemoriesByKeywordsSpy.mockResolvedValue(keywordMemories);

    const result = await searchRelatedMemoriesHybrid('book-1', [], ['关键词'], 5);

    expect(getMemoriesByAttachmentsSpy).not.toHaveBeenCalled();
    expect(searchMemoriesByKeywordsSpy).toHaveBeenCalledWith('book-1', ['关键词']);
    expect(result).toEqual([{ id: 'm1', summary: '摘要1' }]);
  });
});
