import './setup';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import {
  collectChunkEntities,
  collectPreviousChapterTail,
  collectRecentChapterTitles,
  collectTranslatedBefore,
  listChaptersBefore,
} from 'src/services/library-query/chunk-context';
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
function chapter(id: string, title: string, translated: string, content: Paragraph[]): Chapter {
  const now = new Date(0);
  return {
    id,
    title: {
      original: title,
      translation: { id: `t-${id}`, translation: translated, aiModelId: '' },
    },
    content,
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
  };
}

const chapters = [
  chapter('c1', '１話', '１话', [paragraph('a1', '一。', '一。')]),
  chapter('c2', '２話', '', [paragraph('b1', '二。')]),
  chapter('c3', '３話', '３话', [
    paragraph('d1', '最初。', '开头。'),
    paragraph('d2', ''),
    paragraph('d3', '未訳。'),
    paragraph('d4', '「また明日」', '「明天见」'),
    paragraph('d5', '---', '---'),
  ]),
  chapter('c4', '４話', '', [paragraph('e1', '朝。')]),
];
const book: Pick<Novel, 'volumes' | 'terminologies' | 'characterSettings'> = {
  volumes: [
    { id: 'v1', title: '', chapters: chapters.slice(0, 2) },
    { id: 'v2', title: '', chapters: chapters.slice(2) },
  ],
  terminologies: [
    { id: 't1', name: '月光石', translation: { id: 'x', translation: '月光石', aiModelId: '' } },
    {
      id: 't2',
      name: 'エロ聖女',
      translation: { id: 'y', translation: '色情圣女', aiModelId: '' },
    },
  ],
  characterSettings: [
    {
      id: 'ch1',
      name: '月岡 優',
      sex: undefined,
      translation: { id: 'z', translation: '月冈优', aiModelId: '' },
      aliases: [],
    },
  ],
};

describe('翻译块上下文（站内翻译与外部工具共用）', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
  });

  it('找出原文涉及的术语与角色：确切命中与「可能相关」分开', () => {
    const entities = collectChunkEntities(book, '優さんは月光石を持つエロ性女に会った。');
    expect(entities.terms.map((term) => term.name)).toEqual(['月光石']);
    expect(entities.characters.map((char) => char.name)).toEqual(['月岡 優']);
    expect(entities.nearTerms.map((match) => [match.item.name, match.matchedText])).toEqual([
      ['エロ聖女', 'エロ性女'],
    ]);
    expect(entities.nearCharacters).toEqual([]);
  });

  it('取某处之前的已译段落：跳过空段落、未译段落和只有符号的段落，保持阅读顺序', () => {
    const paragraphs = chapters[2]!.content!;
    expect(
      collectTranslatedBefore(paragraphs, paragraphs.length, 3, 'zh-CN').map((p) => [
        p.index,
        p.id,
        p.translation,
      ]),
    ).toEqual([
      [0, 'd1', '开头。'],
      [3, 'd4', '「明天见」'],
    ]);
    expect(collectTranslatedBefore(paragraphs, 3, 3, 'zh-CN').map((p) => p.id)).toEqual(['d1']);
    expect(collectTranslatedBefore(paragraphs, paragraphs.length, 0, 'zh-CN')).toEqual([]);
  });

  it('跨卷按顺序找出之前的章节，并取最近几章已有译名的标题', () => {
    const before = listChaptersBefore(book, 'c4');
    expect(before.map((ch) => ch.id)).toEqual(['c1', 'c2', 'c3']);
    expect(listChaptersBefore(book, 'c1')).toEqual([]);
    expect(listChaptersBefore(book, 'missing')).toEqual([]);
    // 没有译名的标题不作为格式参考
    expect(
      collectRecentChapterTitles(before, 'zh-CN').map((title) => [
        title.original,
        title.translation,
      ]),
    ).toEqual([
      ['１話', '１话'],
      ['３話', '３话'],
    ]);
  });

  it('上一章末尾的已译段落；上一章不存在、没有译文或条数为 0 时为空', async () => {
    const tail = await collectPreviousChapterTail(chapters[2], 1, 'zh-CN');
    expect(tail?.title).toMatchObject({ original: '３話', translation: '３话' });
    expect(tail?.paragraphs.map((p) => p.id)).toEqual(['d4']);
    expect(await collectPreviousChapterTail(chapters[1], 3, 'zh-CN')).toBeNull();
    expect(await collectPreviousChapterTail(undefined, 3, 'zh-CN')).toBeNull();
    expect(await collectPreviousChapterTail(chapters[2], 0, 'zh-CN')).toBeNull();
  });
});
