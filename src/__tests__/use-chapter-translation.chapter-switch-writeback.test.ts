import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { ref, computed, type Ref } from 'vue';
import type { Novel, Chapter, Paragraph } from 'src/models/novel';
import { useChapterTranslation } from 'src/composables/book-details/useChapterTranslation';
import { ChapterService } from 'src/services/chapter-service';
import { TranslationService } from 'src/services/ai';
import * as BooksStore from 'src/stores/books';
import * as AIModelsStore from 'src/stores/ai-models';
import * as AIProcessingStore from 'src/stores/ai-processing';
import * as ToastHistory from 'src/composables/useToastHistory';

function createChapter(id: string, paragraphs?: Paragraph[]): Chapter {
  return {
    id,
    title: {
      original: `Chapter ${id}`,
      translation: { id: 't0', translation: '', aiModelId: '' },
    },
    content: paragraphs,
    contentLoaded: Array.isArray(paragraphs),
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

function createDeferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useChapterTranslation - 切换章节时也能写回段落翻译', () => {
  const toastAdd = mock(() => {});
  const updateBook = mock(async () => {});
  const saveChapterContent = mock(() => Promise.resolve());
  const getBookByIdMock = mock((id?: string): Novel | null => null);

  const getDefaultModelForTask = mock(() => ({
    id: 'model-1',
    name: 'Test Model',
    provider: 'openai',
    model: 'gpt-4.1-mini',
    enabled: true,
    apiKey: '',
    baseUrl: '',
    isDefault: { translation: { temperature: 0.7 } },
  }));

  const aiProcessing = {
    activeTasks: [],
    addTask: mock(() => Promise.resolve('task-1')),
    updateTask: mock(async () => {}),
    appendThinkingMessage: mock(async () => {}),
    appendOutputContent: mock(async () => {}),
    removeTask: mock(async () => {}),
    stopTask: mock(async () => {}),
  };

  beforeEach(() => {
    toastAdd.mockClear();
    updateBook.mockClear();
    saveChapterContent.mockClear();
    getDefaultModelForTask.mockClear();
    getBookByIdMock.mockClear();
    getBookByIdMock.mockImplementation(() => null);

    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: toastAdd } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      updateBook,
      getBookById: getBookByIdMock,
    } as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ getDefaultModelForTask } as any);
    spyOn(AIProcessingStore, 'useAIProcessingStore').mockReturnValue(aiProcessing as any);

    spyOn(ChapterService, 'saveChapterContent').mockImplementation(saveChapterContent);
  });

  afterEach(() => {
    mock.restore();
  });

  it('翻译过程中切到别的章节（并清空原章节 content）时，仍能把翻译写回到目标章节', async () => {
    const p1: Paragraph = { id: 'p1', text: '原文1', translations: [], selectedTranslationId: '' };
    const chapterA: Chapter = createChapter('chapter-a', [p1]);
    const chapterB: Chapter = createChapter('chapter-b', [
      { id: 'p2', text: '原文2', translations: [], selectedTranslationId: '' },
    ]);

    const book: Ref<Novel | undefined> = ref({
      id: 'book-1',
      title: 'Book',
      volumes: [
        {
          id: 'v1',
          title: { original: 'V1', translation: { id: 'vt0', translation: '', aiModelId: '' } },
          chapters: [chapterA, chapterB],
        },
      ],
      createdAt: new Date(),
      lastEdited: new Date(),
    });

    getBookByIdMock.mockImplementation(() => book.value || null);

    const selectedChapter = ref<Chapter | null>(chapterA);
    const selectedChapterWithContent = ref<Chapter | null>(chapterA);
    const selectedChapterParagraphs = computed(
      () => selectedChapterWithContent.value?.content || [],
    );

    const updateSelectedChapterWithContent = mock(() => {});
    const handleActionInfoToast = mock(() => {});
    const countUniqueActions = mock(() => ({ terms: 0, characters: 0 }));
    const saveState = mock(() => {});

    // 模拟：用户切换章节时把旧章节的 content 卸载掉
    const unloadChapterAContent = () => {
      const vol = book.value?.volumes?.[0];
      const ch = vol?.chapters?.find((c) => c.id === chapterA.id);
      if (ch) {
        ch.content = undefined;
        ch.contentLoaded = false;
      }
    };

    // 当需要懒加载章节内容时，返回"从独立存储加载的内容"
    spyOn(ChapterService, 'loadChapterContent').mockImplementation((ch) => {
      if (ch.id !== chapterA.id)
        return Promise.resolve({ ...ch, content: [], contentLoaded: true });
      return Promise.resolve({ ...ch, content: [p1], contentLoaded: true });
    });

    // Mock 翻译服务：在 onParagraphTranslation 触发前，先把用户的 UI 选择切到 chapterB
    spyOn(TranslationService, 'translate').mockImplementation(async (_content, _model, options) => {
      selectedChapter.value = chapterB;
      selectedChapterWithContent.value = chapterB;
      unloadChapterAContent();

      await options?.onParagraphTranslation?.([{ id: 'p1', translation: '翻译1' }]);
      return { text: '', paragraphTranslations: [{ id: 'p1', translation: '翻译1' }] };
    });

    const { translateAllParagraphs } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    await translateAllParagraphs();

    // UI 仍然停留在 chapterB（不应被 chapterA 的增量写回覆盖）
    expect(selectedChapterWithContent.value?.id).toBe(chapterB.id);

    // 写回发生：先保存章节内容，再仅更新 lastEdited（不再传 volumes 快照）
    expect(saveChapterContent).toHaveBeenCalled();
    const saveCalls = saveChapterContent.mock.calls as unknown as Array<[Chapter]>;
    const savedChapter = saveCalls[0]?.[0];
    expect(savedChapter).toBeTruthy();
    if (!savedChapter) {
      return;
    }
    expect(savedChapter.id).toBe(chapterA.id);
    const savedP1 = savedChapter.content?.find((p) => p.id === 'p1');
    expect(savedP1?.selectedTranslationId).toBeTruthy();
    expect(savedP1?.translations?.some((t) => t.translation === '翻译1')).toBe(true);

    expect(updateBook).toHaveBeenCalled();
    const lastCall = updateBook.mock.calls[updateBook.mock.calls.length - 1] as unknown as [
      string,
      Partial<Novel>,
    ];
    const [, updates] = lastCall;
    expect(updates.lastEdited).toBeInstanceOf(Date);
    expect(updates.volumes).toBeUndefined();
  });

  it('多章节并发翻译时，应分别保存各章节内容且仅更新元数据', async () => {
    const chapterA: Chapter = createChapter('chapter-a', [
      { id: 'a-1', text: '原文A1', translations: [], selectedTranslationId: '' },
    ]);
    const chapterB: Chapter = createChapter('chapter-b', [
      { id: 'b-1', text: '原文B1', translations: [], selectedTranslationId: '' },
    ]);

    const book: Ref<Novel | undefined> = ref({
      id: 'book-1',
      title: 'Book',
      volumes: [
        {
          id: 'v1',
          title: { original: 'V1', translation: { id: 'vt0', translation: '', aiModelId: '' } },
          chapters: [chapterA, chapterB],
        },
      ],
      createdAt: new Date(),
      lastEdited: new Date(),
    });

    getBookByIdMock.mockImplementation(() => book.value || null);

    const selectedChapterA = ref<Chapter | null>(chapterA);
    const selectedChapterWithContentA = ref<Chapter | null>(chapterA);
    const selectedChapterParagraphsA = computed(
      () => selectedChapterWithContentA.value?.content || [],
    );

    const selectedChapterB = ref<Chapter | null>(chapterB);
    const selectedChapterWithContentB = ref<Chapter | null>(chapterB);
    const selectedChapterParagraphsB = computed(
      () => selectedChapterWithContentB.value?.content || [],
    );

    const aChunkApplied = createDeferred<void>();
    const continueA = createDeferred<void>();

    spyOn(TranslationService, 'translate').mockImplementation(async (_content, _model, options) => {
      const chapterId = options?.chapterId;
      if (chapterId === 'chapter-a') {
        await options?.onParagraphTranslation?.([{ id: 'a-1', translation: '翻译A1' }]);
        aChunkApplied.resolve();
        await continueA.promise;
        return { text: '', paragraphTranslations: [{ id: 'a-1', translation: '翻译A1' }] };
      }

      await aChunkApplied.promise;
      await options?.onParagraphTranslation?.([{ id: 'b-1', translation: '翻译B1' }]);
      continueA.resolve();
      return { text: '', paragraphTranslations: [{ id: 'b-1', translation: '翻译B1' }] };
    });

    const commonDeps = {
      updateSelectedChapterWithContent: mock(() => {}),
      handleActionInfoToast: mock(() => {}),
      countUniqueActions: mock(() => ({ terms: 0, characters: 0 })),
      saveState: mock(() => {}),
    };

    const translationA = useChapterTranslation(
      book,
      selectedChapterA,
      selectedChapterWithContentA,
      selectedChapterParagraphsA,
      commonDeps.updateSelectedChapterWithContent,
      commonDeps.handleActionInfoToast,
      commonDeps.countUniqueActions,
      commonDeps.saveState,
    );

    const translationB = useChapterTranslation(
      book,
      selectedChapterB,
      selectedChapterWithContentB,
      selectedChapterParagraphsB,
      commonDeps.updateSelectedChapterWithContent,
      commonDeps.handleActionInfoToast,
      commonDeps.countUniqueActions,
      commonDeps.saveState,
    );

    await Promise.all([
      translationA.translateAllParagraphs(),
      translationB.translateAllParagraphs(),
    ]);

    const savedCalls = saveChapterContent.mock.calls as unknown as Array<[Chapter]>;
    const savedChapterIds = savedCalls.map(([chapter]) => chapter.id);
    expect(savedChapterIds).toContain('chapter-a');
    expect(savedChapterIds).toContain('chapter-b');

    const savedA = savedCalls.find(([chapter]) => chapter.id === 'chapter-a')?.[0];
    const savedB = savedCalls.find(([chapter]) => chapter.id === 'chapter-b')?.[0];
    expect(savedA?.content?.[0]?.translations?.some((t) => t.translation === '翻译A1')).toBe(true);
    expect(savedB?.content?.[0]?.translations?.some((t) => t.translation === '翻译B1')).toBe(true);

    const updateCalls = updateBook.mock.calls as unknown as Array<[string, Partial<Novel>]>;
    expect(updateCalls.length).toBeGreaterThan(0);
    for (const [, updates] of updateCalls) {
      expect(updates.lastEdited).toBeInstanceOf(Date);
      expect(updates.volumes).toBeUndefined();
    }
  });
});
