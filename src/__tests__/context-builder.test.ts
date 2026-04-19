 
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
      makeMemory('low', {
        summary: '小明和明くん的魔法日常',
        lastAccessedAt: Date.now() - 3600_000,
      }),
      makeMemory('high', {
        summary: '小明和明くん的魔法日常',
        lastAccessedAt: Date.now(),
      }),
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

    expect(result).toContain('[high]');
    expect(result).toContain('[low]');
    // 更近期的记忆得分更高
    const highPos = result.indexOf('[high]');
    const lowPos = result.indexOf('[low]');
    expect(highPos).toBeLessThan(lowPos);
  });

  test('所有记忆低于 minScore 时严格返回空(不做 LRU 兜底)', async () => {
    // 严格阈值策略:minScore 以下的记忆一律不注入,UI 和翻译侧都会看到空结果。
    // 这是刻意的 — 让"无足够相关记忆"成为一个清晰信号,而不是用低分噪声凑数。
    const veryOldMemory = makeMemory('old', {
      summary: '完全无关的远古记忆',
      lastAccessedAt: 100,
      createdAt: 100,
    });
    const recentMemory = makeMemory('recent', {
      summary: '近期但也无关的记忆',
      lastAccessedAt: Date.now(),
    });
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue([
      veryOldMemory,
      recentMemory,
    ]);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const result = await getRelatedMemoriesForChunk(
      'book-1',
      '某个不相关的文本',
      10,
      undefined,
      [],
      [],
    );

    // 两条 memory 的 chunkEntities 都为空,keyword=0,recency ≈ 1 / ≈ 0
    // total = 0 × 0.6 + 0 × 0.3 + recency × 0.1 ≤ 0.1,远低于 0.38 minScore → 全部过滤
    expect(result).toBe('');
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
      makeMemory('m1', { summary: '小明和明くん的魔法冒险', lastAccessedAt: Date.now() }),
    ];
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    await getRelatedMemoriesForChunk('book-1', '小明使用魔法', 10, undefined, terms, characters);

    const breakdowns = getLastScoreBreakdowns('book-1');
    expect(breakdowns).toBeDefined();
    expect(breakdowns!['m1']).toBeDefined();
    expect(breakdowns!['m1']!.total).toBeGreaterThan(0);
    expect(typeof breakdowns!['m1']!.keyword).toBe('number');
    expect(typeof breakdowns!['m1']!.recency).toBe('number');
  });

  test('字符预算控制:超出预算的记忆不被选中', async () => {
    const memories = Array.from({ length: 30 }, (_, i) =>
      makeMemory(`m${i}`, {
        summary: `小明和明くん的魔法${'x'.repeat(85)}`,
        lastAccessedAt: Date.now(),
      }),
    );
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const result = await getRelatedMemoriesForChunk('book-1', '小明使用魔法', 50, undefined, terms, characters);

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
