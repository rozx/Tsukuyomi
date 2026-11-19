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
});
