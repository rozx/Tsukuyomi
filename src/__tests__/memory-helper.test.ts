import './setup'; // 导入测试环境设置（IndexedDB polyfill等）
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { Memory, MemoryAttachment } from '../models/memory';
import { MemoryService } from 'src/services/memory-service';
import {
  searchRelatedMemories,
  searchRelatedMemoriesHybrid,
} from 'src/services/ai/tools/memory-helper';

// 模拟 MemoryService
let mockSearchMemoriesByKeywords: ReturnType<typeof mock>;
let mockGetMemoriesByAttachments: ReturnType<typeof mock>;

describe('searchRelatedMemories', () => {
  beforeEach(() => {
    // 创建 mock 函数
    mockSearchMemoriesByKeywords = mock(() => Promise.resolve([]));
    mockGetMemoriesByAttachments = mock(() => Promise.resolve([]));

    spyOn(MemoryService, 'searchMemoriesByKeywords').mockImplementation(
      mockSearchMemoriesByKeywords as typeof MemoryService.searchMemoriesByKeywords,
    );
    spyOn(MemoryService, 'getMemoriesByAttachments').mockImplementation(
      mockGetMemoriesByAttachments as typeof MemoryService.getMemoriesByAttachments,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('应该返回空数组当 bookId 为空', async () => {
    const result = await searchRelatedMemories('', ['keyword']);
    expect(result).toEqual([]);
    expect(mockSearchMemoriesByKeywords).not.toHaveBeenCalled();
  });

  test('应该返回空数组当 keywords 为空', async () => {
    const result = await searchRelatedMemories('book-1', []);
    expect(result).toEqual([]);
    expect(mockSearchMemoriesByKeywords).not.toHaveBeenCalled();
  });

  test('应该返回空数组当 keywords 为 null', async () => {
    const result = await searchRelatedMemories('book-1', null as unknown as string[]);
    expect(result).toEqual([]);
    expect(mockSearchMemoriesByKeywords).not.toHaveBeenCalled();
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

    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(mockMemories));

    const result = await searchRelatedMemories('book-1', ['keyword1', 'keyword2']);

    expect(mockSearchMemoriesByKeywords).toHaveBeenCalledWith('book-1', ['keyword1', 'keyword2']);
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
      attachedTo: [{ type: 'book' as const, id: 'book-1' }],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }));

    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(mockMemories));

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
      attachedTo: [{ type: 'book' as const, id: 'book-1' }],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
    }));

    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(mockMemories));

    const result = await searchRelatedMemories('book-1', ['keyword']);

    expect(result).toHaveLength(5);
  });

  test('应该静默处理错误并返回空数组', async () => {
    const originalWarn = console.warn;
    const warnCalls: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warnCalls.push(args);
    };

    mockSearchMemoriesByKeywords.mockImplementation(() =>
      Promise.reject(new Error('Database error')),
    );

    const result = await searchRelatedMemories('book-1', ['keyword']);

    expect(result).toEqual([]);
    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls[0]?.[0]).toBe('Failed to search related memories:');

    console.warn = originalWarn;
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

    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(mockMemories));

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
  beforeEach(() => {
    // 创建 mock 函数
    mockSearchMemoriesByKeywords = mock(() => Promise.resolve([]));
    mockGetMemoriesByAttachments = mock(() => Promise.resolve([]));

    spyOn(MemoryService, 'searchMemoriesByKeywords').mockImplementation(
      mockSearchMemoriesByKeywords as typeof MemoryService.searchMemoriesByKeywords,
    );
    spyOn(MemoryService, 'getMemoriesByAttachments').mockImplementation(
      mockGetMemoriesByAttachments as typeof MemoryService.getMemoriesByAttachments,
    );
  });

  afterEach(() => {
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

    mockGetMemoriesByAttachments.mockImplementation(() => Promise.resolve(attachedMemories));
    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(keywordMemories));

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

    mockSearchMemoriesByKeywords.mockImplementation(() => Promise.resolve(keywordMemories));

    const result = await searchRelatedMemoriesHybrid('book-1', [], ['关键词'], 5);

    expect(mockGetMemoriesByAttachments).not.toHaveBeenCalled();
    expect(mockSearchMemoriesByKeywords).toHaveBeenCalledWith('book-1', ['关键词']);
    expect(result).toEqual([{ id: 'm1', summary: '摘要1' }]);
  });
});
