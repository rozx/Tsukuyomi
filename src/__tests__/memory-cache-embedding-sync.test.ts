import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import type { Memory } from 'src/models/memory';
import {
  bookMemoryCache,
  buildMemoryCacheKey,
  memoryCache,
  syncMemoryEmbeddingCaches,
} from 'src/services/memory-cache';

function makeMemory(content: string): Memory {
  return { id: 'm1', bookId: 'b1', content, summary: '摘要', createdAt: 1, lastAccessedAt: 1 };
}

describe('syncMemoryEmbeddingCaches 内容校验', () => {
  afterEach(() => {
    memoryCache.clear();
    bookMemoryCache.clear();
  });

  it('缓存中的记忆内容已变化时不写入按旧内容计算的向量', () => {
    memoryCache.set(buildMemoryCacheKey('b1', 'm1'), makeMemory('新正文'));
    bookMemoryCache.set('b1', { data: [makeMemory('新正文')], expiresAt: Date.now() + 60_000 });

    syncMemoryEmbeddingCaches('b1', 'm1', [[1, 0]], 'model-v', {
      content: '旧正文',
      summary: '摘要',
    });

    expect(memoryCache.get(buildMemoryCacheKey('b1', 'm1'))?.embeddings).toBeUndefined();
    expect(bookMemoryCache.get('b1')?.data[0]?.embeddings).toBeUndefined();
  });

  it('缓存内容一致时写入向量', () => {
    memoryCache.set(buildMemoryCacheKey('b1', 'm1'), makeMemory('正文'));
    bookMemoryCache.set('b1', { data: [makeMemory('正文')], expiresAt: Date.now() + 60_000 });

    syncMemoryEmbeddingCaches('b1', 'm1', [[1, 0]], 'model-v', {
      content: '正文',
      summary: '摘要',
    });

    expect(memoryCache.get(buildMemoryCacheKey('b1', 'm1'))?.embeddingModel).toBe('model-v');
    expect(bookMemoryCache.get('b1')?.data[0]?.embeddingModel).toBe('model-v');
  });
});
