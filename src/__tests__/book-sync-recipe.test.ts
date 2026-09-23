import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import './setup';
import { resolveRecipe } from '../services/book-sync/recipe';
import { serializeBookRecord } from '../services/library-persistence';
import { deserializeDates } from '../utils/serialize-dates';
import type { Novel } from '../models/novel';

const book = (url?: string): Novel => ({
  id: 'book',
  title: '作品',
  createdAt: new Date(0),
  lastEdited: new Date(0),
  webUrl: url ? [url] : [],
});

describe('更新配方', () => {
  it.each([
    ['https://syosetu.org/novel/123/', 'syosetu-org'],
    ['https://kakuyomu.jp/works/123', 'kakuyomu'],
    ['https://ncode.syosetu.com/n1234ab/', 'ncode'],
    ['https://novel18.syosetu.com/n1234ab/', 'novel18'],
  ])('为 %s 推导虚拟配方且不改写书籍', (url, site) => {
    const original = book(url);
    expect(resolveRecipe(original)).toMatchObject({
      virtual: true,
      recipe: { version: 1, catalogUrls: [url], engine: { kind: 'builtin', site } },
    });
    expect(original.updateRecipe).toBeUndefined();
  });
  it('优先使用真实配方，序列化往返完整保留', () => {
    const original = book();
    original.updateRecipe = {
      version: 1,
      engine: { kind: 'html', content: { selector: 'article' } },
      catalogUrls: ['https://example.com/novel'],
      verifiedChapterCount: 1,
      recordedAt: 123,
      skippedUrls: [{ url: 'https://example.com/extra', title: '番外' }],
    };
    const saved = deserializeDates(serializeBookRecord(original));
    expect(saved.updateRecipe).toEqual(original.updateRecipe);
    expect(resolveRecipe(saved)).toEqual({ recipe: original.updateRecipe, virtual: false });
  });
  it.each([undefined, 'https://example.com/', 'https://ncode.syosetu.com.evil.test/n1234ab/'])(
    '无配方返回明确原因 %s',
    (url) => {
      expect(() => resolveRecipe(book(url))).toThrow('RECIPE_MISSING');
    },
  );
});
