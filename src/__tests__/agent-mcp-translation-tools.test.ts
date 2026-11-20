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
