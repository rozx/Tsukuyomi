import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Novel } from 'src/models/novel';
import { useBooksStore } from 'src/stores/books';
import { useContextStore } from 'src/stores/context';
import { useSettingsStore } from 'src/stores/settings';
import { MemoryService } from 'src/services/memory-service';
import {
  clearLastScoreBreakdowns,
  getLastScoreBreakdowns,
} from 'src/services/ai/tasks/utils/context-builder';
import { getLanguageTranslation } from 'src/services/localization/selection';
import { createAgentMcpKernel } from 'src/services/agent-mcp/kernel';
import { agentMcpTranslationTools } from 'src/services/agent-mcp/tools/translation';

function createTestBook(overrides: Partial<Novel> = {}): Novel {
  const now = new Date();
  return {
    id: 'book-trans-1',
    title: '月光之城',
    author: '作者',
    targetLanguage: 'zh-CN',
    translationInstructions: '保持诗意语风',
    terminologies: [
      {
        id: 'term-1',
        name: '月光石',
        description: '发光矿石',
        translation: { id: 'tt-1', translation: '月光石', aiModelId: 'm1' },
      },
    ],
    characterSettings: [
      {
        id: 'char-1',
        name: 'アリス',
        sex: 'female',
        description: '主角',
        speakingStyle: '礼貌温柔',
        translation: { id: 'ct-1', translation: '爱丽丝', aiModelId: 'm1' },
        aliases: [],
      },
    ],
    volumes: [
      {
        id: 'vol-1',
        title: {
          original: '第一卷',
          translation: { id: 'vt-1', translation: '第一卷', aiModelId: '' },
        },
        chapters: [
          {
            id: 'ch-1',
            title: {
              original: '第1話 月光',
              translation: { id: 'cht-1', translation: '', aiModelId: '' },
            },
            translationInstructions: '本章偏向对话节奏',
            contentLoaded: true,
            content: [
              {
                id: 'p0000001',
                text: 'アリスは静かに窓を開けた。',
                selectedTranslationId: 'tr-init-1',
                translations: [
                  {
                    id: 'tr-init-1',
                    translation: '爱丽丝静静地推开了窗。',
                    aiModelId: 'builtin-model-1',
                    language: 'zh-CN',
                  },
                ],
              },
              {
                id: 'p0000002',
                text: '机の上には月光石が輝いていた。',
                selectedTranslationId: '',
                translations: [],
              },
              {
                id: 'p0000003',
                text: '「今夜は星がきれいですね」とアリスは言った。',
                selectedTranslationId: '',
                translations: [],
              },
              {
                id: 'p0000004',
                text: '遠くから鐘の音が響いてくる。',
                selectedTranslationId: '',
                translations: [],
              },
            ],
            createdAt: now,
            lastEdited: now,
          },
        ],
      },
    ],
    createdAt: now,
    lastEdited: now,
    ...overrides,
  };
}

describe('AgentMcp translation tools', () => {
  beforeEach(async () => {
    await useSettingsStore().loadSettings();
    await useBooksStore().loadBooks();
    useContextStore().setCurrentBook(null);
    clearLastScoreBreakdowns();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('get_translation_chunk 打包待翻段落、前文衔接、命中术语/角色、记忆与特殊指令，且不改写 getLastScoreBreakdowns', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    await MemoryService.createMemory(
      book.id,
      'アリスは月光石を大切にしている。',
      '爱丽丝珍视月光石',
    );

    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const res = await kernel.callTool(
      'get_translation_chunk',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        mode: 'untranslated',
        context_before: 2,
      },
      { channel: 'desktop-mcp' },
    );

    expect(res.isError).toBe(false);
    const data = res.data as {
      target_language: string;
      paragraphs: Array<{ id: string; text: string }>;
      context_before: Array<{ id: string; translation: string }>;
      matched_terms: Array<{ name: string; translation: string }>;
      matched_characters: Array<{ name: string; translation: string }>;
      memories: Array<{ summary: string }>;
      special_instructions: string;
      remaining_untranslated_count: number;
    };

    expect(data.target_language).toBe('zh-CN');
    expect(data.paragraphs.map((p) => p.id)).toEqual(['p0000002', 'p0000003', 'p0000004']);
    expect(data.context_before).toHaveLength(1);
    expect(data.context_before[0]?.translation).toBe('爱丽丝静静地推开了窗。');
    expect(data.matched_terms.some((t) => t.name === '月光石')).toBe(true);
    expect(data.matched_characters.some((c) => c.name === 'アリス')).toBe(true);
    expect(data.memories.some((m) => m.summary.includes('月光石'))).toBe(true);
    expect(data.special_instructions).toContain('本章偏向对话节奏');
    expect(data.remaining_untranslated_count).toBe(3);

    // 只读 selectRelevantMemoriesForChunk 绝不能污染站内任务的打分明细缓存
    expect(getLastScoreBreakdowns(book.id)).toBeUndefined();
  });

  it('术语很多的书里，取翻译块仍能带出与本块相关的记忆（不被全书术语数量稀释）', async () => {
    // 60 个与本块无关的术语：记忆相关性只应按本块命中的术语和角色计算
    const unrelatedTerms = Array.from({ length: 60 }, (_, i) => ({
      id: `term-x-${i}`,
      name: `無関係語${i}`,
      translation: { id: `tt-x-${i}`, translation: `无关词${i}`, aiModelId: 'm1' },
    }));
    const base = createTestBook();
    const book = createTestBook({
      terminologies: [...(base.terminologies ?? []), ...unrelatedTerms],
    });
    await useBooksStore().addBook(book);
    await MemoryService.createMemory(
      book.id,
      'アリスは月光石を大切にしている。',
      '爱丽丝珍视月光石',
    );

    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const res = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError).toBe(false);
    const data = res.data as {
      matched_terms: Array<{ name: string }>;
      memories: Array<{ summary: string }>;
    };
    expect(data.matched_terms.map((t) => t.name)).toEqual(['月光石']);
    expect(data.memories.map((m) => m.summary)).toEqual(['爱丽丝珍视月光石']);
  });

  it('没有本地嵌入时，记忆里记下的原文写法出现在本块正文里就能带出，不被较新的剧情记忆挤掉', async () => {
    const base = createTestBook();
    const book = createTestBook({
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                {
                  id: 'p0000001',
                  text: '新しいお嫁さんが来た、とアリスは言った。',
                  selectedTranslationId: '',
                  translations: [],
                },
                {
                  id: 'p0000002',
                  text: '【朗報・速報】フィン(・・・)が帰ってきた。',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const day = 24 * 60 * 60 * 1000;
    const old = { createdAt: Date.now() - 90 * day, lastAccessedAt: Date.now() - 90 * day };
    const add = (id: string, summary: string, content: string, timestamps?: typeof old) =>
      MemoryService.createMemoryWithId(book.id, id, content, summary, timestamps);
    // 三条翻译约定：摘要里带着原文写法；一条刚用过，两条是很久以前记下的
    await add('m-bride', 'お嫁さん 统一译作「老婆」', '不译作新娘、媳妇。');
    await add('m-news', '弹幕标题【朗報】译作【好消息】', '保留方括号。', old);
    await add('m-dots', '傍点写法 (・・) 保留在译名后', '如 芬恩(・・・)。', old);
    // 刚写下的剧情记忆，提到了本块命中的角色
    await add('m-plot', '第 350 话剧情梗概', 'アリス在王都遇到了旧友，两人一起调查失踪案。');
    // 与本块无关的约定
    await add('m-other', '魔導列車 译作「魔导列车」', '不译作魔法火车。', old);

    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const res = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError, res.text).toBe(false);
    const ids = (res.data as { memories: Array<{ id: string }> }).memories.map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['m-bride', 'm-news', 'm-dots']));
    expect(ids).not.toContain('m-other');
  });

  it('角色用姓或名单独出现、带敬称时也能命中（与站内翻译用同一套匹配）', async () => {
    const base = createTestBook();
    const book = createTestBook({
      characterSettings: [
        {
          id: 'char-yu',
          name: '月岡 優',
          sex: 'female',
          description: '学姐',
          speakingStyle: '',
          translation: { id: 'ct-yu', translation: '月冈优', aiModelId: 'm1' },
          aliases: [
            {
              name: '優ちゃん',
              translation: { id: 'at-yu', translation: '小优', aiModelId: 'm1' },
            },
          ],
        },
      ],
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                {
                  id: 'p0000001',
                  text: '「優さん、おはようございます」',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);

    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const res = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1' },
      { channel: 'desktop-mcp' },
    );
    const data = res.data as { matched_characters: Array<{ name: string; translation: string }> };
    expect(data.matched_characters).toEqual([
      expect.objectContaining({ name: '月岡 優', translation: '月冈优' }),
    ]);
  });

  it('原文把术语或角色名写错字时，取翻译块把它们列为「可能相关」并给出原文写法', async () => {
    const base = createTestBook();
    const book = createTestBook({
      terminologies: [
        {
          id: 'term-saint',
          name: 'エロ聖女',
          translation: { id: 'tt-s', translation: '色情圣女', aiModelId: 'm1' },
        },
      ],
      characterSettings: [
        {
          id: 'char-alex',
          name: 'アレクサンドラ',
          sex: 'female',
          description: '',
          speakingStyle: '',
          translation: { id: 'ct-a', translation: '亚历山德拉', aiModelId: 'm1' },
          aliases: [],
        },
      ],
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                {
                  id: 'p0000001',
                  text: 'エロ性女と呼ばれたアレクサンドロは笑った。',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const data = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1' },
        { channel: 'desktop-mcp' },
      )
    ).data as {
      matched_terms: unknown[];
      matched_characters: unknown[];
      possible_terms: Array<Record<string, unknown>>;
      possible_characters: Array<Record<string, unknown>>;
    };
    // 不是确定命中，单独列出
    expect(data.matched_terms).toEqual([]);
    expect(data.matched_characters).toEqual([]);
    expect(data.possible_terms).toEqual([
      expect.objectContaining({
        name: 'エロ聖女',
        translation: '色情圣女',
        text_in_source: 'エロ性女',
      }),
    ]);
    expect(data.possible_characters).toEqual([
      expect.objectContaining({
        name: 'アレクサンドラ',
        translation: '亚历山德拉',
        text_in_source: 'アレクサンドロ',
      }),
    ]);
  });

  it('确定命中的角色不会同时出现在「可能相关」里', async () => {
    const base = createTestBook();
    const book = createTestBook({
      terminologies: [],
      characterSettings: [
        {
          id: 'char-alicia',
          name: 'アリシア・ラ・アエラス',
          sex: 'female',
          description: '',
          speakingStyle: '',
          translation: { id: 'ct-al', translation: '艾莉西亚', aiModelId: 'm1' },
          aliases: [],
        },
      ],
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                {
                  id: 'p0000001',
                  text: 'アリシア・ラ・アエラスは頷いた。「アリア、行こう」',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const data = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1' },
        { channel: 'desktop-mcp' },
      )
    ).data as {
      matched_characters: Array<{ name: string }>;
      possible_characters: unknown[];
    };
    expect(data.matched_characters.map((c) => c.name)).toEqual(['アリシア・ラ・アエラス']);
    expect(data.possible_characters).toEqual([]);
  });

  it('新章节的第一块带上上一章末尾的已译段落，以及最近几章的标题译法', async () => {
    const base = createTestBook();
    const firstChapter = base.volumes![0]!.chapters![0]!;
    const translated = (id: string, text: string, translation: string) => ({
      id,
      text,
      selectedTranslationId: `tr-${id}`,
      translations: [
        { id: `tr-${id}`, translation, aiModelId: 'builtin-model-1', language: 'zh-CN' as const },
      ],
    });
    const book = createTestBook({
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...firstChapter,
              id: 'ch-prev',
              title: {
                original: '６９５話　前夜',
                translation: { id: 'cht-p', translation: '６９５话　前夜', aiModelId: '' },
              },
              content: [
                translated('pa000001', '一行目。', '第一行。'),
                translated('pa000002', '二行目。', '第二行。'),
                { id: 'pa000003', text: '', selectedTranslationId: '', translations: [] },
                translated('pa000004', '「また明日」', '「明天见」'),
                // 章末的分隔线不算正文，不占衔接的名额
                translated('pa00004b', '---', '---'),
                // 末尾没译的段落不算衔接
                { id: 'pa000005', text: '未訳の行。', selectedTranslationId: '', translations: [] },
              ],
            },
            {
              ...firstChapter,
              id: 'ch-new',
              title: {
                original: '６９６話　朝',
                translation: { id: 'cht-n', translation: '', aiModelId: '' },
              },
              content: [
                { id: 'pb000001', text: '朝が来た。', selectedTranslationId: '', translations: [] },
                { id: 'pb000002', text: '鳥が鳴く。', selectedTranslationId: '', translations: [] },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });

    const first = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-new', context_before: 2 },
        { channel: 'desktop-mcp' },
      )
    ).data as {
      context_before: unknown[];
      previous_chapter_tail: {
        chapter_id: string;
        title_original: string;
        title_translation: string;
        paragraphs: Array<{ id: string; original: string; translation: string }>;
      } | null;
      recent_chapter_titles: Array<{
        chapter_id: string;
        title_original: string;
        title_translation: string;
      }>;
    };
    expect(first.context_before).toEqual([]);
    expect(first.previous_chapter_tail).toMatchObject({
      chapter_id: 'ch-prev',
      title_original: '６９５話　前夜',
      title_translation: '６９５话　前夜',
    });
    // 取上一章最后 2 段已译的非空段落，按原顺序
    expect(first.previous_chapter_tail?.paragraphs.map((p) => [p.id, p.translation])).toEqual([
      ['pa000002', '第二行。'],
      ['pa000004', '「明天见」'],
    ]);
    expect(first.recent_chapter_titles).toEqual([
      {
        chapter_id: 'ch-prev',
        title_original: '６９５話　前夜',
        title_translation: '６９５话　前夜',
      },
    ]);

    // 本章已有已译前文时用本章的，不再带上一章
    await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-new',
        paragraphs: [{ paragraph_id: 'pb000001', translated_text: '天亮了。' }],
      },
      { channel: 'desktop-mcp' },
    );
    const next = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-new' },
        { channel: 'desktop-mcp' },
      )
    ).data as { context_before: unknown[]; previous_chapter_tail: unknown };
    expect(next.context_before).toHaveLength(1);
    expect(next.previous_chapter_tail).toBeNull();

    // 全书第一章没有上一章；context_before 为 0 时不带衔接
    const firstOfBook = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-prev', mode: 'all' },
        { channel: 'desktop-mcp' },
      )
    ).data as { previous_chapter_tail: unknown; recent_chapter_titles: unknown[] };
    expect(firstOfBook.previous_chapter_tail).toBeNull();
    expect(firstOfBook.recent_chapter_titles).toEqual([]);
  });

  it('submit_translations 支持默认 append、同文去重、版本上限 5 逐出、显式 overwrite（保留原 aiModelId）与无译文退化 append', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });

    // 1. 默认 append 对已有译文段落新增版本并保留历史
    const appendRes = await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        model_label: 'claude-opus-4',
        chapter_title_translation: '第1话 月光',
        paragraphs: [
          { paragraph_id: 'p0000001', translated_text: '爱丽丝悄悄推开了窗户。' },
          { paragraph_id: 'p0000002', translated_text: '桌上的月光石闪耀着光芒。' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(appendRes.isError).toBe(false);
    const appendData = appendRes.data as {
      saved_count: number;
      remaining_untranslated_count: number;
      chapter_title_updated: boolean;
    };
    expect(appendData.saved_count).toBe(2);
    expect(appendData.remaining_untranslated_count).toBe(2);
    expect(appendData.chapter_title_updated).toBe(true);

    let freshBook = useBooksStore().getBookById(book.id)!;
    let p1 = freshBook.volumes![0]!.chapters![0]!.content![0]!;
    expect(p1.translations).toHaveLength(2);
    expect(getLanguageTranslation(p1, 'zh-CN')?.aiModelId).toBe('mcp:claude-opus-4');

    // 2. 同文提交不新增重复版本，直接选中已有版本
    await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        paragraphs: [{ paragraph_id: 'p0000001', translated_text: '爱丽丝静静地推开了窗。' }],
      },
      { channel: 'desktop-mcp' },
    );
    freshBook = useBooksStore().getBookById(book.id)!;
    p1 = freshBook.volumes![0]!.chapters![0]!.content![0]!;
    expect(p1.translations).toHaveLength(2);
    expect(getLanguageTranslation(p1, 'zh-CN')?.id).toBe('tr-init-1');

    // 3. 显式 overwrite 原地更新当前选中译文且保留原 aiModelId (builtin-model-1)
    await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        write_mode: 'overwrite',
        model_label: 'claude-opus-4',
        paragraphs: [
          { paragraph_id: 'p0000001', translated_text: '爱丽丝轻轻打开了窗户。' },
          // p0000003 尚无译文，overwrite 应退化为 append
          { paragraph_id: 'p0000003', translated_text: '“今晚的星星真美啊。”爱丽丝说道。' },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    freshBook = useBooksStore().getBookById(book.id)!;
    p1 = freshBook.volumes![0]!.chapters![0]!.content![0]!;
    expect(p1.translations).toHaveLength(2);
    expect(getLanguageTranslation(p1, 'zh-CN')?.translation).toBe('爱丽丝轻轻打开了窗户。');
    expect(getLanguageTranslation(p1, 'zh-CN')?.aiModelId).toBe('builtin-model-1');

    const p3 = freshBook.volumes![0]!.chapters![0]!.content![2]!;
    expect(p3.translations).toHaveLength(1);
    expect(getLanguageTranslation(p3, 'zh-CN')?.aiModelId).toBe('mcp:claude-opus-4');

    // 4. 连续追加超过 5 个版本时按每种语言 5 个版本上限逐出最早版本
    for (let i = 1; i <= 6; i++) {
      await kernel.callTool(
        'submit_translations',
        {
          book_id: book.id,
          chapter_id: 'ch-1',
          paragraphs: [{ paragraph_id: 'p0000002', translated_text: `版本-${i}` }],
        },
        { channel: 'desktop-mcp' },
      );
    }
    freshBook = useBooksStore().getBookById(book.id)!;
    const p2 = freshBook.volumes![0]!.chapters![0]!.content![1]!;
    expect(p2.translations.filter((t) => (t.language ?? 'zh-CN') === 'zh-CN')).toHaveLength(5);
    expect(getLanguageTranslation(p2, 'zh-CN')?.translation).toBe('版本-6');
  });

  it('启用原文前缀校验时拒绝错位项，且 untranslated 模式提交部分段落后再次拉取不跳段并重返失败段', async () => {
    const book = createTestBook({ enableOriginalTextValidation: true });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });

    // 拉取前两段（极小 chunk_size 强制分块）
    const chunk1 = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1', mode: 'untranslated', chunk_size: 40 },
      { channel: 'desktop-mcp' },
    );
    expect(chunk1.isError).toBe(false);
    const c1Paragraphs = (chunk1.data as { paragraphs: Array<{ id: string }> }).paragraphs;
    expect(c1Paragraphs[0]?.id).toBe('p0000002');

    // 提交：p0000002 前缀正确，p0000003 前缀错位被拒
    const sub = await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        paragraphs: [
          {
            paragraph_id: 'p0000002',
            original_text_prefix: '机の上には',
            translated_text: '桌上闪耀着月光石。',
          },
          {
            paragraph_id: 'p0000003',
            original_text_prefix: '完全不匹配的前缀',
            translated_text: '错位译文',
          },
        ],
      },
      { channel: 'desktop-mcp' },
    );
    expect(sub.isError).toBe(false);
    const subData = sub.data as {
      saved_count: number;
      failed_items: Array<{ paragraph_id: string; error_code: string }>;
      remaining_untranslated_count: number;
    };
    expect(subData.saved_count).toBe(1);
    expect(subData.failed_items).toHaveLength(1);
    expect(subData.failed_items[0]?.paragraph_id).toBe('p0000003');
    expect(subData.failed_items[0]?.error_code).toBe('ORIGINAL_TEXT_PREFIX_MISMATCH');
    expect(subData.remaining_untranslated_count).toBe(2);

    // 再次不带 cursor 拉取 untranslated：失败的 p0000003 必须排第一，不能被跳过
    const chunk2 = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1', mode: 'untranslated' },
      { channel: 'desktop-mcp' },
    );
    const c2Ids = (chunk2.data as { paragraphs: Array<{ id: string }> }).paragraphs.map(
      (p) => p.id,
    );
    expect(c2Ids).toEqual(['p0000003', 'p0000004']);

    // 即使 Agent 沿用 chunk1 返回的 next_cursor 或显式传入末尾游标，也不得跳过失败段或误报 completed: true
    const c1NextCursor = (chunk1.data as { next_cursor: number | null }).next_cursor;
    const chunkWithPrevCursor = await kernel.callTool(
      'get_translation_chunk',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        mode: 'untranslated',
        cursor: c1NextCursor ?? 0,
      },
      { channel: 'desktop-mcp' },
    );
    expect(
      (chunkWithPrevCursor.data as { paragraphs: Array<{ id: string }> }).paragraphs.map(
        (p) => p.id,
      ),
    ).toContain('p0000003');

    const chunkPastEnd = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1', mode: 'untranslated', cursor: 99 },
      { channel: 'desktop-mcp' },
    );
    const pastEndData = chunkPastEnd.data as {
      completed: boolean;
      remaining_untranslated_count: number;
      paragraphs: Array<{ id: string }>;
    };
    expect(pastEndData.completed).toBe(false);
    expect(pastEndData.remaining_untranslated_count).toBe(2);
    expect(pastEndData.paragraphs.map((p) => p.id)).toEqual(['p0000003', 'p0000004']);
  });

  it('get_translation_chunk 用 has_more 说明这一块之后是否还有下一块（mode="all" 取到章末时为 false）', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Chunk = {
      completed: boolean;
      has_more: boolean;
      next_cursor: number | null;
      paragraphs: Array<{ id: string }>;
    };
    const chunk = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Chunk;
    };

    // 校对时一次取完整章：已到章末，没有下一块
    const whole = await chunk({ mode: 'all', chunk_size: 20000 });
    expect(whole.paragraphs).toHaveLength(4);
    expect(whole.next_cursor).toBeNull();
    expect(whole.has_more).toBe(false);
    // completed 只在这一次没有返回段落时为 true，本块仍需处理
    expect(whole.completed).toBe(false);

    const firstOfMany = await chunk({ mode: 'all', chunk_size: 1 });
    expect(firstOfMany.paragraphs).toHaveLength(1);
    expect(firstOfMany.has_more).toBe(true);
    const last = await chunk({ mode: 'all', chunk_size: 1, cursor: 3 });
    expect(last.paragraphs.map((p) => p.id)).toEqual(['p0000004']);
    expect(last.has_more).toBe(false);

    // untranslated 模式：本块之外还有未译段落时为 true
    expect((await chunk({ chunk_size: 1 })).has_more).toBe(true);
    expect((await chunk({ chunk_size: 20000 })).has_more).toBe(false);
  });

  it('get_translation_chunk 的 compact 模式省略最近章节标题与术语、角色的说明，保留角色的性别与说话风格', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const call = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Record<string, unknown> & {
        matched_terms: Array<Record<string, unknown>>;
        matched_characters: Array<Record<string, unknown>>;
        paragraphs: unknown[];
      };
    };

    const full = await call({});
    expect(full).toHaveProperty('recent_chapter_titles');
    expect(full.matched_characters[0]).toHaveProperty('speaking_style', '礼貌温柔');
    expect(full.matched_terms[0]).toHaveProperty('description', '发光矿石');

    const compact = await call({ compact: true });
    expect(compact).not.toHaveProperty('recent_chapter_titles');
    expect(compact.matched_terms).toEqual([
      { id: 'term-1', name: '月光石', translation: '月光石' },
    ]);
    // 角色保留性别与说话风格：后续块才出场的角色也要知道口吻，空着时 Agent 能看出需要补
    expect(compact.matched_characters).toEqual([
      {
        id: 'char-1',
        name: 'アリス',
        translation: '爱丽丝',
        sex: 'female',
        speaking_style: '礼貌温柔',
        aliases: [],
      },
    ]);
    // 段落、特殊指令等翻译必需的内容不受影响
    expect(compact.paragraphs).toEqual(full.paragraphs);
    expect(compact.special_instructions).toBe(full.special_instructions);
  });

  it('get_translation_chunk 的 compact 模式省略续块里重复的元数据，以及为空的列表、previous_chapter_tail 与特殊指令', async () => {
    // 用单独的书：同一个 book_id 下前面用例建的记忆还在
    const base = createTestBook({ id: 'book-compact-1' });
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const call = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { chapter_id: 'ch-1', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Record<string, unknown>;
    };
    const repeatedMetadata = [
      'chapter_title_original',
      'chapter_title_translation',
      'target_language',
      'enable_original_text_validation',
      'mode',
    ];
    const emptyLists = ['possible_terms', 'possible_characters', 'repeated_passages', 'memories'];

    await useBooksStore().addBook(base);
    const full = await call({ book_id: base.id });
    // 非 compact（新章节的第一块）字段齐全，空列表也照常给出
    for (const key of [...repeatedMetadata, ...emptyLists, 'previous_chapter_tail']) {
      expect(full).toHaveProperty(key);
    }

    const compact = await call({ book_id: base.id, compact: true });
    for (const key of [...repeatedMetadata, ...emptyLists, 'previous_chapter_tail']) {
      expect(compact, key).not.toHaveProperty(key);
    }
    // 定位、进度、续取与翻译必需的内容照常给出；有内容的列表与特殊指令不省略
    expect(compact).toMatchObject({
      book_id: base.id,
      chapter_id: 'ch-1',
      completed: false,
      has_more: false,
      chapter_total_count: 4,
      chapter_translated_count: 1,
      remaining_untranslated_count: 3,
      next_cursor: 1,
      special_instructions: full.special_instructions,
      paragraphs: full.paragraphs,
      context_before: full.context_before,
    });
    expect(compact.matched_terms).toHaveLength(1);
    expect(compact.matched_characters).toHaveLength(1);

    // 特殊指令为空时 compact 也省略
    const plain = createTestBook({ id: 'book-compact-2', translationInstructions: '' });
    plain.volumes![0]!.chapters![0]!.translationInstructions = '';
    await useBooksStore().addBook(plain);
    expect(await call({ book_id: plain.id })).toHaveProperty('special_instructions', '');
    expect(await call({ book_id: plain.id, compact: true })).not.toHaveProperty(
      'special_instructions',
    );

    // 没有可处理的段落：compact 只留 completed、空的 paragraphs 与进度
    const done = await call({ book_id: base.id, compact: true, mode: 'all', cursor: 99 });
    expect(done).toMatchObject({ completed: true, has_more: false, paragraphs: [] });
    expect(done).not.toHaveProperty('context_before');
    expect(done).not.toHaveProperty('matched_terms');

    await useBooksStore().deleteBook(base.id);
    await useBooksStore().deleteBook(plain.id);
  });

  it('get_translation_chunk 把过长的术语与角色说明截短并标明，首块不会因为大段剧情简介而过大', async () => {
    const base = createTestBook();
    const longText = '設'.repeat(300);
    const book = createTestBook({
      terminologies: [{ ...base.terminologies![0]!, description: longText }],
      characterSettings: [
        { ...base.characterSettings![0]!, description: longText },
        {
          id: 'char-near',
          name: 'アレクサンドラ',
          sex: 'female',
          description: longText,
          speakingStyle: '',
          translation: { id: 'ct-near', translation: '亚历珊德拉', aiModelId: 'm1' },
          aliases: [],
        },
      ],
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                {
                  id: 'p0000001',
                  text: 'アリスは月光石を手に、アレクサンドロを見た。',
                  selectedTranslationId: '',
                  translations: [],
                },
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Entity = {
      description?: string;
      description_truncated?: boolean;
      speaking_style?: string;
    };
    const res = await kernel.callTool(
      'get_translation_chunk',
      { book_id: book.id, chapter_id: 'ch-1' },
      { channel: 'desktop-mcp' },
    );
    expect(res.isError, res.text).toBe(false);
    const data = res.data as {
      matched_terms: Entity[];
      matched_characters: Entity[];
      possible_characters: Entity[];
    };
    for (const entity of [
      data.matched_terms[0]!,
      data.matched_characters[0]!,
      data.possible_characters[0]!,
    ]) {
      // 保留开头 150 个字并加省略号；标明被截短，Agent 修改说明前要先读全文
      expect(entity.description).toBe(`${'設'.repeat(150)}…`);
      expect(entity.description_truncated).toBe(true);
    }
    // 说话风格直接影响译文，不截短
    expect(data.matched_characters[0]!.speaking_style).toBe('礼貌温柔');

    // 说明不长时原样返回，也不带截短标记
    await useBooksStore().updateBook(book.id, {
      terminologies: base.terminologies!,
      characterSettings: base.characterSettings!,
    });
    const short = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1' },
        { channel: 'desktop-mcp' },
      )
    ).data as typeof data;
    expect(short.matched_terms[0]).toEqual({
      id: 'term-1',
      name: '月光石',
      translation: '月光石',
      description: '发光矿石',
    });
    expect(short.matched_characters[0]).not.toHaveProperty('description_truncated');
    expect(short.matched_characters[0]!.description).toBe('主角');
  });

  it('get_translation_chunk 每块最多 40 段，正好对应一次提交；max_paragraphs 可以调整', async () => {
    const base = createTestBook();
    const book = createTestBook({
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: Array.from({ length: 120 }, (_, i) => ({
                id: `q${String(i).padStart(7, '0')}`,
                text: `これは${i}行目の短い文です。`,
                selectedTranslationId: '',
                translations: [],
              })),
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Chunk = {
      has_more: boolean;
      next_cursor: number | null;
      paragraphs: Array<{ id: string; index: number }>;
    };
    const chunk = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-1', chunk_size: 50000, ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Chunk;
    };

    // 字符预算再大，一块也不超过 40 段：50 段时响应常超出客户端单次内联显示的上限
    const first = await chunk({});
    expect(first.paragraphs).toHaveLength(40);
    expect(first.has_more).toBe(true);

    // 整块一次提交后，下一块从第 41 段开始
    const submitted = await kernel.callTool(
      'submit_translations',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        paragraphs: first.paragraphs.map((p) => ({
          paragraph_id: p.id,
          translated_text: `译文${p.index}`,
        })),
      },
      { channel: 'desktop-mcp' },
    );
    expect((submitted.data as { saved_count: number }).saved_count).toBe(40);
    const second = await chunk({});
    expect(second.paragraphs[0]!.index).toBe(40);
    expect(second.paragraphs).toHaveLength(40);

    // mode="all" 同样受限，next_cursor 指向下一块的起点
    const review = await chunk({ mode: 'all' });
    expect(review.paragraphs).toHaveLength(40);
    expect(review.next_cursor).toBe(40);
    expect(review.has_more).toBe(true);

    // 可以调小或调大；超过上限时按 200 处理，非法值用默认值
    expect((await chunk({ mode: 'all', max_paragraphs: 20 })).paragraphs).toHaveLength(20);
    expect((await chunk({ mode: 'all', max_paragraphs: 80 })).paragraphs).toHaveLength(80);
    expect((await chunk({ mode: 'all', max_paragraphs: 9999 })).paragraphs).toHaveLength(120);
    expect((await chunk({ mode: 'all', max_paragraphs: 0 })).paragraphs).toHaveLength(40);
    expect((await chunk({ mode: 'all', max_paragraphs: 'abc' })).paragraphs).toHaveLength(40);

    // 字符预算更紧时仍以字符预算为准
    expect((await chunk({ mode: 'all', chunk_size: 1 })).paragraphs).toHaveLength(1);
  });

  it('get_translation_chunk 把章末剩下的几段并入最后一块，不单独留一个很小的尾块', async () => {
    const base = createTestBook();
    const bookWith = (texts: string[]) =>
      createTestBook({
        volumes: [
          {
            ...base.volumes![0]!,
            chapters: [
              {
                ...base.volumes![0]!.chapters![0]!,
                content: texts.map((text, i) => ({
                  id: `t${String(i).padStart(7, '0')}`,
                  text,
                  selectedTranslationId: '',
                  translations: [],
                })),
              },
            ],
          },
        ],
      });
    const short = (count: number) =>
      Array.from({ length: count }, (_, i) => `これは${i}行目の短い文です。`);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Chunk = {
      has_more: boolean;
      next_cursor: number | null;
      paragraphs: Array<{ id: string; index: number }>;
    };
    const chunk = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: base.id, chapter_id: 'ch-1', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Chunk;
    };

    // 85 段：第二块之后只剩 5 段，并入第二块（45 段），不再有第三块
    await useBooksStore().addBook(bookWith(short(85)));
    const first = await chunk({ mode: 'all' });
    expect(first.paragraphs).toHaveLength(40);
    expect(first.next_cursor).toBe(40);
    const last = await chunk({ mode: 'all', cursor: 40 });
    expect(last.paragraphs).toHaveLength(45);
    expect(last.has_more).toBe(false);
    expect(last.next_cursor).toBeNull();

    // untranslated 模式同理：提交第一块后，剩下的 45 段一次取完
    await kernel.callTool(
      'submit_translations',
      {
        book_id: base.id,
        chapter_id: 'ch-1',
        paragraphs: first.paragraphs.map((p) => ({
          paragraph_id: p.id,
          translated_text: `译文${p.index}`,
        })),
      },
      { channel: 'desktop-mcp' },
    );
    const rest = await chunk({});
    expect(rest.paragraphs).toHaveLength(45);
    expect(rest.has_more).toBe(false);

    // 显式的 max_paragraphs 同样适用，尾巴不超过它的两成
    expect((await chunk({ mode: 'all', cursor: 61, max_paragraphs: 20 })).paragraphs).toHaveLength(
      24,
    );
    expect((await chunk({ mode: 'all', cursor: 60, max_paragraphs: 20 })).paragraphs).toHaveLength(
      20,
    );
    // 段数上限很小时两成不足一段：不并入
    expect((await chunk({ mode: 'all', cursor: 80, max_paragraphs: 4 })).paragraphs).toHaveLength(
      4,
    );

    // 剩下 11 段超过两成：仍然单独成块
    await useBooksStore().deleteBook(base.id);
    await useBooksStore().addBook(bookWith(short(51)));
    expect((await chunk({ mode: 'all' })).paragraphs).toHaveLength(40);

    // 剩下的段数虽少但字数多（超过字符预算的三分之一）：不并入，避免响应过大
    await useBooksStore().deleteBook(base.id);
    await useBooksStore().addBook(
      bookWith([...short(40), ...Array.from({ length: 5 }, () => '長'.repeat(400))]),
    );
    const bounded = await chunk({ mode: 'all' });
    expect(bounded.paragraphs).toHaveLength(40);
    expect(bounded.has_more).toBe(true);
  });

  it('get_translation_chunk 的默认字符预算不超过 4000：长段落的文体不会因为书籍分块大小设得大而返回过大的块', async () => {
    const base = createTestBook();
    const longChapter = (translationChunkSize: number | undefined) =>
      createTestBook({
        translationChunkSize,
        volumes: [
          {
            ...base.volumes![0]!,
            chapters: [
              {
                ...base.volumes![0]!.chapters![0]!,
                // 40 段，每段 300 字，共 12000 字
                content: Array.from({ length: 40 }, (_, i) => ({
                  id: `L${String(i).padStart(7, '0')}`,
                  text: `${String(i).padStart(2, '0')}${'長'.repeat(298)}`,
                  selectedTranslationId: '',
                  translations: [],
                })),
              },
            ],
          },
        ],
      });
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const count = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: base.id, chapter_id: 'ch-1', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return (res.data as { paragraphs: unknown[] }).paragraphs.length;
    };

    // 书籍没有设置分块大小（站内默认 6000）：按 4000 收口，13 段 × 300 字 = 3900
    await useBooksStore().addBook(longChapter(undefined));
    expect(await count({})).toBe(13);
    expect(await count({ mode: 'all' })).toBe(13);
    // 明确传入 chunk_size 时按传入的值
    expect(await count({ chunk_size: 20000 })).toBe(40);

    // 书籍的分块大小是给站内翻译定的，设得再大也不放大外部 Agent 的块
    await useBooksStore().updateBook(base.id, { translationChunkSize: 20000 });
    expect(await count({})).toBe(13);

    // 书籍设得更小时按书籍的来
    await useBooksStore().updateBook(base.id, { translationChunkSize: 2000 });
    expect(await count({})).toBe(6);
  });

  it('get_translation_chunk 带出与前文同文的已译段落，回忆与首尾呼应的句子可以沿用原来的译法', async () => {
    const base = createTestBook();
    const firstChapter = base.volumes![0]!.chapters![0]!;
    const translated = (id: string, text: string, translation: string) => ({
      id,
      text,
      selectedTranslationId: `tr-${id}`,
      translations: [
        { id: `tr-${id}`, translation, aiModelId: 'builtin-model-1', language: 'zh-CN' as const },
      ],
    });
    const untranslated = (id: string, text: string) => ({
      id,
      text,
      selectedTranslationId: '',
      translations: [],
    });
    const vow = '父さんは言った。「剣は人を守るためにある」と。';
    const vowZh = '父亲说过：「剑是为了守护他人而存在的」。';
    const book = createTestBook({
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...firstChapter,
              id: 'ch-19',
              title: {
                original: '第19話 前篇',
                translation: { id: 'cht-19', translation: '第19话 前篇', aiModelId: '' },
              },
              content: [
                translated('pa000001', vow, vowZh),
                translated('pa000002', '「はい」', '「是」'),
                translated('pa000003', '夜明け前の空はまだ暗かった。', '黎明前的天空依然昏暗。'),
              ],
            },
            {
              ...firstChapter,
              id: 'ch-20',
              title: {
                original: '第20話 後篇',
                translation: { id: 'cht-20', translation: '', aiModelId: '' },
              },
              content: [
                untranslated('pb000001', '戦いは終わった。'),
                untranslated('pb000002', '「はい」'),
                // 行首缩进不同也算同文
                untranslated('pb000003', `\u3000${vow}`),
                translated('pb000004', '夜明け前の空はまだ暗かった。', '破晓前的天色仍旧漆黑。'),
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Chunk = {
      repeated_passages: Array<{
        paragraph_id: string;
        chapter_id: string;
        title_original: string;
        index: number;
        translation: string;
      }>;
    };
    const chunk = async (args: Record<string, unknown>) => {
      const res = await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-20', ...args },
        { channel: 'desktop-mcp' },
      );
      expect(res.isError, res.text).toBe(false);
      return res.data as Chunk;
    };

    // 翻译：只有够长的同文段落被列出，短句「はい」不算
    expect((await chunk({})).repeated_passages).toEqual([
      {
        paragraph_id: 'pb000003',
        chapter_id: 'ch-19',
        title_original: '第19話 前篇',
        index: 0,
        translation: vowZh,
      },
    ]);

    // 润色校对：同文段落现在的译文与前文不一致时列出，便于统一
    expect((await chunk({ mode: 'all' })).repeated_passages).toEqual([
      {
        paragraph_id: 'pb000003',
        chapter_id: 'ch-19',
        title_original: '第19話 前篇',
        index: 0,
        translation: vowZh,
      },
      {
        paragraph_id: 'pb000004',
        chapter_id: 'ch-19',
        title_original: '第19話 前篇',
        index: 2,
        translation: '黎明前的天空依然昏暗。',
      },
    ]);

    // 没有可取的段落时也带上这个字段
    const done = (
      await kernel.callTool(
        'get_translation_chunk',
        { book_id: book.id, chapter_id: 'ch-19' },
        { channel: 'desktop-mcp' },
      )
    ).data as Chunk & { completed: boolean };
    expect(done.completed).toBe(true);
    expect(done.repeated_passages).toEqual([]);
  });

  it('get_chapter_paragraphs 与 update_chapter_title 正常工作', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });

    const parasRes = await kernel.callTool(
      'get_chapter_paragraphs',
      { book_id: book.id, chapter_id: 'ch-1', keyword: '月光石', include_history: true },
      { channel: 'desktop-mcp' },
    );
    expect(parasRes.isError).toBe(false);
    const parasData = parasRes.data as { paragraphs: Array<{ id: string }> };
    expect(parasData.paragraphs.map((p) => p.id)).toEqual(['p0000002']);

    const titleRes = await kernel.callTool(
      'update_chapter_title',
      {
        book_id: book.id,
        chapter_id: 'ch-1',
        title_translation: '第一章 月光之夜',
        model_label: 'pi-agent',
      },
      { channel: 'desktop-mcp' },
    );
    expect(titleRes.isError).toBe(false);
    const freshTitle = useBooksStore().getBookById(book.id)!.volumes![0]!.chapters![0]!.title;
    expect(typeof freshTitle === 'object' && freshTitle.translation.translation).toBe(
      '第一章 月光之夜',
    );
  });

  it('get_chapter_paragraphs 可跳过空段落、从章节末尾读取，并给出继续读取的位置', async () => {
    const base = createTestBook();
    const blank = (id: string) => ({ id, text: '', selectedTranslationId: '', translations: [] });
    const line = (id: string, text: string) => ({
      id,
      text,
      selectedTranslationId: '',
      translations: [],
    });
    const book = createTestBook({
      volumes: [
        {
          ...base.volumes![0]!,
          chapters: [
            {
              ...base.volumes![0]!.chapters![0]!,
              content: [
                line('pc000001', '一'),
                blank('pc000002'),
                line('pc000003', '二'),
                blank('pc000004'),
                line('pc000005', '三'),
                blank('pc000006'),
                line('pc000007', '四'),
              ],
            },
          ],
        },
      ],
    });
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    type Result = {
      total_paragraphs: number;
      paragraphs: Array<{ index: number; text: string }>;
      has_more: boolean;
      next_start_index: number | null;
    };
    const call = async (args: Record<string, unknown>) =>
      (
        await kernel.callTool(
          'get_chapter_paragraphs',
          { book_id: book.id, chapter_id: 'ch-1', ...args },
          { channel: 'desktop-mcp' },
        )
      ).data as Result;

    // 默认行为不变：空段落也算一条
    const plain = await call({ limit: 3 });
    expect(plain.paragraphs.map((p) => p.text)).toEqual(['一', '', '二']);
    expect(plain.has_more).toBe(true);
    expect(plain.next_start_index).toBe(3);

    // 跳过空段落：limit 只数有内容的段落
    const skipped = await call({ limit: 3, skip_empty: true });
    expect(skipped.paragraphs.map((p) => [p.index, p.text])).toEqual([
      [0, '一'],
      [2, '二'],
      [4, '三'],
    ]);
    expect(skipped.has_more).toBe(true);
    expect(skipped.next_start_index).toBe(5);
    const rest = await call({ limit: 3, skip_empty: true, start_index: skipped.next_start_index });
    expect(rest.paragraphs.map((p) => p.text)).toEqual(['四']);
    expect(rest.has_more).toBe(false);
    expect(rest.next_start_index).toBeNull();

    // 从末尾读取：返回最后几段，仍按原文顺序
    const tail = await call({ limit: 2, skip_empty: true, from_end: true });
    expect(tail.paragraphs.map((p) => [p.index, p.text])).toEqual([
      [4, '三'],
      [6, '四'],
    ]);
    expect(tail.has_more).toBe(true);
    expect(tail.total_paragraphs).toBe(7);
  });

  it('get_chapter_paragraphs 的关键词过滤可选模糊匹配', async () => {
    const book = createTestBook();
    await useBooksStore().addBook(book);
    const kernel = createAgentMcpKernel({ tools: agentMcpTranslationTools });
    const call = async (args: Record<string, unknown>) =>
      (
        await kernel.callTool(
          'get_chapter_paragraphs',
          { book_id: book.id, chapter_id: 'ch-1', ...args },
          { channel: 'desktop-mcp' },
        )
      ).data as { paragraphs: Array<{ id: string }> };

    // 原文是「机の上には月光石が輝いていた。」，查询里把「輝」写成了「光」
    expect((await call({ keyword: '月光石が光いていた' })).paragraphs).toEqual([]);
    expect(
      (await call({ keyword: '月光石が光いていた', fuzzy: true })).paragraphs.map((p) => p.id),
    ).toEqual(['p0000002']);
  });
});
