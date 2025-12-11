import { describe, expect, it, mock, beforeEach, spyOn } from 'bun:test';
import { ref, computed, type ComputedRef, type Ref } from 'vue';
import { useParagraphNavigation } from '../composables/book-details/useParagraphNavigation';
import type { Paragraph } from '../models/novel';
import * as Utils from '../utils';

// Mock HTMLElement and DOM APIs
class MockHTMLElement {
  id = '';
  scrollTop = 0;
  scrollIntoView = mock(() => {});
  focus = mock(() => {});
  getBoundingClientRect = mock(() => ({
    top: 0,
    left: 0,
    right: 100,
    bottom: 100,
    width: 100,
    height: 100,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  }));
  style: { opacity?: string } = {};
  tagName = 'DIV';
  isContentEditable = false;
}

// Mock requestAnimationFrame
const mockRequestAnimationFrame = mock((callback: FrameRequestCallback) => {
  setTimeout(callback, 16);
  return 1;
});
global.requestAnimationFrame = mockRequestAnimationFrame as any;

// Mock document.getElementById
const mockGetElementById = mock((id: string) => {
  const element = new MockHTMLElement();
  element.id = id;
  return element;
});
global.document = {
  getElementById: mockGetElementById,
} as any;

// Mock isEmptyParagraph
const mockIsEmptyParagraph = mock((paragraph: Paragraph) => {
  return !paragraph.text || paragraph.text.trim() === '';
});

// Helper functions
function createTestParagraph(id: string, text: string): Paragraph {
  return {
    id,
    text,
    selectedTranslationId: '',
    translations: [],
  };
}

describe('useParagraphNavigation', () => {
  let selectedChapterParagraphs: ComputedRef<Paragraph[]>;
  let scrollableContentRef: Ref<HTMLElement | null>;
  let currentlyEditingParagraphId: Ref<string | null>;

  beforeEach(() => {
    selectedChapterParagraphs = computed(() => []);
    scrollableContentRef = ref<HTMLElement | null>(null);
    currentlyEditingParagraphId = ref<string | null>(null);
    mockRequestAnimationFrame.mockClear();
    mockGetElementById.mockClear();
    mockIsEmptyParagraph.mockClear();
    spyOn(Utils, 'isEmptyParagraph').mockImplementation(mockIsEmptyParagraph);
  });

  it('应该初始化状态', () => {
    const {
      selectedParagraphIndex,
      isKeyboardSelected,
      isClickSelected,
      isKeyboardNavigating,
      isProgrammaticScrolling,
    } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    expect(selectedParagraphIndex.value).toBeNull();
    expect(isKeyboardSelected.value).toBe(false);
    expect(isClickSelected.value).toBe(false);
    expect(isKeyboardNavigating.value).toBe(false);
    expect(isProgrammaticScrolling.value).toBe(false);
  });

  it('应该重置段落导航', () => {
    const {
      resetParagraphNavigation,
      selectedParagraphIndex,
      isKeyboardSelected,
      isClickSelected,
    } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    selectedParagraphIndex.value = 0;
    isKeyboardSelected.value = true;
    isClickSelected.value = true;

    resetParagraphNavigation();

    expect(selectedParagraphIndex.value).toBeNull();
    expect(isKeyboardSelected.value).toBe(false);
    expect(isClickSelected.value).toBe(false);
  });

  it('应该获取非空段落的索引列表', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', ''); // 空段落
    const paragraph3 = createTestParagraph('para-3', '段落3');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2, paragraph3]);

    const { getNonEmptyParagraphIndices } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    const indices = getNonEmptyParagraphIndices();

    expect(indices).toEqual([0, 2]); // 只有索引 0 和 2 是非空的
  });

  it('应该查找下一个非空段落（向下）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', ''); // 空段落
    const paragraph3 = createTestParagraph('para-3', '段落3');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2, paragraph3]);

    const { findNextNonEmptyParagraph } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    // 从索引 0 向下查找
    const nextIndex = findNextNonEmptyParagraph(0, 'down');
    expect(nextIndex).toBe(2); // 应该找到索引 2

    // 从索引 2 向下查找（应该循环到第一个）
    const loopedIndex = findNextNonEmptyParagraph(2, 'down');
    expect(loopedIndex).toBe(0); // 应该循环到索引 0
  });

  it('应该查找下一个非空段落（向上）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', ''); // 空段落
    const paragraph3 = createTestParagraph('para-3', '段落3');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2, paragraph3]);

    const { findNextNonEmptyParagraph } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    // 从索引 2 向上查找
    const prevIndex = findNextNonEmptyParagraph(2, 'up');
    expect(prevIndex).toBe(0); // 应该找到索引 0

    // 从索引 0 向上查找（应该循环到最后一个）
    const loopedIndex = findNextNonEmptyParagraph(0, 'up');
    expect(loopedIndex).toBe(2); // 应该循环到索引 2
  });

  it('应该在段落为空时返回 null', () => {
    selectedChapterParagraphs = computed(() => []);

    const { findNextNonEmptyParagraph } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    const result = findNextNonEmptyParagraph(0, 'down');
    expect(result).toBeNull();
  });

  it('应该取消当前正在编辑的段落', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    selectedChapterParagraphs = computed(() => [paragraph1]);
    currentlyEditingParagraphId.value = 'para-1';

    const { cancelCurrentEditing, paragraphCardRefs } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    // 模拟一个 cardRef
    const mockCardRef = {
      stopEditing: mock(() => {}),
    };
    paragraphCardRefs.value.set('para-1', mockCardRef as any);

    cancelCurrentEditing();

    expect(currentlyEditingParagraphId.value).toBeNull();
    expect(mockCardRef.stopEditing).toHaveBeenCalled();
  });

  it('应该导航到指定段落（键盘导航）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', '段落2');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2]);

    const scrollContainer = new MockHTMLElement();
    scrollableContentRef.value = scrollContainer as any;

    const { navigateToParagraph, selectedParagraphIndex, isKeyboardSelected } =
      useParagraphNavigation(
        selectedChapterParagraphs,
        scrollableContentRef,
        currentlyEditingParagraphId,
      );

    navigateToParagraph(0, true, true);

    expect(selectedParagraphIndex.value).toBe(0);
    expect(isKeyboardSelected.value).toBe(true);
  });

  it('应该导航到指定段落（非键盘导航）', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    selectedChapterParagraphs = computed(() => [paragraph1]);

    const { navigateToParagraph, selectedParagraphIndex, isKeyboardSelected } =
      useParagraphNavigation(
        selectedChapterParagraphs,
        scrollableContentRef,
        currentlyEditingParagraphId,
      );

    navigateToParagraph(0, false, false);

    expect(selectedParagraphIndex.value).toBe(0);
    expect(isKeyboardSelected.value).toBe(false);
  });

  it('应该跳过空段落导航到最近的非空段落', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', ''); // 空段落
    const paragraph3 = createTestParagraph('para-3', '段落3');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2, paragraph3]);

    const { navigateToParagraph, selectedParagraphIndex } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    // 尝试导航到空段落（索引 1）
    navigateToParagraph(1, false, false);

    // 应该导航到最近的非空段落（索引 2）
    expect(selectedParagraphIndex.value).toBe(2);
  });

  it('应该处理段落点击', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', '段落2');
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2]);

    const { handleParagraphClick, selectedParagraphIndex, isClickSelected, isKeyboardSelected } =
      useParagraphNavigation(
        selectedChapterParagraphs,
        scrollableContentRef,
        currentlyEditingParagraphId,
      );

    handleParagraphClick('para-2');

    expect(selectedParagraphIndex.value).toBe(1);
    expect(isClickSelected.value).toBe(true);
    expect(isKeyboardSelected.value).toBe(false);
  });

  it('应该在点击空段落时导航到最近的非空段落', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    const paragraph2 = createTestParagraph('para-2', ''); // 空段落
    selectedChapterParagraphs = computed(() => [paragraph1, paragraph2]);

    const { handleParagraphClick, selectedParagraphIndex } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    handleParagraphClick('para-2');

    // 应该导航到索引 0（向下查找找到的第一个非空段落）
    expect(selectedParagraphIndex.value).toBe(0);
  });

  it('应该处理段落开始编辑事件', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    selectedChapterParagraphs = computed(() => [paragraph1]);

    const { handleParagraphEditStart } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    handleParagraphEditStart('para-1');

    expect(currentlyEditingParagraphId.value).toBe('para-1');
  });

  it('应该处理段落停止编辑事件', () => {
    const paragraph1 = createTestParagraph('para-1', '段落1');
    selectedChapterParagraphs = computed(() => [paragraph1]);
    currentlyEditingParagraphId.value = 'para-1';

    const { handleParagraphEditStop } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    handleParagraphEditStop('para-1');

    expect(currentlyEditingParagraphId.value).toBeNull();
  });

  it('应该清理所有 timeout', () => {
    const { cleanup, resetParagraphNavigation } = useParagraphNavigation(
      selectedChapterParagraphs,
      scrollableContentRef,
      currentlyEditingParagraphId,
    );

    // 先设置一些状态（可能会创建 timeout）
    resetParagraphNavigation();

    // 清理应该不抛出错误
    expect(() => cleanup()).not.toThrow();
  });
});
