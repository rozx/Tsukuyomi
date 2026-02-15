import './setup';
import { describe, test, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';
import { MemoryService } from 'src/services/memory-service';
import * as TextMatcher from 'src/utils/text-matcher';

const mockBooksStore = {
  getBookById: mock((_id: string): Novel | undefined => undefined),
};

const mockGetMemoriesByAttachment = mock(
  (_bookId: string, _attachment: { type: string; id: string }): Promise<Memory[]> =>
    Promise.resolve([]),
);

const mockGetRecentMemories = mock(
  (
    _bookId: string,
    _limit: number,
    _sortBy: string,
    _updateAccessTime: boolean,
  ): Promise<Memory[]> => Promise.resolve([]),
);

const mockFindUniqueTermsInText = mock<() => any[]>(() => []);
const mockFindUniqueCharactersInText = mock<() => any[]>(() => []);

await mock.module('src/stores/books', () => ({
  useBooksStore: () => mockBooksStore,
}));

import {
  getRelatedMemoriesForChunk,
  buildIndependentChunkPrompt,
} from 'src/services/ai/tasks/utils';

describe('getRelatedMemoriesForChunk', () => {
  const bookId = 'book-1';

  const baseBook: Novel = {
    id: bookId,
    title: '测试书籍',
    lastEdited: new Date(),
    createdAt: new Date(),
    terminologies: [],
    characterSettings: [],
    volumes: [],
  };

  beforeEach(() => {
    mockBooksStore.getBookById.mockReset();
    mockBooksStore.getBookById.mockReturnValue(baseBook);
    mockGetMemoriesByAttachment.mockReset();
    mockGetMemoriesByAttachment.mockResolvedValue([]);
    mockGetRecentMemories.mockReset();
    mockGetRecentMemories.mockResolvedValue([]);
    mockFindUniqueTermsInText.mockReset();
    mockFindUniqueTermsInText.mockReturnValue([]);
    mockFindUniqueCharactersInText.mockReset();
    mockFindUniqueCharactersInText.mockReturnValue([]);

    spyOn(MemoryService, 'getMemoriesByAttachment').mockImplementation(
      mockGetMemoriesByAttachment as typeof MemoryService.getMemoriesByAttachment,
    );
    spyOn(MemoryService, 'getRecentMemories').mockImplementation(
      mockGetRecentMemories as unknown as typeof MemoryService.getRecentMemories,
    );
    spyOn(TextMatcher, 'findUniqueTermsInText').mockImplementation(
      mockFindUniqueTermsInText as unknown as typeof TextMatcher.findUniqueTermsInText,
    );
    spyOn(TextMatcher, 'findUniqueCharactersInText').mockImplementation(
      mockFindUniqueCharactersInText as unknown as typeof TextMatcher.findUniqueCharactersInText,
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('缺少 bookId 或 chunkText 时返回空字符串', async () => {
    expect(await getRelatedMemoriesForChunk('', '内容')).toBe('');
    expect(await getRelatedMemoriesForChunk(bookId, '')).toBe('');
  });

  test('未找到书籍时返回空字符串', async () => {
    mockBooksStore.getBookById.mockReturnValue(undefined);

    const result = await getRelatedMemoriesForChunk(bookId, '内容');

    expect(result).toBe('');
    expect(mockGetMemoriesByAttachment).not.toHaveBeenCalled();
  });

  test('未提取到实体时返回空字符串', async () => {
    const result = await getRelatedMemoriesForChunk(bookId, '内容');

    // 没有术语和角色时，仍然会尝试获取书籍级别和全局记忆
    // 但如果没有记忆，返回空字符串
    expect(result).toBe('');
  });

  test('有记忆时输出格式正确（包含记忆ID）', async () => {
    mockFindUniqueTermsInText.mockReturnValue([
      {
        id: 'term-1',
        name: '术语',
        translation: { id: 't-1', translation: '术语译文', aiModelId: 'model-1' },
      },
    ]);
    mockFindUniqueCharactersInText.mockReturnValue([
      {
        id: 'char-1',
        name: '角色',
        sex: undefined,
        description: '',
        speakingStyle: '',
        translation: { id: 'c-1', translation: '角色译文', aiModelId: 'model-1' },
        aliases: [],
      },
    ]);

    const termMemories: Memory[] = [
      {
        id: 'm1',
        bookId,
        content: '内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'term', id: 'term-1' }],
        createdAt: 1000,
        lastAccessedAt: 3000,
      },
    ];

    const charMemories: Memory[] = [
      {
        id: 'm2',
        bookId,
        content: '内容2',
        summary: '摘要2',
        attachedTo: [{ type: 'character', id: 'char-1' }],
        createdAt: 1001,
        lastAccessedAt: 2000,
      },
    ];

    // 根据附件类型返回不同的记忆
    mockGetMemoriesByAttachment.mockImplementation(
      (_bookId: string, attachment: { type: string; id: string }) => {
        if (attachment.type === 'term') return Promise.resolve(termMemories);
        if (attachment.type === 'character') return Promise.resolve(charMemories);
        return Promise.resolve([]);
      },
    );

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 10);

    expect(result).toContain('【相关记忆】');
    // 检查记忆 ID 是否包含在输出中
    expect(result).toContain('[m1]');
    expect(result).toContain('[m2]');
    expect(result).toContain('摘要1');
    expect(result).toContain('摘要2');
  });

  test('重复记忆只保留一条', async () => {
    mockFindUniqueTermsInText.mockReturnValue([
      {
        id: 'term-1',
        name: '术语',
        translation: { id: 't-1', translation: '术语译文', aiModelId: 'model-1' },
      },
    ]);

    const memories: Memory[] = [
      {
        id: 'm1',
        bookId,
        content: '内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'term', id: 'term-1' }],
        createdAt: 1000,
        lastAccessedAt: 3000,
      },
    ];

    mockGetMemoriesByAttachment.mockResolvedValue(memories);

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 10);

    const occurrences = result.split('摘要1').length - 1;
    expect(occurrences).toBe(1);
  });

  test('记忆数量不超过限制', async () => {
    mockFindUniqueTermsInText.mockReturnValue([
      {
        id: 'term-1',
        name: '术语',
        translation: { id: 't-1', translation: '术语译文', aiModelId: 'model-1' },
      },
    ]);

    const memories: Memory[] = Array.from({ length: 20 }, (_, i) => ({
      id: `m${i}`,
      bookId,
      content: `内容${i}`,
      summary: `摘要${i}`,
      attachedTo: [{ type: 'term', id: 'term-1' }] as Array<{ type: 'term'; id: string }>,
      createdAt: 1000 + i,
      lastAccessedAt: 3000 - i,
    }));

    mockGetMemoriesByAttachment.mockResolvedValue(memories);

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 5);

    // 检查结果中包含的记忆数量不超过 5
    const memoryLines = result.split('\n').filter((line) => line.includes('  - ['));
    expect(memoryLines.length).toBeLessThanOrEqual(5);
  });

  test('跨不同实体类型时去重', async () => {
    // 同一个记忆同时关联到角色和术语
    mockFindUniqueTermsInText.mockReturnValue([
      {
        id: 'term-1',
        name: '术语',
        translation: { id: 't-1', translation: '术语译文', aiModelId: 'model-1' },
      },
    ]);
    mockFindUniqueCharactersInText.mockReturnValue([
      {
        id: 'char-1',
        name: '角色',
        sex: undefined,
        description: '',
        speakingStyle: '',
        translation: { id: 'c-1', translation: '角色译文', aiModelId: 'model-1' },
        aliases: [],
      },
    ]);

    // 同一个记忆被角色和术语同时引用
    const sharedMemory: Memory = {
      id: 'shared-1',
      bookId,
      content: '共享内容',
      summary: '共享摘要',
      attachedTo: [
        { type: 'character', id: 'char-1' },
        { type: 'term', id: 'term-1' },
      ],
      createdAt: 1000,
      lastAccessedAt: 3000,
    };

    mockGetMemoriesByAttachment.mockImplementation(
      (_bookId: string, attachment: { type: string; id: string }) => {
        // 角色和术语都返回同一个记忆
        if (attachment.type === 'character' || attachment.type === 'term') {
          return Promise.resolve([sharedMemory]);
        }
        return Promise.resolve([]);
      },
    );

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 10);

    // 验证共享记忆只出现一次
    const occurrences = result.split('共享摘要').length - 1;
    expect(occurrences).toBe(1);
    // 验证记忆 ID 只出现一次
    const idOccurrences = result.split('[shared-1]').length - 1;
    expect(idOccurrences).toBe(1);
  });
});

describe('buildIndependentChunkPrompt', () => {
  const bookId = 'book-1';

  beforeEach(() => {
    mockBooksStore.getBookById.mockReturnValue({
      id: bookId,
      title: '测试书籍',
      lastEdited: new Date(),
      createdAt: new Date(),
      terminologies: [],
      characterSettings: [],
      volumes: [],
    } as Novel);
    mockFindUniqueTermsInText.mockReset();
    mockFindUniqueCharactersInText.mockReset();
    mockGetMemoriesByAttachment.mockReset();
    mockGetMemoriesByAttachment.mockResolvedValue([]);
    mockGetRecentMemories.mockReset();
    mockGetRecentMemories.mockResolvedValue([]);

    spyOn(MemoryService, 'getMemoriesByAttachment').mockImplementation(
      mockGetMemoriesByAttachment as typeof MemoryService.getMemoriesByAttachment,
    );
    spyOn(MemoryService, 'getRecentMemories').mockImplementation(
      mockGetRecentMemories as unknown as typeof MemoryService.getRecentMemories,
    );
    spyOn(TextMatcher, 'findUniqueTermsInText').mockImplementation(
      mockFindUniqueTermsInText as unknown as typeof TextMatcher.findUniqueTermsInText,
    );
    spyOn(TextMatcher, 'findUniqueCharactersInText').mockImplementation(
      mockFindUniqueCharactersInText as unknown as typeof TextMatcher.findUniqueCharactersInText,
    );
  });

  test('包含术语/角色时会插入相关记忆区块', async () => {
    mockFindUniqueTermsInText.mockReturnValue([
      {
        id: 'term-1',
        name: '术语',
        translation: { id: 't-1', translation: '术语译文', aiModelId: 'model-1' },
      },
    ]);
    mockFindUniqueCharactersInText.mockReturnValue([]);

    mockGetMemoriesByAttachment.mockResolvedValue([
      {
        id: 'm1',
        bookId,
        content: '内容1',
        summary: '摘要1',
        attachedTo: [{ type: 'term', id: 'term-1' }],
        createdAt: 1000,
        lastAccessedAt: 2000,
      },
    ]);

    const prompt = await buildIndependentChunkPrompt(
      'translation',
      0,
      1,
      '测试文本',
      '',
      '',
      undefined,
      undefined,
      bookId,
    );

    const termIndex = prompt.indexOf('【当前部分出现的术语和角色】');
    const memoryIndex = prompt.indexOf('【相关记忆】');

    expect(termIndex).toBeGreaterThanOrEqual(0);
    expect(memoryIndex).toBeGreaterThan(termIndex);
    // 检查记忆 ID 是否包含在输出中
    expect(prompt).toContain('[m1]');
    expect(prompt).toContain('摘要1');
  });
});
