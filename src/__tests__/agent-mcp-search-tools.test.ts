import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import { ChapterContentService } from 'src/services/chapter-content-service';
import { ChapterEmbeddingService } from 'src/services/chapter-embedding-service';
import { EmbeddingService } from 'src/services/embedding-service';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpSearchTools } from 'src/services/agent-mcp/tools/search';

const BOOK_ID = 'book-search-1';

function paragraph(id: string, text: string, translation?: string): Paragraph {
  if (translation === undefined) {
    return { id, text, selectedTranslationId: '', translations: [] };
  }
  return {
    id,
    text,
    selectedTranslationId: `tr-${id}`,
    translations: [
      { id: `tr-${id}`, translation, aiModelId: 'builtin-model-1', language: 'zh-CN' },
    ],
  };
}

function chapter(id: string, title: string, content: Paragraph[]): Chapter {
  const now = new Date();
  return {
    id,
    title: { original: title, translation: { id: `t-${id}`, translation: '', aiModelId: '' } },
    content,
    contentLoaded: true,
    createdAt: now,
    lastEdited: now,
  };
}

function createBook(): Novel {
  const now = new Date();
  return {
    id: BOOK_ID,
    title: '搜索测试书',
    targetLanguage: 'zh-CN',
    volumes: [
      {
        id: 'vol-1',
        title: { original: '第一卷', translation: { id: 'vt-1', translation: '', aiModelId: '' } },
        chapters: [
          chapter('ch-1', '第1話', [
            paragraph('p1000001', 'アリスは月光石を拾った。', '爱丽丝捡起了月光石。'),
            paragraph(
              'p1000002',
              '月光石は淡く光っている。月光石だ。',
              '月光石发着微光。是月光石。',
            ),
            paragraph('p1000003', '風が吹いた。'),
          ]),
          chapter('ch-2', '第2話', [
            paragraph('p2000001', 'アリスは塔へ向かった。', '爱丽丝走向了高塔。'),
            paragraph('p2000002', '塔の上にも月光石があった。', '塔顶也有月光石。'),
            paragraph('p2000003', 'ボブは笑った。', '鲍勃笑了。'),
          ]),
        ],
      },
    ],
    terminologies: [],
    characterSettings: [],
    createdAt: now,
    lastEdited: now,
  };
}

interface SearchMatch {
  chapter_id: string;
  chapter_title: string;
  index: number;
  id: string;
  text: string;
  translation: string | null;
}

async function selectedTranslation(chapterId: string, paragraphId: string): Promise<string> {
  const content = (await ChapterContentService.loadChapterContent(chapterId)) ?? [];
  const target = content.find((p) => p.id === paragraphId);
  return target ? (getLanguageTranslation(target, 'zh-CN')?.translation ?? '') : '';
}

async function versionCount(chapterId: string, paragraphId: string): Promise<number> {
  const content = (await ChapterContentService.loadChapterContent(chapterId)) ?? [];
  return content.find((p) => p.id === paragraphId)?.translations.length ?? 0;
}

describe('AgentMcp 全书搜索与批量替换工具', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useSettingsStore().updateAgentMcpSettings({
      permissionMode: 'translate_and_edit',
      defaultWriteMode: 'append',
    });
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    await useBooksStore().addBook(createBook());
    // 与真实使用一致：章节正文按需从存储读取，而不是都在内存里
    await useBooksStore().refreshBookFromStorage(BOOK_ID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('search_paragraphs', () => {
    it('不指定章节时搜索全书，原文和译文都会匹配，并返回所在章节', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      const data = res.data as { matches: SearchMatch[]; has_more: boolean };
      expect(data.matches.map((m) => m.id)).toEqual(['p1000001', 'p1000002', 'p2000002']);
      expect(data.matches[2]).toMatchObject({
        chapter_id: 'ch-2',
        chapter_title: '第2話',
        index: 1,
        text: '塔の上にも月光石があった。',
        translation: '塔顶也有月光石。',
      });
      expect(data.has_more).toBe(false);
    });

    it('可以只搜原文或只搜译文，关键词不区分大小写', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const original = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '爱丽丝', search_in: 'original' },
        { channel: 'desktop-mcp' },
      );
      expect((original.data as { matches: SearchMatch[] }).matches).toEqual([]);

      const translation = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '爱丽丝', search_in: 'translation' },
        { channel: 'desktop-mcp' },
      );
      expect((translation.data as { matches: SearchMatch[] }).matches.map((m) => m.id)).toEqual([
        'p1000001',
        'p2000001',
      ]);
    });

    it('指定章节时只搜该章节；章节不存在时报错', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const scoped = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', chapter_id: 'ch-2' },
        { channel: 'desktop-mcp' },
      );
      expect((scoped.data as { matches: SearchMatch[] }).matches.map((m) => m.id)).toEqual([
        'p2000002',
      ]);

      const missing = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', chapter_id: 'nope' },
        { channel: 'desktop-mcp' },
      );
      expect(missing.isError).toBe(true);
      expect(missing.errorCode).toBe('CHAPTER_NOT_FOUND');
    });

    it('支持正则；正则写错时返回错误而不是空结果', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '^(アリス|ボブ)は', regex: true, search_in: 'original' },
        { channel: 'desktop-mcp' },
      );
      expect((res.data as { matches: SearchMatch[] }).matches.map((m) => m.id)).toEqual([
        'p1000001',
        'p2000001',
        'p2000003',
      ]);

      const invalid = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '(未闭合', regex: true },
        { channel: 'desktop-mcp' },
      );
      expect(invalid.isError).toBe(true);
      expect(invalid.errorCode).toBe('INVALID_REGEX');
    });

    it('可能让页面卡死的正则（嵌套的重复、过长的表达式）直接拒绝', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      for (const query of [
        '(a+)+b',
        '((月|光)+)*石',
        '(?:x*)*y',
        '(.*a){12}',
        'a'.repeat(301),
        // 没有分组，但一连串不定次数的重复同样会大量回溯
        'a*a*a*a*a*a*a*b',
      ]) {
        const res = await kernel.callTool(
          'search_paragraphs',
          { book_id: BOOK_ID, query, regex: true },
          { channel: 'desktop-mcp' },
        );
        expect(res.isError).toBe(true);
        expect(res.errorCode).toBe('INVALID_REGEX');
      }
      // 普通的分组与重复不受影响
      const ok = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '(月光石|塔)[はがに]+', regex: true, search_in: 'original' },
        { channel: 'desktop-mcp' },
      );
      expect(ok.isError).toBe(false);
      expect((ok.data as { matches: SearchMatch[] }).matches.length).toBeGreaterThan(0);
    });

    it('结果超过上限时说明还有更多，并可用 offset 翻页', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const first = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', limit: 2 },
        { channel: 'desktop-mcp' },
      );
      const firstData = first.data as {
        matches: SearchMatch[];
        has_more: boolean;
        next_offset: number | null;
      };
      expect(firstData.matches.map((m) => m.id)).toEqual(['p1000001', 'p1000002']);
      expect(firstData.has_more).toBe(true);
      expect(firstData.next_offset).toBe(2);

      const second = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', limit: 2, offset: 2 },
        { channel: 'desktop-mcp' },
      );
      const secondData = second.data as {
        matches: SearchMatch[];
        has_more: boolean;
        next_offset: number | null;
      };
      expect(secondData.matches.map((m) => m.id)).toEqual(['p2000002']);
      expect(secondData.has_more).toBe(false);
      expect(secondData.next_offset).toBeNull();
    });

    it('fuzzy 选项：默认精确匹配找不到写法略有出入的内容，开启后可以找到', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const search = async (args: Record<string, unknown>) =>
        (
          await kernel.callTool(
            'search_paragraphs',
            { book_id: BOOK_ID, ...args },
            { channel: 'desktop-mcp' },
          )
        ).data as { matches: SearchMatch[]; fuzzy: boolean };

      // 原文是「アリスは月光石を拾った。」，查询里把「石」写成了「岩」
      const exact = await search({ query: 'アリスは月光岩を' });
      expect(exact.fuzzy).toBe(false);
      expect(exact.matches).toEqual([]);

      const fuzzy = await search({ query: 'アリスは月光岩を', fuzzy: true });
      expect(fuzzy.fuzzy).toBe(true);
      expect(fuzzy.matches.map((m) => m.id)).toEqual(['p1000001']);

      // 模糊搜索同样遵守搜索范围：这句只在原文里
      const translationOnly = await search({
        query: 'アリスは月光岩を',
        fuzzy: true,
        search_in: 'translation',
      });
      expect(translationOnly.matches).toEqual([]);

      // 差得太多不算
      const far = await search({ query: 'ボブは太陽岩を', fuzzy: true });
      expect(far.matches).toEqual([]);
    });

    it('fuzzy 与 regex 不能同时使用', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const res = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', fuzzy: true, regex: true },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(true);
      expect(res.errorCode).toBe('INVALID_ARGS');
    });

    it('没有给搜索词时报错', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const res = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '   ' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(true);
      expect(res.errorCode).toBe('INVALID_ARGS');
    });

    it('only_translated 只返回已有译文的段落，并且先过滤再分页', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const search = async (extra: Record<string, unknown>) => {
        const res = await kernel.callTool(
          'search_paragraphs',
          { book_id: BOOK_ID, search_in: 'original', ...extra },
          { channel: 'desktop-mcp' },
        );
        expect(res.isError, res.text).toBe(false);
        return res.data as { matches: SearchMatch[]; has_more: boolean; next_offset: number };
      };

      expect((await search({ query: '風' })).matches.map((m) => m.id)).toEqual(['p1000003']);
      expect((await search({ query: '風', only_translated: true })).matches).toEqual([]);

      // 未译的 p1000003 不占名额：第二页从 ch-2 开始
      const first = await search({ query: '。', only_translated: true, limit: 2 });
      expect(first.matches.map((m) => m.id)).toEqual(['p1000001', 'p1000002']);
      expect(first.has_more).toBe(true);
      const second = await search({
        query: '。',
        only_translated: true,
        limit: 2,
        offset: first.next_offset,
      });
      expect(second.matches.map((m) => m.id)).toEqual(['p2000001', 'p2000002']);
      expect(second.has_more).toBe(true);
    });

    it('before_chapter_id 只搜该章之前的章节（查前文已有译法、避免剧透）', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const before2 = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', before_chapter_id: 'ch-2' },
        { channel: 'desktop-mcp' },
      );
      expect(before2.isError, before2.text).toBe(false);
      const data = before2.data as { matches: SearchMatch[]; searched_chapter_count: number };
      expect(data.matches.map((m) => m.id)).toEqual(['p1000001', 'p1000002']);
      expect(data.searched_chapter_count).toBe(1);

      const before1 = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', before_chapter_id: 'ch-1' },
        { channel: 'desktop-mcp' },
      );
      expect(before1.data).toMatchObject({ matches: [], searched_chapter_count: 0 });

      const missing = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', before_chapter_id: 'nope' },
        { channel: 'desktop-mcp' },
      );
      expect(missing.errorCode).toBe('CHAPTER_NOT_FOUND');

      const conflicting = await kernel.callTool(
        'search_paragraphs',
        { book_id: BOOK_ID, query: '月光石', chapter_id: 'ch-1', before_chapter_id: 'ch-2' },
        { channel: 'desktop-mcp' },
      );
      expect(conflicting.errorCode).toBe('INVALID_ARGS');
    });

    it('volume_id 只搜该卷；可与 before_chapter_id 一起用', async () => {
      const now = new Date();
      await useBooksStore().addBook({
        id: 'book-search-volumes',
        title: '分卷搜索',
        targetLanguage: 'zh-CN',
        volumes: [
          {
            id: 'vol-a',
            title: '第一卷',
            chapters: [
              chapter('va-1', '一', [paragraph('pa000001', '塔が見えた。', '看见了塔。')]),
            ],
          },
          {
            id: 'vol-b',
            title: '第二卷',
            chapters: [
              chapter('vb-1', '二', [paragraph('pb000001', '塔に登った。', '登上了塔。')]),
              chapter('vb-2', '三', [paragraph('pb000002', '塔が崩れた。')]),
            ],
          },
        ],
        createdAt: now,
        lastEdited: now,
      });
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const ids = async (extra: Record<string, unknown>) => {
        const res = await kernel.callTool(
          'search_paragraphs',
          { book_id: 'book-search-volumes', query: '塔', ...extra },
          { channel: 'desktop-mcp' },
        );
        expect(res.isError, res.text).toBe(false);
        return (res.data as { matches: SearchMatch[] }).matches.map((m) => m.id);
      };

      expect(await ids({ volume_id: 'vol-b' })).toEqual(['pb000001', 'pb000002']);
      expect(await ids({ volume_id: 'vol-b', before_chapter_id: 'vb-2' })).toEqual(['pb000001']);

      const missing = await kernel.callTool(
        'search_paragraphs',
        { book_id: 'book-search-volumes', query: '塔', volume_id: 'nope' },
        { channel: 'desktop-mcp' },
      );
      expect(missing.errorCode).toBe('VOLUME_NOT_FOUND');
    });
  });

  describe('count_occurrences', () => {
    it('统计每个词在全书原文里出现的次数、段落数与章节分布', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'count_occurrences',
        { book_id: BOOK_ID, keywords: ['月光石', 'アリス', '不存在的词'] },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      const { occurrences } = res.data as {
        occurrences: Array<{
          keyword: string;
          total_count: number;
          paragraph_count: number;
          chapter_count: number;
          chapters: Array<{ chapter_id: string; count: number }>;
        }>;
      };
      expect(occurrences.map((o) => o.keyword)).toEqual(['月光石', 'アリス', '不存在的词']);
      expect(occurrences[0]).toMatchObject({
        total_count: 4,
        paragraph_count: 3,
        chapter_count: 2,
        chapters: [
          { chapter_id: 'ch-1', count: 3 },
          { chapter_id: 'ch-2', count: 1 },
        ],
      });
      expect(occurrences[1]).toMatchObject({ total_count: 2, chapter_count: 2 });
      expect(occurrences[2]).toMatchObject({ total_count: 0, chapter_count: 0, chapters: [] });
    });

    it('可以改为统计译文，用来确认旧译名还剩多少处', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'count_occurrences',
        { book_id: BOOK_ID, keywords: ['爱丽丝'], search_in: 'translation' },
        { channel: 'desktop-mcp' },
      );
      const { occurrences } = res.data as { occurrences: Array<{ total_count: number }> };
      expect(occurrences[0]?.total_count).toBe(2);
    });

    it('fuzzy 选项：写法略有出入的也计入，每个命中段落计一次', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const count = async (args: Record<string, unknown>) =>
        (
          await kernel.callTool(
            'count_occurrences',
            { book_id: BOOK_ID, keywords: ['月光岩を拾った'], ...args },
            { channel: 'desktop-mcp' },
          )
        ).data as {
          fuzzy: boolean;
          occurrences: Array<{ total_count: number; paragraph_count: number }>;
        };
      const exact = await count({});
      expect(exact.fuzzy).toBe(false);
      expect(exact.occurrences[0]).toMatchObject({ total_count: 0, paragraph_count: 0 });

      const fuzzy = await count({ fuzzy: true });
      expect(fuzzy.fuzzy).toBe(true);
      expect(fuzzy.occurrences[0]).toMatchObject({ total_count: 1, paragraph_count: 1 });
    });

    it('没有给任何关键词时报错', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const res = await kernel.callTool(
        'count_occurrences',
        { book_id: BOOK_ID, keywords: [] },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(true);
      expect(res.errorCode).toBe('INVALID_ARGS');
    });
  });

  describe('replace_in_translations', () => {
    it('在全书已选用的译文里替换文字，默认追加为新版本并保留旧版本', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '月光石', replace_with: '月辉石', model_label: 'claude-test' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      expect(res.data).toMatchObject({
        dry_run: false,
        write_mode: 'append',
        replaced_paragraph_count: 3,
        replacement_count: 4,
        has_more: false,
        chapters: [
          { chapter_id: 'ch-1', paragraph_count: 2 },
          { chapter_id: 'ch-2', paragraph_count: 1 },
        ],
      });

      expect(await selectedTranslation('ch-1', 'p1000002')).toBe('月辉石发着微光。是月辉石。');
      expect(await selectedTranslation('ch-2', 'p2000002')).toBe('塔顶也有月辉石。');
      // 追加模式：旧版本仍在
      expect(await versionCount('ch-1', 'p1000002')).toBe(2);
      // 不含该词的译文不受影响
      expect(await selectedTranslation('ch-2', 'p2000003')).toBe('鲍勃笑了。');
      expect(await versionCount('ch-2', 'p2000003')).toBe(1);
    });

    it('覆盖模式直接修改当前版本，不新增版本', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '爱丽丝', replace_with: '艾丽丝', write_mode: 'overwrite' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      expect(await selectedTranslation('ch-1', 'p1000001')).toBe('艾丽丝捡起了月光石。');
      expect(await versionCount('ch-1', 'p1000001')).toBe(1);
    });

    it('dry_run 只返回会被替换的内容，不写入', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '月光石', replace_with: '月辉石', dry_run: true },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      const data = res.data as {
        dry_run: boolean;
        replaced_paragraph_count: number;
        samples: Array<{ id: string; before: string; after: string }>;
      };
      expect(data.dry_run).toBe(true);
      expect(data.replaced_paragraph_count).toBe(3);
      expect(data.samples[0]).toMatchObject({
        id: 'p1000001',
        before: '爱丽丝捡起了月光石。',
        after: '爱丽丝捡起了月辉石。',
      });
      expect(await selectedTranslation('ch-1', 'p1000001')).toBe('爱丽丝捡起了月光石。');
    });

    it('可以限定章节，并且只替换原文包含指定词的段落', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        {
          book_id: BOOK_ID,
          find: '月光石',
          replace_with: '月辉石',
          chapter_id: 'ch-1',
          original_contains: '拾った',
          write_mode: 'overwrite',
        },
        { channel: 'desktop-mcp' },
      );
      expect((res.data as { replaced_paragraph_count: number }).replaced_paragraph_count).toBe(1);
      expect(await selectedTranslation('ch-1', 'p1000001')).toBe('爱丽丝捡起了月辉石。');
      expect(await selectedTranslation('ch-1', 'p1000002')).toBe('月光石发着微光。是月光石。');
      expect(await selectedTranslation('ch-2', 'p2000002')).toBe('塔顶也有月光石。');
    });

    it('超过段落上限时只处理上限以内的部分并说明还有剩余', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        {
          book_id: BOOK_ID,
          find: '月光石',
          replace_with: '月辉石',
          max_paragraphs: 2,
          write_mode: 'overwrite',
        },
        { channel: 'desktop-mcp' },
      );
      expect(res.data).toMatchObject({ replaced_paragraph_count: 2, has_more: true });
      expect(await selectedTranslation('ch-2', 'p2000002')).toBe('塔顶也有月光石。');
    });

    it('替换内容包含查找内容时，用 next_cursor 续传，不会重复替换已处理的段落', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const call = (extra: Record<string, unknown>) =>
        kernel.callTool(
          'replace_in_translations',
          {
            book_id: BOOK_ID,
            find: '月光石',
            replace_with: '月光石碎片',
            max_paragraphs: 1,
            write_mode: 'overwrite',
            ...extra,
          },
          { channel: 'desktop-mcp' },
        );
      type Result = {
        replaced_paragraph_count: number;
        has_more: boolean;
        next_cursor: string | null;
      };

      const first = (await call({})).data as Result;
      expect(first).toMatchObject({ replaced_paragraph_count: 1, has_more: true });
      expect(typeof first.next_cursor).toBe('string');

      const second = (await call({ cursor: first.next_cursor })).data as Result;
      expect(second).toMatchObject({ replaced_paragraph_count: 1, has_more: true });
      const third = (await call({ cursor: second.next_cursor })).data as Result;
      expect(third).toMatchObject({
        replaced_paragraph_count: 1,
        has_more: false,
        next_cursor: null,
      });

      // 每一段只被替换一次：续传从上次停下的位置继续，而不是从头再来
      expect(await selectedTranslation('ch-1', 'p1000001')).toBe('爱丽丝捡起了月光石碎片。');
      expect(await selectedTranslation('ch-1', 'p1000002')).toBe(
        '月光石碎片发着微光。是月光石碎片。',
      );
      expect(await selectedTranslation('ch-2', 'p2000002')).toBe('塔顶也有月光石碎片。');
    });

    it('预览（dry_run）不返回续传位置：把预览的位置带进正式替换会跳过还没写入的那一批', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      const res = await kernel.callTool(
        'replace_in_translations',
        {
          book_id: BOOK_ID,
          find: '月光石',
          replace_with: '月辉石',
          max_paragraphs: 1,
          dry_run: true,
        },
        { channel: 'desktop-mcp' },
      );
      expect(res.data).toMatchObject({ dry_run: true, has_more: true, next_cursor: null });
    });

    it('续传位置无效时报错，不做任何替换', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });
      for (const cursor of ['no-such-chapter:p1000001', 'ch-1:no-such-paragraph', 'garbage']) {
        const res = await kernel.callTool(
          'replace_in_translations',
          { book_id: BOOK_ID, find: '月光石', replace_with: '月辉石', cursor },
          { channel: 'desktop-mcp' },
        );
        expect(res.isError).toBe(true);
        expect(res.errorCode).toBe('INVALID_CURSOR');
      }
      expect(await selectedTranslation('ch-1', 'p1000001')).toBe('爱丽丝捡起了月光石。');
    });

    it('替换后译文会变成空白的段落跳过不改', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '鲍勃笑了。', replace_with: '', write_mode: 'overwrite' },
        { channel: 'desktop-mcp' },
      );
      expect(res.data).toMatchObject({ replaced_paragraph_count: 0, skipped_empty_count: 1 });
      expect(await selectedTranslation('ch-2', 'p2000003')).toBe('鲍勃笑了。');
    });

    it('查找内容为空或与替换内容相同时报错；只读权限下不能调用', async () => {
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const empty = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '', replace_with: 'x' },
        { channel: 'desktop-mcp' },
      );
      expect(empty.errorCode).toBe('INVALID_ARGS');

      const same = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '月光石', replace_with: '月光石' },
        { channel: 'desktop-mcp' },
      );
      expect(same.errorCode).toBe('INVALID_ARGS');

      await useSettingsStore().updateAgentMcpSettings({ permissionMode: 'read_only' });
      const denied = await kernel.callTool(
        'replace_in_translations',
        { book_id: BOOK_ID, find: '月光石', replace_with: '月辉石' },
        { channel: 'desktop-mcp' },
      );
      expect(denied.errorCode).toBe('PERMISSION_DENIED');
      expect(kernel.listTools('desktop-mcp').map((t) => t.name)).not.toContain(
        'replace_in_translations',
      );
    });
  });

  describe('search_chapters', () => {
    it('本地嵌入没有开启时说明原因，并建议改用关键词搜索', async () => {
      await useSettingsStore().updateSettings({ enableLocalEmbedding: false });
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'search_chapters',
        { book_id: BOOK_ID, query: '主角第一次拿到月光石' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(true);
      expect(res.errorCode).toBe('EMBEDDING_DISABLED');
      expect(res.errorMessage).toContain('search_paragraphs');
    });

    it('嵌入模型还没准备好时返回可重试的错误', async () => {
      await useSettingsStore().updateSettings({ enableLocalEmbedding: true });
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(false);
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'search_chapters',
        { book_id: BOOK_ID, query: '月光石' },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(true);
      expect(res.errorCode).toBe('EMBEDDING_NOT_READY');
    });

    it('可用时按语义返回最相关的章节', async () => {
      await useSettingsStore().updateSettings({ enableLocalEmbedding: true });
      vi.spyOn(EmbeddingService, 'isReady').mockReturnValue(true);
      const querySpy = vi
        .spyOn(ChapterEmbeddingService, 'queryChapters')
        .mockResolvedValue([{ chapter_id: 'ch-2', title: '第2話', score: 0.82, preview: '塔…' }]);
      const kernel = createAgentMcpKernel({ tools: agentMcpSearchTools });

      const res = await kernel.callTool(
        'search_chapters',
        { book_id: BOOK_ID, query: '去高塔的那一章', limit: 3 },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError).toBe(false);
      expect(querySpy).toHaveBeenCalledWith(BOOK_ID, '去高塔的那一章', 3, 'zh-CN');
      expect((res.data as { chapters: unknown[] }).chapters).toEqual([
        { chapter_id: 'ch-2', title: '第2話', score: 0.82, preview: '塔…' },
      ]);
    });
  });
});
