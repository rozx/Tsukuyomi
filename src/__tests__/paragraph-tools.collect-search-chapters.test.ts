import { describe, expect, it } from 'vitest';
import { collectTranslationSearchChapters } from 'src/services/ai/tools/paragraph-tools';
import type { Novel, Chapter, Volume } from 'src/models/novel';

function makeBook(volumes?: Volume[]): Novel {
  return { id: 'b1', title: 'Book', lastEdited: new Date(0), createdAt: new Date(0), volumes };
}

// content !== undefined 视为「已加载」，会被跳过；undefined 表示尚未加载、需要收集
function ch(id: string, loaded = false): Chapter {
  return (loaded ? { id, content: { paragraphs: [] } } : { id }) as unknown as Chapter;
}

function vol(id: string, chapters?: Chapter[]): Volume {
  return { id, title: id, chapters };
}

describe('collectTranslationSearchChapters', () => {
  it('无 volumes 时返回空数组', () => {
    expect(collectTranslationSearchChapters(makeBook(), undefined, null, null)).toEqual([]);
  });

  it('未限定时收集全部未加载章节，跳过已加载章节', () => {
    const book = makeBook([vol('v0', [ch('c0'), ch('c1', true)]), vol('v1', [ch('c2')])]);
    const res = collectTranslationSearchChapters(book, undefined, null, null);
    expect(res.map((r) => r.chapter.id)).toEqual(['c0', 'c2']);
    expect(res[0]).toMatchObject({ vIndex: 0, cIndex: 0 });
    expect(res[1]).toMatchObject({ vIndex: 1, cIndex: 0 });
  });

  it('限定到具体卷+章时只收集该章', () => {
    const book = makeBook([
      vol('v0', [ch('c0'), ch('c1')]),
      vol('v1', [ch('c2'), ch('c3')]),
    ]);
    const res = collectTranslationSearchChapters(book, 'c3', 1, 1);
    expect(res.map((r) => r.chapter.id)).toEqual(['c3']);
    expect(res[0]).toMatchObject({ vIndex: 1, cIndex: 1 });
  });

  it('跳过没有 chapters 的卷', () => {
    const book = makeBook([vol('v0'), vol('v1', [ch('c0')])]);
    const res = collectTranslationSearchChapters(book, undefined, null, null);
    expect(res.map((r) => r.chapter.id)).toEqual(['c0']);
  });
});
