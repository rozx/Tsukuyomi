import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Chapter, Paragraph } from 'src/models/novel';
import {
  InvalidSearchPatternError,
  countKeywordOccurrences,
  searchParagraphs,
} from 'src/services/library-query/paragraph-scan';
import { useBooksStore } from 'src/stores/books';
import { useSettingsStore } from 'src/stores/settings';

function paragraph(id: string, text: string, translation?: string): Paragraph {
  return translation === undefined
    ? { id, text, selectedTranslationId: '', translations: [] }
    : {
        id,
        text,
        selectedTranslationId: `tr-${id}`,
        translations: [{ id: `tr-${id}`, translation, aiModelId: 'm', language: 'zh-CN' }],
      };
}
function chapter(id: string, content: Paragraph[], extra: Partial<Chapter> = {}): Chapter {
  const now = new Date(0);
  return {
    id,
    title: { original: id, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    content,
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
    ...extra,
  };
}

const chapters = [
  chapter('ch-1', [
    paragraph('p1', 'アリスは月光石を拾った。Moon', '爱丽丝捡起了月光石。'),
    paragraph('p2', '月光石は淡く光っている。月光石だ。', '月光石发着微光。是月光石。'),
    paragraph('p3', '風が吹いた。'),
  ]),
  // 同步导入的章节会同时保留原始抓取文本，统计时不能把它再算一遍
  chapter('ch-2', [paragraph('p4', '塔の上にも月光石があった。', '塔顶也有月光石。')], {
    originalContent: '塔の上にも月光石があった。',
  }),
];

describe('段落扫描（站内工具与外部工具共用）', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
  });

  it('搜索：按顺序返回命中的段落及所在章节，可限定原文或译文', async () => {
    const both = await searchParagraphs(chapters, 'zh-CN', {
      query: '月光石',
      searchIn: 'both',
      limit: 10,
      offset: 0,
    });
    expect(both.hits.map((hit) => [hit.chapter.id, hit.index, hit.paragraph.id])).toEqual([
      ['ch-1', 0, 'p1'],
      ['ch-1', 1, 'p2'],
      ['ch-2', 0, 'p4'],
    ]);
    expect(both.hasMore).toBe(false);

    const translation = await searchParagraphs(chapters, 'zh-CN', {
      query: '爱丽丝',
      searchIn: 'translation',
      limit: 10,
      offset: 0,
    });
    expect(translation.hits.map((hit) => hit.paragraph.id)).toEqual(['p1']);
    expect(translation.hits[0]?.translation).toBe('爱丽丝捡起了月光石。');
  });

  it('搜索：超过上限时说明还有更多，offset 跳过已取的命中', async () => {
    const first = await searchParagraphs(chapters, 'zh-CN', {
      query: '月光石',
      searchIn: 'both',
      limit: 2,
      offset: 0,
    });
    expect(first.hits.map((hit) => hit.paragraph.id)).toEqual(['p1', 'p2']);
    expect(first.hasMore).toBe(true);
    const rest = await searchParagraphs(chapters, 'zh-CN', {
      query: '月光石',
      searchIn: 'both',
      limit: 2,
      offset: 2,
    });
    expect(rest.hits.map((hit) => hit.paragraph.id)).toEqual(['p4']);
    expect(rest.hasMore).toBe(false);
  });

  it('搜索：支持正则、大小写与模糊；正则写错时抛出可识别的错误', async () => {
    const run = (query: string, options: Record<string, unknown> = {}) =>
      searchParagraphs(chapters, 'zh-CN', {
        query,
        searchIn: 'original',
        limit: 10,
        offset: 0,
        ...options,
      }).then((result) => result.hits.map((hit) => hit.paragraph.id));

    expect(await run('^風', { regex: true })).toEqual(['p3']);
    expect(await run('moon')).toEqual(['p1']);
    expect(await run('moon', { caseSensitive: true })).toEqual([]);
    expect(await run('アリスは月光岩を')).toEqual([]);
    expect(await run('アリスは月光岩を', { fuzzy: true })).toEqual(['p1']);
    await expect(run('(未闭合', { regex: true })).rejects.toBeInstanceOf(InvalidSearchPatternError);
  });

  it('词频：一次扫描统计多个关键词，给出总数、段落数与章节分布', async () => {
    const [stone, alice, none] = await countKeywordOccurrences(chapters, 'zh-CN', {
      keywords: ['月光石', 'アリス', '不存在'],
      searchIn: 'original',
    });
    expect(stone).toMatchObject({ keyword: '月光石', totalCount: 4, paragraphCount: 3 });
    // 带有原始抓取文本的章节只按段落统计一次
    expect(stone?.chapters.map((entry) => [entry.chapter.id, entry.count])).toEqual([
      ['ch-1', 3],
      ['ch-2', 1],
    ]);
    expect(alice).toMatchObject({ totalCount: 1, paragraphCount: 1 });
    expect(none).toMatchObject({ totalCount: 0, paragraphCount: 0, chapters: [] });
  });

  it('词频：可统计译文、区分大小写；模糊统计每个命中段落计一次', async () => {
    const [translated] = await countKeywordOccurrences(chapters, 'zh-CN', {
      keywords: ['月光石'],
      searchIn: 'translation',
    });
    expect(translated?.totalCount).toBe(4);

    const [insensitive] = await countKeywordOccurrences(chapters, 'zh-CN', {
      keywords: ['moon'],
      searchIn: 'original',
    });
    expect(insensitive?.totalCount).toBe(1);
    const [sensitive] = await countKeywordOccurrences(chapters, 'zh-CN', {
      keywords: ['moon'],
      searchIn: 'original',
      caseSensitive: true,
    });
    expect(sensitive?.totalCount).toBe(0);

    const [fuzzy] = await countKeywordOccurrences(chapters, 'zh-CN', {
      keywords: ['月光岩を拾った'],
      searchIn: 'original',
      fuzzy: true,
    });
    expect(fuzzy).toMatchObject({ totalCount: 1, paragraphCount: 1 });
  });
});
