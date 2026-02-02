import './setup';
import { describe, test, expect, beforeEach, mock } from 'bun:test';
import type { Novel } from 'src/models/novel';
import type { Memory } from 'src/models/memory';

const mockBooksStore = {
  getBookById: mock((_id: string): Novel | undefined => undefined),
};

const mockGetMemoriesByAttachments = mock(
  (_bookId: string, _attachments: Array<{ type: string; id: string }>): Promise<Memory[]> =>
    Promise.resolve([]),
);

const mockFindUniqueTermsInText = mock<() => any[]>(() => []);
const mockFindUniqueCharactersInText = mock<() => any[]>(() => []);

await mock.module('src/stores/books', () => ({
  useBooksStore: () => mockBooksStore,
}));

await mock.module('src/services/memory-service', () => ({
  MemoryService: {
    getMemoriesByAttachments: mockGetMemoriesByAttachments,
  },
}));

await mock.module('src/utils/text-matcher', () => ({
  findUniqueTermsInText: mockFindUniqueTermsInText,
  findUniqueCharactersInText: mockFindUniqueCharactersInText,
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
    mockGetMemoriesByAttachments.mockReset();
    mockGetMemoriesByAttachments.mockResolvedValue([]);
    mockFindUniqueTermsInText.mockReset();
    mockFindUniqueTermsInText.mockReturnValue([]);
    mockFindUniqueCharactersInText.mockReset();
    mockFindUniqueCharactersInText.mockReturnValue([]);
  });

  test('缺少 bookId 或 chunkText 时返回空字符串', async () => {
    expect(await getRelatedMemoriesForChunk('', '内容')).toBe('');
    expect(await getRelatedMemoriesForChunk(bookId, '')).toBe('');
  });

  test('未找到书籍时返回空字符串', async () => {
    mockBooksStore.getBookById.mockReturnValue(undefined);

    const result = await getRelatedMemoriesForChunk(bookId, '内容');

    expect(result).toBe('');
    expect(mockGetMemoriesByAttachments).not.toHaveBeenCalled();
  });

  test('未提取到实体时返回空字符串', async () => {
    const result = await getRelatedMemoriesForChunk(bookId, '内容');

    expect(result).toBe('');
    expect(mockGetMemoriesByAttachments).not.toHaveBeenCalled();
  });

  test('有记忆时输出格式正确并包含省略提示', async () => {
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
      {
        id: 'm2',
        bookId,
        content: '内容2',
        summary: '摘要2',
        attachedTo: [{ type: 'character', id: 'char-1' }],
        createdAt: 1001,
        lastAccessedAt: 2000,
      },
      {
        id: 'm3',
        bookId,
        content: '内容3',
        summary: '摘要3',
        attachedTo: [{ type: 'term', id: 'term-1' }],
        createdAt: 1002,
        lastAccessedAt: 1000,
      },
    ];

    mockGetMemoriesByAttachments.mockResolvedValue(memories);

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 2);

    expect(result).toContain('【相关记忆】');
    expect(result).toContain('  - 摘要1');
    expect(result).toContain('  - 摘要2');
    expect(result).toContain('还有 1 条记忆未显示');
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

    mockGetMemoriesByAttachments.mockResolvedValue(memories);

    const result = await getRelatedMemoriesForChunk(bookId, '内容', 10);

    const occurrences = result.split('摘要1').length - 1;
    expect(occurrences).toBe(1);
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
    mockGetMemoriesByAttachments.mockReset();
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

    mockGetMemoriesByAttachments.mockResolvedValue([
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
    expect(prompt).toContain('  - 摘要1');
  });
});
