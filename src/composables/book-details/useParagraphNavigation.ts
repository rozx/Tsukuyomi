import { ref, nextTick, type Ref, type ComputedRef } from 'vue';
import { isEmptyParagraph } from 'src/utils';
import type { Paragraph } from 'src/models/novel';
import type ParagraphCard from 'src/components/novel/ParagraphCard.vue';
import type { ChapterScrollToIndex } from 'src/composables/book-details/useChapterVirtualizer';

export function useParagraphNavigation(
  selectedChapterParagraphs: ComputedRef<Paragraph[]> | Ref<Paragraph[]>,
  scrollableContentRef: Ref<HTMLElement | null>,
  currentlyEditingParagraphId: Ref<string | null>,
  // 虚拟滚动下按索引滚动入视（由 ChapterContentPanel 注册）。未注册时回退到原生 scrollIntoView。
  chapterScrollToIndex?: Ref<ChapterScrollToIndex | null>,
) {
  // 段落导航状态
  const selectedParagraphIndex = ref<number | null>(null);
  // 性能关键：使用普通 Map 而不是 ref<Map>。
  // 之前用 ref<Map> 会让 Vue 将 Map 变成响应式对象，每次 :ref 回调里调用 .set()/.delete()
  // 都会触发整个响应式系统的通知链路。渲染一个 2000 段落的章节时，每次挂载都会触发 2000
  // 次响应式写操作，造成严重卡顿。这个 Map 仅用于命令式查找（启动编辑、滚动到段落等），
  // 从不被模板/计算属性读取，因此不需要响应式。
  const paragraphCardRefs = new Map<string, InstanceType<typeof ParagraphCard>>();
  // 是否通过键盘导航选中（用于控制是否显示选中效果）
  const isKeyboardSelected = ref(false);
  // 是否通过点击选中（用于控制是否显示选中效果）
  const isClickSelected = ref(false);
  // 是否正在使用键盘导航（用于忽略鼠标悬停）
  const isKeyboardNavigating = ref(false);
  // 是否正在进行程序化滚动（用于区分用户滚动和程序化滚动）
  const isProgrammaticScrolling = ref(false);
  // 最后一次键盘导航的时间戳（用于判断是否应该允许滚动事件重置状态）
  const lastKeyboardNavigationTime = ref<number | null>(null);
  // 程序化滚动的 timeout ID（用于清除之前的 timeout）
  const programmaticScrollTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null);
  // 重置键盘导航状态的防抖 timeout ID
  const resetNavigationTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null);
  // 清除选中效果的 timeout ID
  const clearSelectionTimeoutId = ref<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 清除三个与段落导航相关的 timeout（程序化滚动 / 重置导航防抖 / 清除选中效果）。
   * 由 resetParagraphNavigation 与 cleanup 共用。
   */
  const clearAllNavigationTimeouts = () => {
    if (programmaticScrollTimeoutId.value !== null) {
      clearTimeout(programmaticScrollTimeoutId.value);
      programmaticScrollTimeoutId.value = null;
    }
    if (resetNavigationTimeoutId.value !== null) {
      clearTimeout(resetNavigationTimeoutId.value);
      resetNavigationTimeoutId.value = null;
    }
    if (clearSelectionTimeoutId.value !== null) {
      clearTimeout(clearSelectionTimeoutId.value);
      clearSelectionTimeoutId.value = null;
    }
  };

  // 重置段落导航
  const resetParagraphNavigation = () => {
    selectedParagraphIndex.value = null;
    isKeyboardSelected.value = false;
    isClickSelected.value = false;
    isKeyboardNavigating.value = false;
    lastKeyboardNavigationTime.value = null;
    clearAllNavigationTimeouts();
    isProgrammaticScrolling.value = false;
  };

  // 取目标段落已挂载的 DOM 元素（可见 + 钉住的行才在 DOM 中）
  const getParagraphEl = (paragraphId: string): HTMLElement | null => {
    const cardRef = paragraphCardRefs.get(paragraphId) as { $el?: unknown } | undefined;
    const fromCard = cardRef?.$el;
    if (fromCard instanceof HTMLElement) return fromCard;
    const byId = document.getElementById(`paragraph-${paragraphId}`);
    return byId instanceof HTMLElement ? byId : null;
  };

  // 在目标段落挂载后执行回调（虚拟滚动下滚动会触发挂载，需等待若干帧）
  const runWhenParagraphReady = (paragraphId: string, action: (el: HTMLElement) => void) => {
    const tryRun = (attempt: number) => {
      const el = getParagraphEl(paragraphId);
      if (el) {
        action(el);
        return;
      }
      if (attempt < 6 && typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => tryRun(attempt + 1));
      }
    };
    void nextTick(() => tryRun(0));
  };

  // 取元素所在的真实滚动容器（章节内容面板 wrapper；兜底用外层容器）
  const getScrollContainer = (el: HTMLElement): HTMLElement | null => {
    const panel = el.closest('.chapter-content-panel');
    if (panel instanceof HTMLElement) return panel;
    return scrollableContentRef.value;
  };

  // 「最小滚动 + 边缘留白」平滑滚动：仅当元素超出舒适区时滚动，按真实元素位置计算目标，
  // 用 container.scrollTo({behavior:'smooth'}) 平滑过渡。比 scrollIntoView 更可控，
  // 避免 block:'nearest' 在虚拟化测量调整下把目标留在视口外的问题，并保留边缘留白。
  const smoothRevealElement = (el: HTMLElement) => {
    const container = getScrollContainer(el);
    if (!container) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    const cr = el.getBoundingClientRect();
    const wr = container.getBoundingClientRect();
    const margin = Math.round(Math.min(96, Math.max(24, wr.height * 0.15)));
    let target: number | null = null;
    if (cr.top < wr.top + margin) {
      target = container.scrollTop + (cr.top - wr.top) - margin;
    } else if (cr.bottom > wr.bottom - margin) {
      target = container.scrollTop + (cr.bottom - wr.bottom) + margin;
    }
    if (target === null) return; // 已在舒适区内，不滚动
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' });
  };

  // --- 把目标段落平滑滚入视口，并在其挂载后执行 action（聚焦 / 开始编辑）---
  // 已挂载（可见或在 overscan 内）：直接对真实元素平滑滚动（按真实位置精确入视，
  //   不受虚拟化高度估算偏差影响，解决“偶尔滚不到位/不可见”）。
  // 未挂载（远处）：先用 chapterScrollToIndex 把它带到附近并挂载，挂载后再平滑微调。
  const revealParagraph = (
    index: number,
    paragraphId: string,
    action: (el: HTMLElement) => void,
    scroll: boolean,
  ) => {
    const existing = getParagraphEl(paragraphId);
    if (existing) {
      if (scroll) smoothRevealElement(existing);
      action(existing);
      return;
    }
    if (scroll && index >= 0) {
      const fn = chapterScrollToIndex?.value;
      if (fn) fn(index, { align: 'auto' });
    }
    runWhenParagraphReady(paragraphId, (el) => {
      if (scroll) smoothRevealElement(el);
      action(el);
    });
  };

  // 获取非空段落的索引列表
  // 性能优化：按 paragraphs 数组引用缓存结果。键盘快速导航（连续按方向键）时
  // 此函数会被 useKeyboardShortcuts 每次按键调用 2-3 次，大章节下线性扫描成本可观。
  // 只要章节内容未变（引用相同），就复用上一次的结果。
  let nonEmptyIndicesCache: { paragraphs: Paragraph[]; indices: number[] } | null = null;
  const getNonEmptyParagraphIndices = (): number[] => {
    const paragraphs = selectedChapterParagraphs.value;
    if (nonEmptyIndicesCache && nonEmptyIndicesCache.paragraphs === paragraphs) {
      return nonEmptyIndicesCache.indices;
    }
    const indices: number[] = [];
    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      if (p && !isEmptyParagraph(p.text)) {
        indices.push(i);
      }
    }
    nonEmptyIndicesCache = { paragraphs, indices };
    return indices;
  };

  // 查找下一个非空段落的索引
  const findNextNonEmptyParagraph = (
    currentIndex: number,
    direction: 'up' | 'down',
  ): number | null => {
    const nonEmptyIndices = getNonEmptyParagraphIndices();
    if (nonEmptyIndices.length === 0) return null;

    if (direction === 'down') {
      // 向下查找：找到第一个大于 currentIndex 的索引
      const nextIndex = nonEmptyIndices.find((idx) => idx > currentIndex);
      return nextIndex !== undefined ? nextIndex : (nonEmptyIndices[0] ?? null); // 循环到第一个
    } else {
      // 向上查找：找到第一个小于 currentIndex 的索引（从后往前）
      // 创建反向副本以避免修改原数组
      const reversedIndices = [...nonEmptyIndices].reverse();
      const prevIndex = reversedIndices.find((idx) => idx < currentIndex);
      return prevIndex !== undefined
        ? prevIndex
        : (nonEmptyIndices[nonEmptyIndices.length - 1] ?? null); // 循环到最后一个
    }
  };


  // 取消当前正在编辑的段落
  const cancelCurrentEditing = () => {
    if (currentlyEditingParagraphId.value === null) return;

    const editingParagraphId = currentlyEditingParagraphId.value;
    const paragraph = selectedChapterParagraphs.value.find((p) => p.id === editingParagraphId);
    if (paragraph) {
      const cardRef = paragraphCardRefs.get(paragraph.id);
      if (cardRef && typeof (cardRef as { stopEditing?: () => void }).stopEditing === 'function') {
        (cardRef as { stopEditing: () => void }).stopEditing();
      }
    }
    currentlyEditingParagraphId.value = null;
  };

  const resolveNonEmptyTargetIndex = (targetIndex: number): number | null => {
    const paragraph = selectedChapterParagraphs.value[targetIndex];
    if (!paragraph || !isEmptyParagraph(paragraph.text)) return targetIndex;
    const nextNonEmpty = findNextNonEmptyParagraph(targetIndex, 'down');
    if (nextNonEmpty !== null) return nextNonEmpty;
    const prevNonEmpty = findNextNonEmptyParagraph(targetIndex, 'up');
    if (prevNonEmpty !== null) return prevNonEmpty;
    return null;
  };

  const applyKeyboardSelectionEffect = () => {
    isClickSelected.value = false;
    if (clearSelectionTimeoutId.value !== null) {
      clearTimeout(clearSelectionTimeoutId.value);
    }
    clearSelectionTimeoutId.value = setTimeout(() => {
      isKeyboardSelected.value = false;
      clearSelectionTimeoutId.value = null;
    }, 2000);
  };

  const markProgrammaticKeyboardScroll = () => {
    lastKeyboardNavigationTime.value = Date.now();
    if (programmaticScrollTimeoutId.value !== null) {
      clearTimeout(programmaticScrollTimeoutId.value);
    }
    isProgrammaticScrolling.value = true;
    programmaticScrollTimeoutId.value = setTimeout(() => {
      isProgrammaticScrolling.value = false;
      programmaticScrollTimeoutId.value = null;
    }, 600);
  };

  const focusParagraphElement = (element: HTMLElement) => {
    nextTick(() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        element.focus({ preventScroll: true } as any);
      } catch {
        element.focus();
      }
    });
  };

  const scrollAndFocusParagraph = (paragraphId: string, scroll: boolean) => {
    const index = selectedChapterParagraphs.value.findIndex((p) => p.id === paragraphId);
    revealParagraph(index, paragraphId, (el) => focusParagraphElement(el), scroll);
  };

  // 导航到指定段落（跳过空段落）
  const navigateToParagraph = (
    index: number,
    scroll: boolean = true,
    isKeyboard: boolean = false,
  ) => {
    if (!selectedChapterParagraphs.value.length) return;

    const maxIndex = selectedChapterParagraphs.value.length - 1;
    const clamped = Math.max(0, Math.min(index, maxIndex));
    const resolved = resolveNonEmptyTargetIndex(clamped);
    if (resolved === null) return;
    const targetIndex = resolved;

    const previousIndex = selectedParagraphIndex.value;
    if (previousIndex !== null && previousIndex !== targetIndex) {
      cancelCurrentEditing();
    }

    selectedParagraphIndex.value = targetIndex;
    isKeyboardSelected.value = isKeyboard;
    if (isKeyboard) applyKeyboardSelectionEffect();

    if (!scroll) return;
    if (isKeyboard) markProgrammaticKeyboardScroll();
    const targetParagraph = selectedChapterParagraphs.value[targetIndex];
    if (targetParagraph) scrollAndFocusParagraph(targetParagraph.id, scroll);
  };

  // 处理段落点击，设置选中段落
  const handleParagraphClick = (paragraphId: string) => {
    if (!selectedChapterParagraphs.value.length) return;

    const index = selectedChapterParagraphs.value.findIndex((p) => p.id === paragraphId);
    if (index !== -1) {
      const paragraph = selectedChapterParagraphs.value[index];
      if (!paragraph) return;

      // 如果点击的是空段落，找到最近的非空段落
      let targetIndex = index;
      if (isEmptyParagraph(paragraph.text)) {
        const nextNonEmpty = findNextNonEmptyParagraph(index, 'down');
        if (nextNonEmpty !== null) {
          targetIndex = nextNonEmpty;
        } else {
          const prevNonEmpty = findNextNonEmptyParagraph(index, 'up');
          if (prevNonEmpty !== null) {
            targetIndex = prevNonEmpty;
          } else {
            return; // 没有非空段落
          }
        }
      }

      // 如果点击的段落已经被选中，不需要重新触发选择
      if (selectedParagraphIndex.value === targetIndex) {
        return;
      }

      // 如果切换到不同的段落，取消当前正在编辑的段落
      if (selectedParagraphIndex.value !== null && selectedParagraphIndex.value !== targetIndex) {
        cancelCurrentEditing();
      }

      // 设置选中段落（不滚动，显示选中效果）
      selectedParagraphIndex.value = targetIndex;
      isKeyboardSelected.value = false;
      isClickSelected.value = true; // 点击选中时显示选中效果
      // 清除键盘导航状态
      isKeyboardNavigating.value = false;
      lastKeyboardNavigationTime.value = null;
      // 清除之前的定时器
      if (clearSelectionTimeoutId.value !== null) {
        clearTimeout(clearSelectionTimeoutId.value);
      }
      // 2 秒后清除选中效果
      clearSelectionTimeoutId.value = setTimeout(() => {
        isClickSelected.value = false;
        clearSelectionTimeoutId.value = null;
      }, 2000);

      // 将焦点转移到选中的段落
      nextTick(() => {
        const targetParagraph = selectedChapterParagraphs.value[targetIndex];
        if (targetParagraph) {
          const element = document.getElementById(`paragraph-${targetParagraph.id}`);
          if (element) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              element.focus({ preventScroll: true } as any);
            } catch {
              element.focus();
            }
          }
        }
      });
    }
  };

  // 处理段落开始编辑事件
  const handleParagraphEditStart = (paragraphId: string) => {
    // 如果已经有其他段落在编辑，先取消它
    if (currentlyEditingParagraphId.value !== null && currentlyEditingParagraphId.value !== paragraphId) {
      cancelCurrentEditing();
    }
    currentlyEditingParagraphId.value = paragraphId;
  };

  // 处理段落停止编辑事件
  const handleParagraphEditStop = (paragraphId: string) => {
    // 如果停止编辑的段落是当前正在编辑的段落，清除编辑状态
    if (currentlyEditingParagraphId.value === paragraphId) {
      currentlyEditingParagraphId.value = null;
    }
  };

  // 开始编辑当前选中的段落
  const startEditingSelectedParagraph = () => {
    if (selectedParagraphIndex.value === null || !selectedChapterParagraphs.value.length) return;

    const index = selectedParagraphIndex.value;
    const paragraph = selectedChapterParagraphs.value[index];
    if (!paragraph) return;

    // 如果已经有其他段落在编辑，先取消它
    if (
      currentlyEditingParagraphId.value !== null &&
      currentlyEditingParagraphId.value !== paragraph.id
    ) {
      cancelCurrentEditing();
    }

    // 虚拟化下目标段落可能不在 DOM：先滚动入视、挂载后再命令式开始编辑
    revealParagraph(
      index,
      paragraph.id,
      () => {
        const cardRef = paragraphCardRefs.get(paragraph.id);
        if (
          cardRef &&
          typeof (cardRef as { startEditing?: () => void }).startEditing === 'function'
        ) {
          currentlyEditingParagraphId.value = paragraph.id;
          (cardRef as { startEditing: () => void }).startEditing();
        }
      },
      true,
    );
  };

  // 清理所有 timeout（用于组件卸载时）
  const cleanup = () => {
    clearAllNavigationTimeouts();
  };

  return {
    // 状态
    selectedParagraphIndex,
    paragraphCardRefs,
    isKeyboardSelected,
    isClickSelected,
    isKeyboardNavigating,
    isProgrammaticScrolling,
    lastKeyboardNavigationTime,
    resetNavigationTimeoutId,
    // 函数
    resetParagraphNavigation,
    getNonEmptyParagraphIndices,
    findNextNonEmptyParagraph,
    navigateToParagraph,
    handleParagraphClick,
    cancelCurrentEditing,
    handleParagraphEditStart,
    handleParagraphEditStop,
    startEditingSelectedParagraph,
    cleanup,
  };
}
