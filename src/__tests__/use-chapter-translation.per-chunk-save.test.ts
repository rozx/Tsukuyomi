import { describe, expect, it, mock, beforeEach, spyOn, afterEach } from 'bun:test';
import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { useChapterTranslation } from '../composables/book-details/useChapterTranslation';
import type { Novel, Chapter, Paragraph } from '../models/novel';
import { ChapterService } from '../services/chapter-service';
import { TranslationService } from '../services/ai';
import * as BooksStore from '../stores/books';
import * as ToastHistory from 'src/composables/useToastHistory';
import * as AIModelsStore from 'src/stores/ai-models';
import * as AIProcessingStore from 'src/stores/ai-processing';
import * as UiStore from 'src/stores/ui';

/**
 * 回归测试：整章翻译必须"每个 chunk 立即落盘"，而不是等整个任务结束才保存。
 *
 * Bug 背景：translateAllParagraphs 曾使用 skipSave 模式把所有 chunk 的译文只写内存，
 * 直到任务收尾（finally → batchSaveChapter）才落盘一次。用户"中途停止翻译 + 立刻刷新"
 * 会落在无保存窗口内，整章译文无声丢失。
 */

const mockToastAdd = mock(() => {});
const mockUpdateBook = mock(() => Promise.resolve());

function createParagraph(id: string, text: string): Paragraph {
  return { id, text, selectedTranslationId: '', translations: [] };
}

function createChapter(id: string, paragraphs: Paragraph[]): Chapter {
  return {
    id,
    title: '第一章',
    content: paragraphs,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

function createNovel(chapters: Chapter[]): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    volumes: [{ id: 'volume-1', title: '第一卷', chapters }],
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

describe('useChapterTranslation - 整章翻译按 chunk 落盘', () => {
  let book: Ref<Novel | undefined>;
  let selectedChapter: Ref<Chapter | null>;
  let selectedChapterWithContent: Ref<Chapter | null>;
  let selectedChapterParagraphs: ComputedRef<Paragraph[]>;
  let novel: Novel;
  let chapter: Chapter;
  let saveChapterContentSpy: ReturnType<typeof spyOn>;

  const setupComposable = () => {
    return useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      mock(() => {}),
      mock(() => {}),
      mock(() => ({ terms: 0, characters: 0 })),
      mock(() => {}),
    );
  };

  beforeEach(() => {
    chapter = createChapter('chapter-1', [
      createParagraph('para-1', '一つ目の段落です。'),
      createParagraph('para-2', '二つ目の段落です。'),
    ]);
    novel = createNovel([chapter]);

    book = ref<Novel | undefined>(novel);
    selectedChapter = ref<Chapter | null>(chapter);
    selectedChapterWithContent = ref<Chapter | null>(chapter);
    selectedChapterParagraphs = computed(() => chapter.content || []);

    mockToastAdd.mockClear();
    mockUpdateBook.mockClear();

    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: mockToastAdd } as never);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      updateBook: mockUpdateBook,
      getBookById: mock(() => novel),
    } as never);
    const mockModel = {
      id: 'model-1',
      name: 'Test Model',
      provider: 'openai',
      model: 'gpt-4',
    };
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({
      getDefaultModelForTask: mock(() => mockModel),
      getModelForTask: mock(() => mockModel),
    } as never);
    spyOn(AIProcessingStore, 'useAIProcessingStore').mockReturnValue({
      activeTasks: [],
      stopTask: mock(() => Promise.resolve()),
      addTask: mock(() => Promise.resolve('task-1')),
      updateTask: mock(() => Promise.resolve()),
      appendThinkingMessage: mock(() => Promise.resolve()),
      appendOutputContent: mock(() => Promise.resolve()),
      removeTask: mock(() => Promise.resolve()),
    } as never);
    spyOn(UiStore, 'useUiStore').mockReturnValue({
      setActiveRightTab: mock(() => {}),
    } as never);

    saveChapterContentSpy = spyOn(ChapterService, 'saveChapterContent').mockImplementation(() =>
      Promise.resolve(),
    );
  });

  afterEach(() => {
    mock.restore();
  });

  it('每个 chunk 的段落回调完成后必须已把章节内容落盘（而不是等任务收尾）', async () => {
    let savedCallsAfterChunk1 = -1;
    let savedContentAfterChunk1: Paragraph[] | undefined;

    spyOn(TranslationService, 'translate').mockImplementation(
      (async (_paragraphs: Paragraph[], _model: unknown, options: never) => {
        const opts = options as {
          onParagraphTranslation?: (t: { id: string; translation: string }[]) => Promise<void>;
        };
        // 模拟第一个 chunk 返回译文
        await opts.onParagraphTranslation?.([{ id: 'para-1', translation: '第一段译文' }]);
        // 关键断言点：chunk 1 回调 resolve 之后，落盘必须已经发生
        savedCallsAfterChunk1 = saveChapterContentSpy.mock.calls.length;
        const lastCall = saveChapterContentSpy.mock.calls.at(-1) as unknown as
          | [Chapter, string]
          | undefined;
        savedContentAfterChunk1 = lastCall?.[0]?.content;

        // 模拟第二个 chunk
        await opts.onParagraphTranslation?.([{ id: 'para-2', translation: '第二段译文' }]);
        return { text: '', actions: [] };
      }) as never,
    );

    const { translateAllParagraphs } = setupComposable();
    await translateAllParagraphs();

    // chunk 1 完成后必须已经至少落盘一次（旧实现为 0，任务结束才保存）
    expect(savedCallsAfterChunk1).toBeGreaterThanOrEqual(1);
    // 且落盘内容里必须包含 chunk 1 的译文
    const para1 = savedContentAfterChunk1?.find((p) => p.id === 'para-1');
    expect(para1?.translations?.some((t) => t.translation === '第一段译文')).toBe(true);
  });

  it('翻译中途抛出（如用户停止）时，已完成 chunk 的译文必须已经落盘', async () => {
    let savedCallsBeforeAbort = -1;

    spyOn(TranslationService, 'translate').mockImplementation(
      (async (_paragraphs: Paragraph[], _model: unknown, options: never) => {
        const opts = options as {
          onParagraphTranslation?: (t: { id: string; translation: string }[]) => Promise<void>;
        };
        await opts.onParagraphTranslation?.([{ id: 'para-1', translation: '第一段译文' }]);
        savedCallsBeforeAbort = saveChapterContentSpy.mock.calls.length;
        throw new Error('请求已取消');
      }) as never,
    );

    const { translateAllParagraphs } = setupComposable();
    await translateAllParagraphs();

    // 在异常抛出之前（即 finally 兜底保存之前），chunk 1 必须已经落盘
    expect(savedCallsBeforeAbort).toBeGreaterThanOrEqual(1);
  });
});
