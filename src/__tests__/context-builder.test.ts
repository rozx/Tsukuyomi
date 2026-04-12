/* eslint-disable @typescript-eslint/require-await */
import { describe, test, expect, beforeEach, afterEach, spyOn, mock } from 'bun:test';
import './setup';
import {
  getRelatedMemoriesForChunk,
  getRelatedMemoriesForChunkLegacy,
  clearChunkEmbeddingCache,
  clearLastScoreBreakdowns,
  getLastScoreBreakdowns,
} from 'src/services/ai/tasks/utils/context-builder';
import { MemoryService } from 'src/services/memory-service';
import { EmbeddingService } from 'src/services/embedding-service';
import type { Memory } from 'src/models/memory';
import type { Terminology, CharacterSetting } from 'src/models/novel';

function makeMemory(id: string, overrides: Partial<Memory> = {}): Memory {
  const mem: Memory = {
    id,
    bookId: overrides.bookId ?? 'book-1',
    content: overrides.content ?? `content-${id}`,
    summary: overrides.summary ?? `summary-${id}`,
    createdAt: overrides.createdAt ?? Date.now() - 10_000,
    lastAccessedAt: overrides.lastAccessedAt ?? Date.now(),
  };
  if (overrides.embedding !== undefined) mem.embedding = overrides.embedding;
  if (overrides.embeddingModel !== undefined) mem.embeddingModel = overrides.embeddingModel;
  return mem;
}

const terms: Terminology[] = [
  {
    name: '魔法',
    translation: { translation: 'magic', id: 't1' },
    id: 't1',
  } as unknown as Terminology,
];

const characters: CharacterSetting[] = [
  {
    name: '小明',
    translation: { translation: 'Xiao Ming', id: 'c1' },
    aliases: [{ name: '明くん', translation: { translation: 'Ming-kun', id: 'c1a' } }],
    id: 'c1',
  } as unknown as CharacterSetting,
];

describe('context-builder - getRelatedMemoriesForChunk (打分路径)', () => {
  beforeEach(() => {
    clearChunkEmbeddingCache();
    clearLastScoreBreakdowns();
  });

  afterEach(() => {
    mock.restore();
    clearChunkEmbeddingCache();
    clearLastScoreBreakdowns();
  });

  test('有关键词命中的记忆得分更高,排在前面', async () => {
    const memories = [
      makeMemory('irrelevant', { summary: '无关内容', lastAccessedAt: Date.now() }),
      makeMemory('hit', { summary: '小明使用魔法', lastAccessedAt: Date.now() - 100_000 }),
    ];
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const result = await getRelatedMemoriesForChunk(
      'book-1',
      '小明在学校使用魔法',
      10,
      undefined,
      terms,
      characters,
    );

    expect(result).toContain('[hit]');
    expect(result).toContain('[irrelevant]');
    // hit 应排在 irrelevant 之前(关键词命中)
    const hitPos = result.indexOf('[hit]');
    const irrelPos = result.indexOf('[irrelevant]');
    expect(hitPos).toBeLessThan(irrelPos);
  });

  test('所有记忆低于阈值时兜底 getRecentMemories', async () => {
    const veryOldMemory = makeMemory('old', {
      summary: '完全无关的远古记忆',
      lastAccessedAt: 100, // 极旧
      createdAt: 100,
    });
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue([veryOldMemory]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const fallbackMemory = makeMemory('fallback', {
      summary: '近期记忆',
      lastAccessedAt: Date.now(),
    });
    spyOn(MemoryService, 'getRecentMemories').mockResolvedValue([fallbackMemory]);

    const result = await getRelatedMemoriesForChunk(
      'book-1',
      '某个不相关的文本',
      10,
      undefined,
      [],
      [],
    );

    expect(result).toContain('[fallback]');
  });

  test('getAllBookMemories 抛异常时退回 legacy 路径', async () => {
    spyOn(MemoryService, 'getAllBookMemories').mockRejectedValue(new Error('db error'));
    const recentMems = [makeMemory('legacy', { summary: 'legacy mem' })];
    spyOn(MemoryService, 'getRecentMemories').mockResolvedValue(recentMems);

    const result = await getRelatedMemoriesForChunk('book-1', 'some text');

    expect(result).toContain('[legacy]');
  });

  test('空书籍 / 空文本返回空字符串', async () => {
    expect(await getRelatedMemoriesForChunk('', 'text')).toBe('');
    expect(await getRelatedMemoriesForChunk('book-1', '')).toBe('');
  });

  test('无记忆时返回空字符串', async () => {
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue([]);
    const result = await getRelatedMemoriesForChunk('book-1', 'some text');
    expect(result).toBe('');
  });

  test('选中记忆的 ScoreBreakdown 可通过 getLastScoreBreakdowns 获取', async () => {
    const memories = [
      makeMemory('m1', { summary: '小明', lastAccessedAt: Date.now() }),
    ];
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    await getRelatedMemoriesForChunk('book-1', '小明', 10, undefined, [], characters);

    const breakdowns = getLastScoreBreakdowns('book-1');
    expect(breakdowns).toBeDefined();
    expect(breakdowns!['m1']).toBeDefined();
    expect(breakdowns!['m1']!.total).toBeGreaterThan(0);
    expect(typeof breakdowns!['m1']!.keyword).toBe('number');
    expect(typeof breakdowns!['m1']!.recency).toBe('number');
  });

  test('字符预算控制:超出预算的记忆不被选中', async () => {
    // 创建 30 条记忆,每条 summary 100 字符(总计 3000 > 默认 2000 预算)
    const memories = Array.from({ length: 30 }, (_, i) =>
      makeMemory(`m${i}`, {
        summary: `小明${'x'.repeat(95)}`,
        lastAccessedAt: Date.now(),
      }),
    );
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const result = await getRelatedMemoriesForChunk('book-1', '小明', 50, undefined, [], characters);

    const matchCount = (result.match(/\[m\d+\]/g) || []).length;
    expect(matchCount).toBeLessThan(30);
    expect(matchCount).toBeGreaterThan(0);
  });
});

describe('context-builder - getRelatedMemoriesForChunkLegacy', () => {
  afterEach(() => {
    mock.restore();
  });

  test('返回格式化的记忆列表', async () => {
    const memories = [
      makeMemory('l1', { summary: 'sum1' }),
      makeMemory('l2', { summary: 'sum2' }),
    ];
    spyOn(MemoryService, 'getRecentMemories').mockResolvedValue(memories);

    const result = await getRelatedMemoriesForChunkLegacy('book-1', 'some text');

    expect(result).toContain('【相关记忆】');
    expect(result).toContain('[l1] sum1');
    expect(result).toContain('[l2] sum2');
  });

  test('无记忆时返回空', async () => {
    spyOn(MemoryService, 'getRecentMemories').mockResolvedValue([]);
    const result = await getRelatedMemoriesForChunkLegacy('book-1', 'text');
    expect(result).toBe('');
  });
});
