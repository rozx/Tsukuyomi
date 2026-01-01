import { describe, expect, it, mock, beforeEach } from 'bun:test';
import { ref, computed } from 'vue';
import { useKeyboardShortcuts } from '../composables/book-details/useKeyboardShortcuts';
import type { Chapter, Paragraph } from '../models/novel';

// Mock HTMLElement
class MockHTMLElement {
  tagName = 'DIV';
  isContentEditable = false;
  // 显式标注返回类型，避免后续测试用例需要返回非空值时出现类型不兼容
  closest = mock<(selector: string) => Element | null>(() => null);
}

// Helper functions
function createTestParagraph(id: string, text: string): Paragraph {
  return {
    id,
    text,
    selectedTranslationId: '',
    translations: [],
  };
}

function createMockKeyboardEvent(
  key: string,
  options: {
    ctrlKey?: boolean;
    metaKey?: boolean;
    shiftKey?: boolean;
    altKey?: boolean;
    target?: HTMLElement;
  } = {},
): KeyboardEvent {
  const event = {
    key,
    ctrlKey: options.ctrlKey || false,
    metaKey: options.metaKey || false,
    shiftKey: options.shiftKey || false,
    altKey: options.altKey || false,
    target: options.target || new MockHTMLElement(),
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as KeyboardEvent;

  return event;
}

function createMockMouseEvent(target: HTMLElement): MouseEvent {
  return {
    target,
    preventDefault: mock(() => {}),
    stopPropagation: mock(() => {}),
  } as unknown as MouseEvent;
}

describe('useKeyboardShortcuts', () => {
  // 搜索替换相关
  const isSearchVisible = ref(false);
  const toggleSearch = mock(() => {});
  const showReplace = ref(false);
  const nextMatch = mock(() => {});
  const prevMatch = mock(() => {});

  // 导出相关
  const copyAllTranslatedText = mock(() => Promise.resolve());

  // 组件状态
  const selectedChapter = ref<Chapter | null>(null);
  const selectedSettingMenu = ref<'terms' | 'characters' | null>(null);
  const editMode = ref<'original' | 'translation' | 'preview'>('translation');

  // 段落导航相关
  const selectedParagraphIndex = ref<number | null>(null);
  const isKeyboardNavigating = ref(false);
  const isKeyboardSelected = ref(false);
  const isClickSelected = ref(false);
  const isProgrammaticScrolling = ref(false);
  const lastKeyboardNavigationTime = ref<number | null>(null);
  const resetNavigationTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null);
  const getNonEmptyParagraphIndices = mock(() => []);
  const findNextNonEmptyParagraph = mock(() => null);
  const navigateToParagraph = mock(() => {});
  const startEditingSelectedParagraph = mock(() => {});

  // 撤销/重做
  const canUndo = computed(() => false);
  const undo = mock(() => Promise.resolve());
  const canRedo = computed(() => false);
  const redo = mock(() => Promise.resolve());

  // 段落数据
  const paragraph1 = createTestParagraph('para-1', '段落1');
  const paragraph2 = createTestParagraph('para-2', '段落2');
  const selectedChapterParagraphs = computed<Paragraph[]>(() => [paragraph1, paragraph2]);
  const selectedChapterWithContent = ref<Chapter | null>(null);

  beforeEach(() => {
    // Reset all refs
    isSearchVisible.value = false;
    showReplace.value = false;
    selectedChapter.value = null;
    selectedSettingMenu.value = null;
    editMode.value = 'translation';
    selectedParagraphIndex.value = null;
    isKeyboardNavigating.value = false;
    isKeyboardSelected.value = false;
    isClickSelected.value = false;
    isProgrammaticScrolling.value = false;
    lastKeyboardNavigationTime.value = null;
    resetNavigationTimeoutId.value = null;

    // Clear all mocks
    toggleSearch.mockClear();
    nextMatch.mockClear();
    prevMatch.mockClear();
    copyAllTranslatedText.mockClear();
    getNonEmptyParagraphIndices.mockClear();
    findNextNonEmptyParagraph.mockClear();
    navigateToParagraph.mockClear();
    startEditingSelectedParagraph.mockClear();
    undo.mockClear();
    redo.mockClear();
  });

  it('应该初始化 composable', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    expect(handleKeydown).toBeDefined();
  });

  it('应该处理 Ctrl+F / Cmd+F 打开搜索', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    const event = createMockKeyboardEvent('f', { ctrlKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(toggleSearch).toHaveBeenCalledTimes(1);
  });

  it('应该在搜索输入框中时忽略 Ctrl+F', () => {
    const inputElement = new MockHTMLElement();
    inputElement.tagName = 'INPUT';

    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isSearchVisible.value = true;
    const event = createMockKeyboardEvent('f', { ctrlKey: true, target: inputElement as any });
    handleKeydown(event);

    // 如果在搜索输入框中，不应该调用 toggleSearch
    expect(toggleSearch).not.toHaveBeenCalled();
  });

  it('应该处理 Ctrl+H / Cmd+H 切换替换', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isSearchVisible.value = true;
    const event = createMockKeyboardEvent('h', { ctrlKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(showReplace.value).toBe(true);
  });

  it('在章节内容区域按上下方向键时，应屏蔽默认滚动（仅翻译模式）', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    // 模拟已选中章节，且当前在翻译模式
    selectedChapter.value = { id: 'chapter-1' } as unknown as Chapter;
    editMode.value = 'translation';

    const event = createMockKeyboardEvent('ArrowDown');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalledTimes(1);
    // 这里可能会触发段落导航；本用例只验证默认滚动被屏蔽
  });

  it('在原文编辑模式按上下方向键时，不应屏蔽默认行为', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    selectedChapter.value = { id: 'chapter-1' } as unknown as Chapter;
    editMode.value = 'original';

    const event = createMockKeyboardEvent('ArrowDown');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  it('在译文预览模式按上下方向键时，不应屏蔽默认行为', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    selectedChapter.value = { id: 'chapter-1' } as unknown as Chapter;
    editMode.value = 'preview';

    const event = createMockKeyboardEvent('ArrowDown');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  it('在设置面板中按上下方向键时，不应屏蔽默认行为（允许滚动/组件导航）', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    selectedChapter.value = { id: 'chapter-1' } as unknown as Chapter;
    selectedSettingMenu.value = 'terms';
    editMode.value = 'original';

    const event = createMockKeyboardEvent('ArrowDown');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  it('当焦点位于菜单/下拉等 overlay 内时，不应屏蔽上下方向键默认行为', () => {
    const overlayTarget = new MockHTMLElement();
    // 只要调用 closest(...) 就返回非空，模拟在 overlay 内
    overlayTarget.closest = mock(() => overlayTarget as unknown as Element);

    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    selectedChapter.value = { id: 'chapter-1' } as unknown as Chapter;
    editMode.value = 'original';

    const event = createMockKeyboardEvent('ArrowDown', { target: overlayTarget as any });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).not.toHaveBeenCalled();
  });

  it('应该处理 F3 下一个匹配', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isSearchVisible.value = true;
    const event = createMockKeyboardEvent('F3');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(nextMatch).toHaveBeenCalledTimes(1);
  });

  it('应该处理 Shift+F3 上一个匹配', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isSearchVisible.value = true;
    const event = createMockKeyboardEvent('F3', { shiftKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(prevMatch).toHaveBeenCalledTimes(1);
  });

  it('应该处理 Escape 关闭搜索', () => {
    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isSearchVisible.value = true;
    const event = createMockKeyboardEvent('Escape');
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(toggleSearch).toHaveBeenCalledTimes(1);
  });

  it('应该处理 Ctrl+Shift+C 复制所有翻译文本', () => {
    selectedChapterWithContent.value = {
      id: 'chapter-1',
      title: { original: 'Chapter 1', translation: { id: 'trans-1', translation: '', aiModelId: '' } },
      content: [paragraph1, paragraph2],
      lastEdited: new Date(),
      createdAt: new Date(),
    };

    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    const event = createMockKeyboardEvent('c', { ctrlKey: true, shiftKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(copyAllTranslatedText).toHaveBeenCalledTimes(1);
  });

  it('应该处理 Ctrl+Z 撤销', () => {
    const canUndoRef = computed(() => true);

    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndoRef,
      undo,
      canRedo,
      redo,
    );

    const event = createMockKeyboardEvent('z', { ctrlKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('应该处理 Ctrl+Y 重做', () => {
    const canRedoRef = computed(() => true);

    const { handleKeydown } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedoRef,
      redo,
    );

    const event = createMockKeyboardEvent('y', { ctrlKey: true });
    handleKeydown(event);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    const preventDefaultMock = event.preventDefault;
    expect(preventDefaultMock).toHaveBeenCalled();
    expect(redo).toHaveBeenCalledTimes(1);
  });

  it('应该处理点击事件', () => {
    const { handleClick } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isKeyboardNavigating.value = true;
    const target = new MockHTMLElement();
    const event = createMockMouseEvent(target as any);
    handleClick(event);

    // 如果点击的不是段落卡片，应该重置键盘导航状态
    expect(isKeyboardNavigating.value).toBe(false);
  });

  it('应该处理鼠标移动事件', () => {
    const { handleMouseMove } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isKeyboardNavigating.value = true;
    lastKeyboardNavigationTime.value = Date.now() - 3000; // 3秒前

    handleMouseMove();

    // 应该设置防抖 timeout，但不会立即重置
    // 由于使用了 setTimeout，这里只验证函数被调用且不抛出错误
    expect(() => handleMouseMove()).not.toThrow();
  });

  it('应该处理滚动事件', () => {
    const { handleScroll } = useKeyboardShortcuts(
      isSearchVisible,
      toggleSearch,
      showReplace,
      nextMatch,
      prevMatch,
      copyAllTranslatedText,
      selectedChapterWithContent,
      selectedChapterParagraphs,
      selectedChapter,
      selectedSettingMenu,
      editMode,
      selectedParagraphIndex,
      isKeyboardNavigating,
      isKeyboardSelected,
      isClickSelected,
      isProgrammaticScrolling,
      lastKeyboardNavigationTime,
      resetNavigationTimeoutId,
      getNonEmptyParagraphIndices,
      findNextNonEmptyParagraph,
      navigateToParagraph,
      startEditingSelectedParagraph,
      canUndo,
      undo,
      canRedo,
      redo,
    );

    isKeyboardNavigating.value = true;
    lastKeyboardNavigationTime.value = Date.now() - 3000; // 3秒前

    handleScroll();

    // 应该设置防抖 timeout，但不会立即重置
    // 由于使用了 setTimeout，这里只验证函数被调用且不抛出错误
    expect(() => handleScroll()).not.toThrow();
  });
});

