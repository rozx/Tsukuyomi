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

describe('useChapterTranslation - 切换章节时也能写回段落翻译', () => {
  const toastAdd = mock(() => {});
  const updateBook = mock(async () => {});

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
    addTask: mock(async () => 'task-1'),
    updateTask: mock(async () => {}),
    appendThinkingMessage: mock(async () => {}),
    appendOutputContent: mock(async () => {}),
    removeTask: mock(async () => {}),
    stopTask: mock(async () => {}),
  };

  beforeEach(() => {
    toastAdd.mockClear();
    updateBook.mockClear();
    getDefaultModelForTask.mockClear();

    spyOn(ToastHistory, 'useToastWithHistory').mockReturnValue({ add: toastAdd } as any);
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({ updateBook, getBookById: mock(() => null) } as any);
    spyOn(AIModelsStore, 'useAIModelsStore').mockReturnValue({ getDefaultModelForTask } as any);
    spyOn(AIProcessingStore, 'useAIProcessingStore').mockReturnValue(aiProcessing as any);

    spyOn(ChapterService, 'saveChapterContent').mockImplementation(async () => {});
  });

  afterEach(() => {
    mock.restore();
  });

  it('翻译过程中切到别的章节（并清空原章节 content）时，仍能把翻译写回到目标章节', async () => {
    const p1: Paragraph = { id: 'p1', text: '原文1', translations: [], selectedTranslationId: '' };
    const chapterA: Chapter = createChapter('chapter-a', [p1]);
    const chapterB: Chapter = createChapter('chapter-b', [{ id: 'p2', text: '原文2', translations: [], selectedTranslationId: '' }]);

    const book: Ref<Novel | undefined> = ref({
      id: 'book-1',
      title: 'Book',
      volumes: [{ id: 'v1', title: { original: 'V1', translation: { id: 'vt0', translation: '', aiModelId: '' } }, chapters: [chapterA, chapterB] }],
      createdAt: new Date(),
      lastEdited: new Date(),
    });

    const selectedChapter = ref<Chapter | null>(chapterA);
    const selectedChapterWithContent = ref<Chapter | null>(chapterA);
    const selectedChapterParagraphs = computed(() => selectedChapterWithContent.value?.content || []);

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

    // 当需要懒加载章节内容时，返回“从独立存储加载的内容”
    spyOn(ChapterService, 'loadChapterContent').mockImplementation(async (ch) => {
      if (ch.id !== chapterA.id) return { ...ch, content: [], contentLoaded: true };
      return { ...ch, content: [p1], contentLoaded: true };
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

    // 写回发生：updateBook 被调用，且 volumes 中 chapterA 的段落 p1 有翻译
    expect(updateBook).toHaveBeenCalled();
    const lastCall = updateBook.mock.calls[updateBook.mock.calls.length - 1];
    const [, updates] = lastCall!;
    const updatedChapterA = (updates.volumes as any)[0].chapters.find((c: any) => c.id === chapterA.id);
    expect(updatedChapterA).toBeTruthy();
    expect(updatedChapterA.content).toBeTruthy();
    const updatedP1 = updatedChapterA.content.find((p: any) => p.id === 'p1');
    expect(updatedP1.selectedTranslationId).toBeTruthy();
    expect(updatedP1.translations.some((t: any) => t.translation === '翻译1')).toBe(true);
  });
});


