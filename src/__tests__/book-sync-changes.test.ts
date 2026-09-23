import { expect } from 'vitest';
import { describe, it } from 'bun:test';
import './setup';
import type { Chapter, Novel } from '../models/novel';
import { compareChapter, inferNewChapters, sameChapterText } from '../services/book-sync/changes';
const date = new Date(0);
const chapter: Chapter = {
  id: 'c',
  title: '第一话',
  webUrl: 'https://example.com/1',
  createdAt: date,
  lastEdited: date,
};
const book: Novel = {
  id: 'b',
  title: '书',
  createdAt: date,
  lastEdited: date,
  volumes: [{ id: 'v', title: 'AI卷名', chapters: [chapter] }],
};
const entry = { url: chapter.webUrl!, title: '第一话' };
const paragraph = (text: string, i: number) => ({
  id: `p${i}`,
  text,
  translations: [{ id: `t${i}`, translation: `译文${i}`, aiModelId: 'model' }],
  selectedTranslationId: `t${i}`,
});

describe('同步段落比对与归卷', () => {
  it('无 originalContent 时回退段落，比较去除首尾空白', async () => {
    const content = [paragraph('本文', 1)];
    expect(sameChapterText(chapter, content, [' 本文 '])).toBe(true);
    expect(await compareChapter(chapter, content, ['本文'], entry)).toBeUndefined();
  });
  it('只修改一个错字保留其余 79 段全部译文和选用', async () => {
    const content = Array.from({ length: 80 }, (_, i) => paragraph(`段落${i}`, i));
    const remote = content.map((p) => p.text);
    remote[29] = '修正后的段落29';
    const result = await compareChapter(chapter, content, remote, entry);
    expect(result).toMatchObject({ revised: 1, inserted: 0, removed: 0, clearedVersions: 1 });
    expect(result?.paragraphs.filter((p) => p.translations.length)).toHaveLength(79);
    expect(result?.paragraphs[30]).toEqual(content[30]);
    expect(result?.paragraphs[29]?.translations).toEqual([]);
  });
  it('重复句子无法确定来源时不转移译文，统计移除的全部版本', async () => {
    const result = await compareChapter(
      chapter,
      [paragraph('……', 1), paragraph('……', 2)],
      ['……'],
      entry,
    );
    expect(result).toMatchObject({ inserted: 1, removed: 2, clearedVersions: 2 });
    expect(result?.paragraphs[0]?.translations).toEqual([]);
  });
  it('归卷依照网址锚点和全目录分组，而非卷名', () => {
    const result = inferNewChapters(
      book,
      [
        { ...entry, group: '第一章' },
        { url: 'https://example.com/2', title: '第二话', group: '第一章' },
        { url: 'https://example.com/3', title: '第三话', group: '第二章' },
        { url: 'https://example.com/4', title: '第四话', group: '第二章' },
      ],
      [],
    );
    expect(result.map((e) => e.target)).toEqual([
      { volumeId: 'v' },
      { newTitle: '第二章' },
      { newTitle: '第二章' },
    ]);
    expect(result[1]?.groupKey).toBe(result[2]?.groupKey);
  });
  it('无分组时使用最后一卷，没有卷时新建正文卷，跳过项不参与新章节', () => {
    const extra = { url: 'https://example.com/2', title: '第二话' };
    expect(inferNewChapters(book, [extra], [])[0]?.target).toEqual({ volumeId: 'v' });
    expect(inferNewChapters(undefined, [extra], [])[0]?.target).toEqual({ newTitle: '正文' });
    expect(inferNewChapters(book, [extra], [extra.url])).toEqual([]);
  });
});
