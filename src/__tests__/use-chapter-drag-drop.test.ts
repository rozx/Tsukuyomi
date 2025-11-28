import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { ref } from 'vue';
import { useChapterDragDrop } from '../composables/book-details/useChapterDragDrop';
import type { Novel, Chapter, Volume } from '../models/novel';
import { generateShortId } from '../utils/id-generator';

// Mock HTMLElement for Node.js/Bun environment
class MockHTMLElement {
  tagName = 'DIV';
  style: { opacity?: string } = {};
  isContentEditable = false;
  constructor() {}
}

// @ts-ignore
global.HTMLElement = MockHTMLElement;

// Helper function to create mock DragEvent
function createMockDragEvent(type: string, options?: { dataTransfer?: Partial<DataTransfer>; target?: any }): DragEvent {
  const dataTransfer = {
    effectAllowed: 'all' as DataTransfer['effectAllowed'],
    dropEffect: 'none' as DataTransfer['dropEffect'],
    items: [] as DataTransferItemList,
    files: [] as FileList,
    types: [] as readonly string[],
    clearData: mock(() => {}),
    getData: mock(() => ''),
    setData: mock(() => true),
    ...options?.dataTransfer,
  } as DataTransfer;

  // Create a mock HTMLElement-like object
  const mockTarget = options?.target || {
    tagName: 'DIV',
    style: { opacity: '1' },
    isContentEditable: false,
  };

  const event = {
    type,
    dataTransfer,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
    stopImmediatePropagation: mock(() => {}),
    bubbles: true,
    cancelable: true,
    defaultPrevented: false,
    eventPhase: 0,
    isTrusted: true,
    target: mockTarget,
    currentTarget: null,
    timeStamp: Date.now(),
  } as unknown as DragEvent;

  return event;
}

// Mock dependencies
const mockToastAdd = mock(() => {});
const mockUseToastWithHistory = mock(() => ({
  add: mockToastAdd,
}));

const mockMoveChapter = mock(() => []);
const mockBooksStoreUpdateBook = mock(() => Promise.resolve());
const mockUseBooksStore = mock(() => ({
  updateBook: mockBooksStoreUpdateBook,
}));

await mock.module('src/composables/useToastHistory', () => ({
  useToastWithHistory: mockUseToastWithHistory,
}));

await mock.module('src/stores/books', () => ({
  useBooksStore: mockUseBooksStore,
}));

await mock.module('src/services/chapter-service', () => ({
  ChapterService: {
    moveChapter: mockMoveChapter,
  },
}));

// Helper function to create test chapter
function createTestChapter(id: string, title: string): Chapter {
  return {
    id,
    title: {
      original: title,
      translation: { id: generateShortId(), translation: '', aiModelId: '' },
    },
    content: [],
    lastEdited: new Date(),
  };
}

// Helper function to create test novel
function createTestNovel(volumes: Volume[]): Novel {
  return {
    id: 'novel-1',
    title: 'Test Novel',
    volumes,
    lastEdited: new Date(),
    createdAt: new Date(),
  };
}

describe('useChapterDragDrop', () => {
  beforeEach(() => {
    mockToastAdd.mockClear();
    mockMoveChapter.mockClear();
    mockBooksStoreUpdateBook.mockClear();
  });

  it('应该初始化拖拽状态', () => {
    const book = ref<Novel | undefined>(undefined);

    const { draggedChapter, dragOverVolumeId, dragOverIndex } = useChapterDragDrop(book);

    expect(draggedChapter.value).toBeNull();
    expect(dragOverVolumeId.value).toBeNull();
    expect(dragOverIndex.value).toBeNull();
  });

  it('应该在拖拽开始时设置状态', () => {
    const chapter = createTestChapter('chapter-1', 'Chapter 1');
    const volume: Volume = {
      id: 'volume-1',
      title: { original: 'Volume 1', translation: { id: generateShortId(), translation: '', aiModelId: '' } },
      chapters: [chapter],
    };
    const book = ref<Novel | undefined>(createTestNovel([volume]));

    const { handleDragStart, draggedChapter } = useChapterDragDrop(book);

    const event = createMockDragEvent('dragstart', {
      dataTransfer: {
        effectAllowed: 'move',
        setData: mock(() => {}),
      },
    });

    handleDragStart(event, chapter, 'volume-1', 0);

    expect(draggedChapter.value).toBeDefined();
    expect(draggedChapter.value?.chapter.id).toBe('chapter-1');
    expect(draggedChapter.value?.sourceVolumeId).toBe('volume-1');
    expect(draggedChapter.value?.sourceIndex).toBe(0);
  });

  it('应该在拖拽结束时清除状态', () => {
    const chapter = createTestChapter('chapter-1', 'Chapter 1');
    const book = ref<Novel | undefined>(createTestNovel([]));

    const { handleDragStart, handleDragEnd, draggedChapter, dragOverVolumeId, dragOverIndex } =
      useChapterDragDrop(book);

    const dragStartEvent = createMockDragEvent('dragstart', {
      dataTransfer: {
        effectAllowed: 'move',
        setData: mock(() => {}),
      },
    });

    handleDragStart(dragStartEvent, chapter, 'volume-1', 0);
    expect(draggedChapter.value).not.toBeNull();

    const dragEndEvent = createMockDragEvent('dragend');
    handleDragEnd(dragEndEvent);

    expect(draggedChapter.value).toBeNull();
    expect(dragOverVolumeId.value).toBeNull();
    expect(dragOverIndex.value).toBeNull();
  });

  it('应该在拖拽悬停时更新状态', () => {
    const book = ref<Novel | undefined>(createTestNovel([]));

    const { handleDragOver, dragOverVolumeId, dragOverIndex } = useChapterDragDrop(book);

    const event = createMockDragEvent('dragover', {
      dataTransfer: {
        dropEffect: 'move',
      },
    });

    handleDragOver(event, 'volume-2', 1);

    expect(dragOverVolumeId.value).toBe('volume-2');
    expect(dragOverIndex.value).toBe(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.dataTransfer?.dropEffect).toBe('move');
  });

  it('应该在放下时移动章节', async () => {
    const chapter = createTestChapter('chapter-1', 'Chapter 1');
    const volume1: Volume = {
      id: 'volume-1',
      title: { original: 'Volume 1', translation: { id: generateShortId(), translation: '', aiModelId: '' } },
      chapters: [chapter],
    };
    const volume2: Volume = {
      id: 'volume-2',
      title: { original: 'Volume 2', translation: { id: generateShortId(), translation: '', aiModelId: '' } },
      chapters: [],
    };
    const book = ref<Novel | undefined>(createTestNovel([volume1, volume2]));

    const updatedVolumes: Volume[] = [
      volume1,
      {
        ...volume2,
        chapters: [chapter],
      },
    ];
    mockMoveChapter.mockReturnValueOnce(updatedVolumes);

    const saveState = mock(() => {});
    const { handleDragStart, handleDrop, draggedChapter } = useChapterDragDrop(book, saveState);

    // 开始拖拽
    const dragStartEvent = createMockDragEvent('dragstart', {
      dataTransfer: {
        effectAllowed: 'move',
        setData: mock(() => {}),
      },
    });
    handleDragStart(dragStartEvent, chapter, 'volume-1', 0);

    // 放下
    const dropEvent = createMockDragEvent('drop');
    await handleDrop(dropEvent, 'volume-2', 0);

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(saveState).toHaveBeenCalledWith('移动章节');
    expect(mockMoveChapter).toHaveBeenCalledWith(book.value, 'chapter-1', 'volume-2', 0);
    expect(mockBooksStoreUpdateBook).toHaveBeenCalled();
    expect(mockToastAdd).toHaveBeenCalledTimes(1);
    expect(draggedChapter.value).toBeNull();
  });

  it('应该在书籍为空时不执行移动', async () => {
    const book = ref<Novel | undefined>(undefined);
    const chapter = createTestChapter('chapter-1', 'Chapter 1');

    const { handleDrop } = useChapterDragDrop(book);

    const dropEvent = createMockDragEvent('drop');

    await handleDrop(dropEvent, 'volume-2', 0);

    expect(dropEvent.preventDefault).toHaveBeenCalled();
    expect(mockMoveChapter).not.toHaveBeenCalled();
    expect(mockBooksStoreUpdateBook).not.toHaveBeenCalled();
  });
});

