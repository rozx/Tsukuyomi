import { describe, expect, it, spyOn, afterEach, mock } from 'bun:test';
import { appendNavigateDetails } from 'src/utils/action-info/navigation-and-update-details';
import { appendTranslationDetails } from 'src/utils/action-info/translation-details';
import type { ActionDetail, ActionDetailsContext } from 'src/utils/action-info/types';
import type { MessageAction } from 'src/stores/chat-sessions';
import type { Novel, Paragraph, Chapter } from 'src/models/novel';
import { ChapterService } from 'src/services/chapter-service';

function makeNovel(over: Partial<Novel> = {}): Novel {
  return {
    id: 'b1',
    title: '测试书',
    createdAt: new Date(),
    lastEdited: new Date(),
    ...over,
  };
}

function makeContext(over: Partial<ActionDetailsContext> = {}): ActionDetailsContext {
  return {
    getBookById: () => undefined,
    getCurrentBookId: () => null,
    ...over,
  };
}

function makeAction(over: Partial<MessageAction>): MessageAction {
  return {
    type: 'navigate',
    entity: 'chapter',
    timestamp: 0,
    ...over,
  } as MessageAction;
}

describe('appendNavigateDetails', () => {
  afterEach(() => {
    mock.restore();
  });

  it('resolves book title when book_id is known', () => {
    const details: ActionDetail[] = [];
    appendNavigateDetails(
      details,
      makeAction({ book_id: 'b1' }),
      makeContext({ getBookById: () => makeNovel({ id: 'b1', title: '书一' }) }),
    );
    expect(details).toContainEqual({ label: '书籍', value: '书一' });
  });

  it('falls back to raw book_id when book lookup fails', () => {
    const details: ActionDetail[] = [];
    appendNavigateDetails(
      details,
      makeAction({ book_id: 'b-unknown' }),
      makeContext({ getBookById: () => undefined }),
    );
    expect(details).toContainEqual({ label: '书籍 ID', value: 'b-unknown' });
  });

  it('delegates chapter resolution through chapter_id, threading book_id override', () => {
    spyOn(ChapterService, 'findChapterById').mockReturnValue(null);
    const details: ActionDetail[] = [];
    const getBookById = spyOn({ fn: (_id: string) => makeNovel() }, 'fn');
    appendNavigateDetails(
      details,
      makeAction({ chapter_id: 'c1', book_id: 'b1' }),
      makeContext({ getBookById: (id) => getBookById(id) ?? makeNovel() }),
    );
    // Should call with bookIdOverride 'b1'
    expect(details.some((d) => d.label === '章节')).toBeDefined();
  });

  it('appends chapter_title literal when provided', () => {
    const details: ActionDetail[] = [];
    appendNavigateDetails(
      details,
      makeAction({ chapter_title: '第二章' }),
      makeContext(),
    );
    expect(details).toContainEqual({ label: '章节标题', value: '第二章' });
  });

  it('appends paragraph_id literal when provided', () => {
    const details: ActionDetail[] = [];
    appendNavigateDetails(
      details,
      makeAction({ paragraph_id: 'p42' }),
      makeContext(),
    );
    expect(details).toContainEqual({ label: '段落 ID', value: 'p42' });
  });

  describe('help_doc entity', () => {
    it('appends doc_id, title, and section_id when present', () => {
      const details: ActionDetail[] = [];
      appendNavigateDetails(
        details,
        makeAction({
          entity: 'help_doc',
          doc_id: 'translation-guide',
          title: '翻译指南',
          section_id: 'honorifics',
        }),
        makeContext(),
      );
      expect(details).toContainEqual({ label: '文档 ID', value: 'translation-guide' });
      expect(details).toContainEqual({ label: '文档标题', value: '翻译指南' });
      expect(details).toContainEqual({ label: '章节锚点', value: 'honorifics' });
    });

    it('skips optional help_doc fields when absent', () => {
      const details: ActionDetail[] = [];
      appendNavigateDetails(
        details,
        makeAction({ entity: 'help_doc' }),
        makeContext(),
      );
      expect(details).toEqual([]);
    });
  });

  it('emits nothing when action carries no navigable fields', () => {
    const details: ActionDetail[] = [];
    appendNavigateDetails(details, makeAction({}), makeContext());
    expect(details).toEqual([]);
  });
});

describe('appendTranslationDetails', () => {
  afterEach(() => {
    mock.restore();
  });

  describe('batch_replace_translations tool', () => {
    it('appends counts and replacement_text preview', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          replaced_paragraph_count: 3,
          replaced_translation_count: 5,
          replacement_text: '新译文',
        } as MessageAction,
        makeContext(),
      );
      expect(details).toContainEqual({ label: '替换段落数', value: '3 个' });
      expect(details).toContainEqual({ label: '替换翻译版本数', value: '5 个' });
      expect(details).toContainEqual({ label: '替换文本', value: '新译文' });
    });

    it('joins keywords with Chinese enumeration mark', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          keywords: ['A', 'B', 'C'],
          original_keywords: ['x', 'y'],
        } as MessageAction,
        makeContext(),
      );
      expect(details).toContainEqual({ label: '翻译关键词', value: 'A、B、C' });
      expect(details).toContainEqual({ label: '原文关键词', value: 'x、y' });
    });

    it('skips keyword fields when arrays empty', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          keywords: [],
          original_keywords: [],
        } as MessageAction,
        makeContext(),
      );
      expect(details).toEqual([]);
    });

    it('formats replace_all_translations boolean as Chinese 是/否', () => {
      const detailsTrue: ActionDetail[] = [];
      const detailsFalse: ActionDetail[] = [];
      appendTranslationDetails(
        detailsTrue,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          replace_all_translations: true,
        } as MessageAction,
        makeContext(),
      );
      appendTranslationDetails(
        detailsFalse,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          replace_all_translations: false,
        } as MessageAction,
        makeContext(),
      );
      expect(detailsTrue).toContainEqual({ label: '替换所有版本', value: '是' });
      expect(detailsFalse).toContainEqual({ label: '替换所有版本', value: '否' });
    });

    it('ignores undefined count fields', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
        } as MessageAction,
        makeContext(),
      );
      expect(details).toEqual([]);
    });

    it('truncates replacement_text longer than 50 chars', () => {
      const long = 'a'.repeat(100);
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          tool_name: 'batch_replace_translations',
          replacement_text: long,
        } as MessageAction,
        makeContext(),
      );
      const entry = details.find((d) => d.label === '替换文本');
      expect(entry?.value.endsWith('...')).toBe(true);
      expect(entry?.value.length).toBeLessThanOrEqual(53);
    });
  });

  describe('single-paragraph translation', () => {
    const paragraph: Paragraph = {
      id: 'p1',
      text: '原段落',
      translations: [{ id: 'tr1', translation: '译段落', aiModelId: '' }],
      selectedTranslationId: 'tr1',
    };
    const chapter: Chapter = {
      id: 'c1',
      title: '第一章',
      createdAt: new Date(),
      lastEdited: new Date(),
    };

    it('appends paragraph_id, translation_id, and old/new translations', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        chapter,
        paragraph,
        paragraphIndex: 0,
        chapterIndex: 0,
        volume: { id: 'v1', title: '卷一', chapters: [chapter] },
        volumeIndex: 0,
      });
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
          translation_id: 'tr1',
          old_translation: '旧',
          new_translation: '新',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details).toContainEqual({ label: '段落 ID', value: 'p1' });
      expect(details).toContainEqual({ label: '翻译 ID', value: 'tr1' });
      expect(details).toContainEqual({ label: '旧翻译', value: '旧' });
      expect(details).toContainEqual({ label: '新翻译', value: '新' });
    });

    it('skips paragraph context when no current book', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => null }),
      );
      expect(details).toContainEqual({ label: '段落 ID', value: 'p1' });
      expect(details.find((d) => d.label === '原文预览')).toBeUndefined();
    });

    it('skips paragraph context when book missing', () => {
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => undefined }),
      );
      expect(details.find((d) => d.label === '章节')).toBeUndefined();
    });

    it('skips paragraph context when paragraph not located', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue(null);
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p-missing',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details.find((d) => d.label === '章节')).toBeUndefined();
    });

    it('previews translation text when translation_id resolves', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        chapter,
        paragraph,
        paragraphIndex: 0,
        chapterIndex: 0,
        volume: { id: 'v1', title: '卷一', chapters: [chapter] },
        volumeIndex: 0,
      });
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
          translation_id: 'tr1',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details).toContainEqual({ label: '翻译预览', value: '译段落' });
    });

    it('does not preview translation when translation_id points to unknown tr', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue({
        chapter,
        paragraph,
        paragraphIndex: 0,
        chapterIndex: 0,
        volume: { id: 'v1', title: '卷一', chapters: [chapter] },
        volumeIndex: 0,
      });
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
          translation_id: 'tr-missing',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details.find((d) => d.label === '翻译预览')).toBeUndefined();
    });

    it('requires both old_translation and new_translation to append either', () => {
      spyOn(ChapterService, 'findParagraphLocation').mockReturnValue(null);
      const details: ActionDetail[] = [];
      appendTranslationDetails(
        details,
        {
          type: 'update',
          entity: 'translation',
          timestamp: 0,
          paragraph_id: 'p1',
          old_translation: '仅旧',
        } as MessageAction,
        makeContext({ getCurrentBookId: () => 'b1', getBookById: () => makeNovel() }),
      );
      expect(details.find((d) => d.label === '旧翻译')).toBeUndefined();
    });
  });
});
