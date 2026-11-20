import { describe, expect, it } from 'vitest';
import { fuzzyMatchIndexes, matchByKeywords } from 'src/services/library-query/keyword-match';

interface Entry {
  id: string;
  name: string;
  translation: string;
}
const entries: Entry[] = [
  { id: 'saint', name: 'エロ聖女', translation: '色情圣女' },
  { id: 'order', name: '聖銀騎士団', translation: '圣银骑士团' },
  { id: 'alice', name: 'Alice', translation: '爱丽丝' },
];
const texts = (entry: Entry) => [entry.name, entry.translation];
const ids = (matched: Entry[]) => matched.map((entry) => entry.id);

describe('关键词匹配（站内工具与外部工具共用）', () => {
  it('精确匹配：不区分大小写的子串，任一关键词命中即算，保持原有顺序', () => {
    expect(ids(matchByKeywords(entries, texts, ['聖']))).toEqual(['saint', 'order']);
    expect(ids(matchByKeywords(entries, texts, ['alice']))).toEqual(['alice']);
    expect(ids(matchByKeywords(entries, texts, ['爱丽丝', '骑士']))).toEqual(['order', 'alice']);
    expect(matchByKeywords(entries, texts, ['エロ性女'])).toEqual([]);
  });

  it('区分大小写时大小写不同不算命中', () => {
    expect(matchByKeywords(entries, texts, ['alice'], { caseSensitive: true })).toEqual([]);
    expect(ids(matchByKeywords(entries, texts, ['Alice'], { caseSensitive: true }))).toEqual([
      'alice',
    ]);
  });

  it('模糊匹配：写法略有出入也命中，最接近的排在前面', () => {
    expect(ids(matchByKeywords(entries, texts, ['エロ性女'], { fuzzy: true }))).toEqual(['saint']);
    // 多个关键词取并集；完全一致的排在只是接近的前面
    expect(
      ids(matchByKeywords(entries, texts, ['圣银骑土团', 'エロ聖女'], { fuzzy: true })),
    ).toEqual(['saint', 'order']);
    // 差得太多不算
    expect(matchByKeywords(entries, texts, ['完全无关的词'], { fuzzy: true })).toEqual([]);
  });

  it('没有有效关键词时返回全部；空文字不参与匹配', () => {
    expect(matchByKeywords(entries, texts, [])).toEqual(entries);
    expect(matchByKeywords(entries, texts, ['', '  '])).toEqual(entries);
    expect(matchByKeywords([{ id: 'x', name: '', translation: '' }], texts, ['a'])).toEqual([]);
  });

  it('fuzzyMatchIndexes 返回命中条目的序号，按接近程度排序', () => {
    expect(fuzzyMatchIndexes(entries, texts, 'エロ性女')).toEqual([0]);
    expect(fuzzyMatchIndexes(entries, texts, '')).toEqual([]);
    expect(fuzzyMatchIndexes([], texts, 'x')).toEqual([]);
  });
});
