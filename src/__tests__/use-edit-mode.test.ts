import { describe, expect, it, mock, beforeEach, spyOn, afterEach } from 'bun:test';
import { ref, computed } from 'vue';
import { useEditMode } from '../composables/book-details/useEditMode';
import type { Novel, Chapter, Paragraph, Volume } from '../models/novel';
import { generateShortId } from '../utils/id-generator';
import { TerminologyService } from 'src/services/terminology-service';
import { CharacterSettingService } from 'src/services/character-setting-service';
import * as BooksStore from 'src/stores/books';
import { ChapterService } from 'src/services/chapter-service';

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockUpdateChapter = mock((): Volume[] => []);
const mockBooksStoreUpdateBook = mock(() => Promise.resolve());
const mockUseBooksStore = mock(() => ({
  updateBook: mockBooksStoreUpdateBook,
}));

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));


// Helper functions
function createTestParagraph(id: string, text: string): Paragraph {
  return {
    id,
    text,
    selectedTranslationId: '',
    translations: [],
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

describe('useEditMode', () => {
  beforeEach(() => {
    mockToastAdd.mockClear();
    mockUpdateChapter.mockClear();
    mockBooksStoreUpdateBook.mockClear();
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      updateBook: mockBooksStoreUpdateBook,
    } as any);
    spyOn(ChapterService, 'updateChapter').mockImplementation(mockUpdateChapter);
  });

  afterEach(() => {
    mock.restore();
  });

  it('应该初始化编辑模式为 translation', () => {
    const book = ref<Novel | undefined>(undefined);
    const selectedChapterWithContent = ref<Chapter | null>(null);
    const selectedChapterParagraphs = ref<Paragraph[]>([]);
    const selectedChapterId = ref<string | null>(null);
    const updateSelectedChapterWithContent = mock(() => {});

    const { editMode } = useEditMode(
      book,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapterId,
      updateSelectedChapterWithContent,
    );

    expect(editMode.value).toBe('translation');
  });

  it('应该计算章节原始文本', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', '段落2');
    const chapter = createTestChapter('chapter-1', [paragraph1, paragraph2]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = computed(() => chapter.content || []);
    const selectedChapterId = ref<string | null>('chapter-1');
    const updateSelectedChapterWithContent = mock(() => {});

    const { chapterOriginalText } = useEditMode(
      book,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapterId,
      updateSelectedChapterWithContent,
    );

    expect(chapterOriginalText.value).toBe('段落1\n段落2');
  });

  it('应该开始编辑原始文本', () => {
    const paragraph = createTestParagraph('para-1', '原文');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = computed(() => chapter.content || []);
    const selectedChapterId = ref<string | null>('chapter-1');
    const updateSelectedChapterWithContent = mock(() => {});

    const {
      isEditingOriginalText,
      originalTextEditValue,
      originalTextEditChapterId,
      startEditingOriginalText,
    } = useEditMode(
      book,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapterId,
      updateSelectedChapterWithContent,
    );

    expect(isEditingOriginalText.value).toBe(false);

    startEditingOriginalText();

    expect(isEditingOriginalText.value).toBe(true);
    expect(originalTextEditValue.value).toBe('原文');
    expect(originalTextEditChapterId.value).toBe('chapter-1');
  });

  it('应该取消编辑原始文本', () => {
    const paragraph = createTestParagraph('para-1', '原文');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = computed(() => chapter.content || []);
    const selectedChapterId = ref<string | null>('chapter-1');
    const updateSelectedChapterWithContent = mock(() => {});

    const {
      isEditingOriginalText,
      originalTextEditValue,
      cancelOriginalTextEdit,
      startEditingOriginalText,
    } = useEditMode(
      book,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapterId,
      updateSelectedChapterWithContent,
    );

    startEditingOriginalText();
    originalTextEditValue.value = '修改后的文本';

    cancelOriginalTextEdit();

    expect(isEditingOriginalText.value).toBe(false);
    expect(originalTextEditValue.value).toBe('原文'); // 应该恢复备份
  });

  it('应该保存编辑后的原始文本', async () => {
    const paragraph = createTestParagraph('para-1', '原文');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);
    const selectedChapterParagraphs = computed(() => chapter.content || []);
    const selectedChapterId = ref<string | null>('chapter-1');

    const updatedVolumes = [
      {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [
          {
            ...chapter,
            content: [{ ...paragraph, text: '新文本' }],
          },
        ],
      },
    ];
    mockUpdateChapter.mockReturnValueOnce(updatedVolumes);

    const updateSelectedChapterWithContent = mock(() => {});
    const saveState = mock(() => {});

    const { originalTextEditValue, saveOriginalTextEdit, startEditingOriginalText } = useEditMode(
      book,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapterId,
      updateSelectedChapterWithContent,
      saveState,
    );

    startEditingOriginalText();
    originalTextEditValue.value = '新文本\n新段落';

    await saveOriginalTextEdit();

    expect(saveState).toHaveBeenCalledWith('编辑原始文本');
    expect(mockUpdateChapter).toHaveBeenCalled();
    expect(mockBooksStoreUpdateBook).toHaveBeenCalled();
    // 注意：编辑状态会在 updateSelectedChapterWithContent 后重置
    // 由于我们 mock 了 updateSelectedChapterWithContent，状态可能不会自动重置
    // 这是预期的测试行为
  });
});
