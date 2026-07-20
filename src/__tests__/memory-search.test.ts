import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import './setup';
import type { Memory } from '../models/memory';
import { EmbeddingService } from '../services/embedding-service';
import { MemoryService } from '../services/memory-service';

function makeMemory(overrides: Partial<Memory>): Memory {
  return {
    id: 'memory-id',
    bookId: 'book-search',
    content: '',
    summary: '',
    createdAt: 1,
    lastAccessedAt: 1,
    ...overrides,
  };
}

describe('MemoryService - 生产记忆搜索', () => {
  afterEach(() => {
    mock.restore();
  });

  test('语义服务未就绪时走同一关键词评分，旧的精准记忆胜过新的弱匹配', async () => {
    const now = Date.now();
    const memories = [
      makeMemory({ id: 'exact-old', summary: '芬恩敬语规则', lastAccessedAt: 1 }),
      makeMemory({
        id: 'partial-new',
        summary: '芬恩的其他设定',
        createdAt: now,
        lastAccessedAt: now,
      }),
      makeMemory({
        id: 'unrelated-new',
        summary: '王都地理资料',
        createdAt: now,
        lastAccessedAt: now,
      }),
    ];
    spyOn(MemoryService, 'getAllBookMemories').mockResolvedValue(memories);
    spyOn(EmbeddingService, 'isReady').mockReturnValue(false);

    const result = await MemoryService.searchMemoriesWithScores('book-search', '芬恩敬语规则', 5);

    expect(result[0]!.memory.id).toBe('exact-old');
    expect(result[0]!.breakdown.recencyWeighted).toBeLessThan(0.001);
    expect(result.some((item) => item.memory.id === 'unrelated-new')).toBe(false);
  });
});
