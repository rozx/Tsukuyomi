import { describe, expect, it, mock, beforeEach, spyOn, afterEach } from 'bun:test';
import { ref } from 'vue';
import { useParagraphTranslation } from '../composables/book-details/useParagraphTranslation';
import type { Novel, Chapter, Volume, Paragraph } from '../models/novel';
import { generateShortId } from '../utils/id-generator';
import { ChapterService } from '../services/chapter-service';
import * as BooksStore from '../stores/books';

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockUpdateChapter = mock((): Volume[] => []);
const mockSaveChapterContent = mock(() => Promise.resolve());
const mockBooksStoreUpdateBook = mock(() => Promise.resolve());
const mockUseBooksStore = mock(() => ({
  updateBook: mockBooksStoreUpdateBook,
}));

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));

// Helper functions
function createTestParagraph(id: string, text: string, translation?: string): Paragraph {
  const translationId = generateShortId();
  return {
    id,
    text,
    selectedTranslationId: translationId,
    translations: translation
      ? [
          {
            id: translationId,
            translation,
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

describe('useParagraphTranslation', () => {
  beforeEach(() => {
    mockToastAdd.mockClear();
    mockUpdateChapter.mockClear();
    mockSaveChapterContent.mockClear();
    mockBooksStoreUpdateBook.mockClear();
    spyOn(BooksStore, 'useBooksStore').mockReturnValue({
      updateBook: mockBooksStoreUpdateBook,
    } as any);
    spyOn(ChapterService, 'updateChapter').mockImplementation(mockUpdateChapter);
    spyOn(ChapterService, 'saveChapterContent').mockImplementation(mockSaveChapterContent);
  });

  afterEach(() => {
    mock.restore();
  });

  it('应该初始化状态', () => {
    const book = ref<Novel | undefined>(undefined);
    const selectedChapterWithContent = ref<Chapter | null>(null);

    const { currentlyEditingParagraphId } = useParagraphTranslation(
      book,
      selectedChapterWithContent,
    );

    expect(currentlyEditingParagraphId.value).toBeNull();
  });

  it('应该更新段落翻译', async () => {
    const paragraph = createTestParagraph('para-1', '原文', '原翻译');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);

    const updatedVolumes: Volume[] = [
      {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [
          {
            ...chapter,
            content: [
              {
                ...paragraph,
                translations: paragraph.translations!.map((t) =>
                  t.id === paragraph.selectedTranslationId ? { ...t, translation: '新翻译' } : t,
                ),
              },
            ],
          },
        ],
      },
    ];
    mockUpdateChapter.mockReturnValueOnce(updatedVolumes);

    const saveState = mock(() => {});
    const { updateParagraphTranslation } = useParagraphTranslation(
      book,
      selectedChapterWithContent,
      saveState,
    );

    await updateParagraphTranslation('para-1', '新翻译');

    expect(saveState).toHaveBeenCalledWith('更新段落翻译');
    expect(mockUpdateChapter).toHaveBeenCalled();
    expect(mockBooksStoreUpdateBook).toHaveBeenCalled();
  });

  it('应该选择段落翻译', async () => {
    const translation1Id = generateShortId();
    const translation2Id = generateShortId();
    const paragraph: Paragraph = {
      id: 'para-1',
      text: '原文',
      selectedTranslationId: translation1Id,
      translations: [
        { id: translation1Id, translation: '翻译1', aiModelId: 'model-1' },
        { id: translation2Id, translation: '翻译2', aiModelId: 'model-2' },
      ],
    };
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);

    const updatedVolumes: Volume[] = [
      {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [
          {
            ...chapter,
            content: [
              {
                ...paragraph,
                selectedTranslationId: translation2Id,
              },
            ],
          },
        ],
      },
    ];
    mockUpdateChapter.mockReturnValueOnce(updatedVolumes);

    const { selectParagraphTranslation } = useParagraphTranslation(
      book,
      selectedChapterWithContent,
    );

    await selectParagraphTranslation('para-1', translation2Id);

    expect(mockUpdateChapter).toHaveBeenCalled();
    expect(mockBooksStoreUpdateBook).toHaveBeenCalled();
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const toastCall = calls[0]?.[0] as any;
    expect(toastCall).toBeDefined();
    expect(toastCall.severity).toBe('success');
    expect(toastCall.summary).toBe('已切换翻译');
  });

  it('应该在翻译ID不存在时显示错误', async () => {
    const paragraph = createTestParagraph('para-1', '原文', '翻译');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);

    const { selectParagraphTranslation } = useParagraphTranslation(
      book,
      selectedChapterWithContent,
    );

    await selectParagraphTranslation('para-1', 'non-existent-id');

    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    const calls = mockToastAdd.mock.calls as unknown as Array<[any]>;
    expect(calls.length).toBeGreaterThan(0);
    const toastCall = calls[0]?.[0] as any;
    expect(toastCall).toBeDefined();
    expect(toastCall.severity).toBe('error');
    expect(toastCall.summary).toBe('选择失败');
    expect(mockBooksStoreUpdateBook).not.toHaveBeenCalled();
  });

  it('应该更新 selectedChapterWithContent', () => {
    const paragraph = createTestParagraph('para-1', '原文', '翻译');
    const chapter = createTestChapter('chapter-1', [paragraph]);
    const novel = createTestNovel([chapter]);

    const book = ref<Novel | undefined>(novel);
    const selectedChapterWithContent = ref<Chapter | null>(chapter);

    const { updateSelectedChapterWithContent } = useParagraphTranslation(
      book,
      selectedChapterWithContent,
    );

    const updatedVolumes: Volume[] = [
      {
        id: 'volume-1',
        title: {
          original: 'Volume 1',
          translation: { id: generateShortId(), translation: '', aiModelId: '' },
        },
        chapters: [
          {
            ...chapter,
            content: [{ ...paragraph, text: '更新后的原文' }],
          },
        ],
      },
    ];

    updateSelectedChapterWithContent(updatedVolumes);

    expect(selectedChapterWithContent.value?.content?.[0]?.text).toBe('更新后的原文');
  });
});
