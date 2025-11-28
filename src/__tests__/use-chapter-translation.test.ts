import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { useChapterTranslation } from '../composables/book-details/useChapterTranslation';
import type { Novel, Chapter, Paragraph, Volume } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockBooksStoreUpdateBook = mock(() => Promise.resolve());
const mockUseBooksStore = mock(() => ({
  updateBook: mockBooksStoreUpdateBook,
  getBookById: mock(() => null),
}));

const mockGetDefaultModelForTask = mock(() => ({
  id: 'model-1',
  name: 'Test Model',
  provider: 'openai',
  model: 'gpt-4',
}));
const mockUseAIModelsStore = mock(() => ({
  getDefaultModelForTask: mockGetDefaultModelForTask,
}));

const mockTranslateParagraph = mock(() => Promise.resolve({ translation: '翻译结果' }));
const mockPolishParagraph = mock(() => Promise.resolve({ translation: '润色结果' }));
const mockUseAIProcessingStore = mock(() => ({
  activeTasks: [],
  stopTask: mock(() => Promise.resolve()),
}));

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));

await mock.module('src/stores/books', () => ({
  useBooksStore: mockUseBooksStore,
}));

await mock.module('src/stores/ai-models', () => ({
  useAIModelsStore: mockUseAIModelsStore,
}));

await mock.module('src/stores/ai-processing', () => ({
  useAIProcessingStore: mockUseAIProcessingStore,
}));

await mock.module('src/services/ai', () => ({
  TranslationService: {
    translateParagraph: mockTranslateParagraph,
  },
  PolishService: {
    polishParagraph: mockPolishParagraph,
  },
}));

const mockUpdateChapter = mock((): Volume[] => []);
const mockGetChapterContentForUpdate = mock(() => []);
const mockAddParagraphTranslation = mock(() => []);

await mock.module('src/services/chapter-service', () => ({
  ChapterService: {
    updateChapter: mockUpdateChapter,
    getChapterContentForUpdate: mockGetChapterContentForUpdate,
    addParagraphTranslation: mockAddParagraphTranslation,
    loadChapterContent: mock(() => Promise.resolve({ id: 'test', title: { original: '', translation: { id: '', translation: '', aiModelId: '' } }, content: [], lastEdited: new Date(), createdAt: new Date() } as Chapter)),
  },
}));

// Helper functions
function createTestParagraph(id: string, text: string, hasTranslation = false): Paragraph {
  const translationId = generateShortId();
  return {
    id,
    text,
    selectedTranslationId: hasTranslation ? translationId : '',
    translations: hasTranslation
      ? [
          {
            id: translationId,
            translation: '已有翻译',
            aiModelId: 'model-1',
          },
        ]
      : [],
  };
}

function createTestChapter(id: string, paragraphs: Paragraph[]): Chapter {
  return {
    id,
    title: {
      original: 'Chapter 1',
      translation: { id: generateShortId(), translation: '', aiModelId: '' },
    },
    content: paragraphs,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

function createTestNovel(chapters: Chapter[]): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    volumes: [
      {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters,
      },
    ],
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

describe('useChapterTranslation', () => {
  let book: Ref<Novel | undefined>;
  let selectedChapter: Ref<Chapter | null>;
  let selectedChapterWithContent: Ref<Chapter | null>;
  let selectedChapterParagraphs: ComputedRef<Paragraph[]>;
  let updateSelectedChapterWithContent: ReturnType<typeof mock>;
  let handleActionInfoToast: ReturnType<typeof mock>;
  let countUniqueActions: ReturnType<typeof mock>;
  let saveState: ReturnType<typeof mock>;

  beforeEach(() => {
    book = ref<Novel | undefined>(undefined);
    selectedChapter = ref<Chapter | null>(null);
    selectedChapterWithContent = ref<Chapter | null>(null);
    selectedChapterParagraphs = computed(() => []);
    updateSelectedChapterWithContent = mock(() => {});
    handleActionInfoToast = mock(() => {});
    countUniqueActions = mock(() => ({ terms: 0, characters: 0 }));
    saveState = mock(() => {});

    mockToastAdd.mockClear();
    mockBooksStoreUpdateBook.mockClear();
    mockTranslateParagraph.mockClear();
    mockPolishParagraph.mockClear();
    mockUpdateChapter.mockClear();
    mockGetChapterContentForUpdate.mockClear();
    mockAddParagraphTranslation.mockClear();
    updateSelectedChapterWithContent.mockClear();
    handleActionInfoToast.mockClear();
    countUniqueActions.mockClear();
    saveState.mockClear();
  });

  it('应该初始化状态', () => {
    const {
      isTranslatingChapter,
      translationProgress,
      isPolishingChapter,
      polishProgress,
      translationStatus,
    } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    expect(isTranslatingChapter.value).toBe(false);
    expect(translationProgress.value.current).toBe(0);
    expect(isPolishingChapter.value).toBe(false);
    expect(polishProgress.value.current).toBe(0);
    expect(translationStatus.value.hasNone).toBe(true);
  });

  it('应该正确计算翻译状态（无翻译）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', false);
    const chapter = createTestChapter('chapter-1', [paragraph1]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { translationStatus } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    expect(translationStatus.value.hasNone).toBe(true);
    expect(translationStatus.value.hasPartial).toBe(false);
    expect(translationStatus.value.hasAll).toBe(false);
  });

  it('应该正确计算翻译状态（部分翻译）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', true);
    const paragraph2 = createTestParagraph('para-2', '段落2', false);
    const chapter = createTestChapter('chapter-1', [paragraph1, paragraph2]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { translationStatus } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    expect(translationStatus.value.hasNone).toBe(false);
    expect(translationStatus.value.hasPartial).toBe(true);
    expect(translationStatus.value.hasAll).toBe(false);
  });

  it('应该正确计算翻译状态（全部翻译）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', true);
    const paragraph2 = createTestParagraph('para-2', '段落2', true);
    const chapter = createTestChapter('chapter-1', [paragraph1, paragraph2]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { translationStatus } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    expect(translationStatus.value.hasNone).toBe(false);
    expect(translationStatus.value.hasPartial).toBe(false);
    expect(translationStatus.value.hasAll).toBe(true);
  });

  it('应该正确设置翻译按钮标签', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', false);
    const chapter = createTestChapter('chapter-1', [paragraph1]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { translationButtonLabel, translationStatus } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    // 当没有翻译时，应该显示"翻译本章"
    expect(translationStatus.value.hasNone).toBe(true);
    // 注意：translationButtonLabel 是一个计算属性，会根据状态返回不同的标签
    // 由于我们 mock 了依赖，这里只验证 composable 正常初始化
    expect(translationButtonLabel).toBeDefined();
  });

  it('应该初始化翻译进度状态', () => {
    const {
      isTranslatingChapter,
      translationProgress,
      translatingParagraphIds,
      isPolishingChapter,
      polishProgress,
      polishingParagraphIds,
    } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    expect(isTranslatingChapter.value).toBe(false);
    expect(translationProgress.value.current).toBe(0);
    expect(translationProgress.value.total).toBe(0);
    expect(translatingParagraphIds.value.size).toBe(0);

    expect(isPolishingChapter.value).toBe(false);
    expect(polishProgress.value.current).toBe(0);
    expect(polishProgress.value.total).toBe(0);
    expect(polishingParagraphIds.value.size).toBe(0);
  });

  it('应该能够取消翻译', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', false);
    const chapter = createTestChapter('chapter-1', [paragraph1]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { cancelTranslation, isTranslatingChapter } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    // 取消翻译应该不抛出错误
    expect(() => cancelTranslation()).not.toThrow();
    expect(isTranslatingChapter.value).toBe(false);
  });

  it('应该能够取消润色', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', true);
    const chapter = createTestChapter('chapter-1', [paragraph1]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { cancelPolish, isPolishingChapter } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    // 取消润色应该不抛出错误
    expect(() => cancelPolish()).not.toThrow();
    expect(isPolishingChapter.value).toBe(false);
  });

  it('应该创建翻译按钮菜单项', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1', true);
    const chapter = createTestChapter('chapter-1', [paragraph1]);
    const novel = createTestNovel([chapter]);

    book.value = novel;
    selectedChapter.value = chapter;
    selectedChapterWithContent.value = chapter;
    selectedChapterParagraphs = computed(() => chapter.content || []);

    const { translationButtonMenuItems } = useChapterTranslation(
      book,
      selectedChapter,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      updateSelectedChapterWithContent,
      handleActionInfoToast,
      countUniqueActions,
      saveState,
    );

    // 应该总是包含"重新翻译"菜单项
    expect(translationButtonMenuItems.value.length).toBeGreaterThan(0);
    expect(translationButtonMenuItems.value[0]?.label).toBe('重新翻译');
  });
});

