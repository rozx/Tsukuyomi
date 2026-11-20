import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { terminologyTools } from '../services/ai/tools/terminology-tools';
import { chapterTranslationFixture } from './chapter-translation-fixture';
import { captureExecutionLanguages } from '../services/ai/tasks/utils/execution-languages';
import type { Chapter } from '../models/novel';
import type { ToolContext } from '../services/ai/tools/types';

const context: ToolContext = {
  bookId: 'fixture-book',
  languages: captureExecutionLanguages('zh-CN'),
};
const tool = terminologyTools.find(
  (entry) => entry.definition.function.name === 'get_occurrences_by_keywords',
)!;
const invoke = async (args: Record<string, unknown>) =>
  JSON.parse(await tool.handler(args, context)) as {
    success: boolean;
    total_keywords: number;
    occurrences: Array<{
      keyword: string;
      total_count: number;
      occurrences: Array<{ chapterId: string; count: number }>;
    }>;
  };

function chapter(id: string, texts: string[], extra: Partial<Chapter> = {}): Chapter {
  return {
    id,
    title: '',
    content: texts.map((text, index) => ({
      id: `${id}-p${index}`,
      text,
      translations: [],
      selectedTranslationId: '',
    })),
    createdAt: new Date(0),
    lastEdited: new Date(0),
    ...extra,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('站内 get_occurrences_by_keywords（与外部工具共用统计）', () => {
  it('统计各关键词在各章节的出现次数；带原始抓取文本的章节不会算两遍', async () => {
    await chapterTranslationFixture([
      chapter('c1', ['月光石を拾った。', '月光石は光る。月光石だ。']),
      // 同步导入的章节同时保留了原始抓取文本
      chapter('c2', ['塔にも月光石があった。'], { originalContent: '塔にも月光石があった。' }),
    ]);

    const result = await invoke({ keywords: ['月光石', '塔', '不存在'] });
    expect(result.success).toBe(true);
    expect(result.total_keywords).toBe(3);
    const byKeyword = Object.fromEntries(result.occurrences.map((entry) => [entry.keyword, entry]));
    expect(byKeyword['月光石']).toMatchObject({
      total_count: 4,
      occurrences: [
        { chapterId: 'c1', count: 3 },
        { chapterId: 'c2', count: 1 },
      ],
    });
    expect(byKeyword['塔']).toMatchObject({
      total_count: 1,
      occurrences: [{ chapterId: 'c2', count: 1 }],
    });
    expect(byKeyword['不存在']).toMatchObject({ total_count: 0, occurrences: [] });
  });

  it('精确统计区分大小写（既有行为）；无效关键词被忽略', async () => {
    await chapterTranslationFixture([chapter('c1', ['Moon stone and moon light.'])]);
    const result = await invoke({ keywords: ['Moon', '', '  '] });
    expect(result.occurrences).toEqual([
      { keyword: 'Moon', total_count: 1, occurrences: [{ chapterId: 'c1', count: 1 }] },
    ]);
  });

  it('fuzzy 选项：写法略有出入的也计入，每个命中段落计一次', async () => {
    await chapterTranslationFixture([chapter('c1', ['アリスは月光石を拾った。', '風が吹いた。'])]);
    expect(Object.keys(tool.definition.function.parameters?.properties ?? {})).toContain('fuzzy');

    const exact = await invoke({ keywords: ['月光岩を拾った'] });
    expect(exact.occurrences[0]?.total_count).toBe(0);
    const fuzzy = await invoke({ keywords: ['月光岩を拾った'], fuzzy: true });
    expect(fuzzy.occurrences[0]).toMatchObject({
      total_count: 1,
      occurrences: [{ chapterId: 'c1', count: 1 }],
    });
  });
});
