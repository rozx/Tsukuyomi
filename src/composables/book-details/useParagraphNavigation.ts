import { ref, nextTick, type Ref, type ComputedRef } from 'vue';
import { isEmptyParagraph } from 'src/utils';
import type { Paragraph } from 'src/models/novel';
import type ParagraphCard from 'src/components/novel/ParagraphCard.vue';

export function useParagraphNavigation(
  selectedChapterParagraphs: ComputedRef<Paragraph[]>,
  scrollableContentRef: Ref<HTMLElement | null>,
  currentlyEditingParagraphId: Ref<string | null>,
) {
  // 段落导航状态
  const selectedParagraphIndex = ref<number | null>(null);
  const paragraphCardRefs = ref<Map<string, InstanceType<typeof ParagraphCard>>>(new Map());
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

  // 重置段落导航
  const resetParagraphNavigation = () => {
    selectedParagraphIndex.value = null;
    isKeyboardSelected.value = false;
    isClickSelected.value = false;
    isKeyboardNavigating.value = false;
    lastKeyboardNavigationTime.value = null;
    // 清除程序化滚动的 timeout
    if (programmaticScrollTimeoutId.value !== null) {
      clearTimeout(programmaticScrollTimeoutId.value);
      programmaticScrollTimeoutId.value = null;
    }
    // 清除重置导航的防抖 timeout
    if (resetNavigationTimeoutId.value !== null) {
      clearTimeout(resetNavigationTimeoutId.value);
      resetNavigationTimeoutId.value = null;
    }
    // 清除选中效果的 timeout
    if (clearSelectionTimeoutId.value !== null) {
      clearTimeout(clearSelectionTimeoutId.value);
      clearSelectionTimeoutId.value = null;
    }
    isProgrammaticScrolling.value = false;
  };

  // --- 滚动动画控制（解决“按住方向键时动画互相打架导致滚动冻结”）---
  let activeScrollAnimationToken = 0;
  let activeScrollRafId: number | null = null;
  let lastScrollRequestAt = 0;
  let activeScrollContainer: HTMLElement | null = null;
  let activeScrollTargetTop: number | null = null;
  let activeScrollStartTime: number | null = null;

  const startScrollAnimationLoop = () => {
    if (!activeScrollContainer || activeScrollTargetTop === null) return;
    // 取消上一段循环（如果存在），只保留一个持续动画
    activeScrollAnimationToken++;
    const myToken = activeScrollAnimationToken;
    if (activeScrollRafId !== null && typeof cancelAnimationFrame === 'function') {
      try {
        cancelAnimationFrame(activeScrollRafId);
      } catch {
        // ignore
      }
    }
    activeScrollRafId = null;
    activeScrollStartTime = null;

    const step = (t: number) => {
      if (myToken !== activeScrollAnimationToken) return;
      if (!activeScrollContainer || activeScrollTargetTop === null) {
        activeScrollRafId = null;
        return;
      }

      if (activeScrollStartTime === null) {
        activeScrollStartTime = t;
      }

      const current = activeScrollContainer.scrollTop;
      const target = activeScrollTargetTop;
      const delta = target - current;
      const absDelta = Math.abs(delta);

      // 目标很近：直接到位结束
      if (absDelta < 0.5) {
        activeScrollContainer.scrollTop = target;
        activeScrollRafId = null;
        return;
      }

      // 120ms 兜底：避免在高负载/低帧率时永远追不上
      if (t - activeScrollStartTime >= 120) {
        activeScrollContainer.scrollTop = target;
        activeScrollRafId = null;
        return;
      }

      // 平滑追踪（类似阻尼）：每帧移动一部分距离，并限制最大步长避免大跳
      const maxStep = 80; // px/frame
      const stepSize = Math.min(maxStep, Math.max(6, absDelta * 0.35));
      activeScrollContainer.scrollTop = current + Math.sign(delta) * stepSize;

      activeScrollRafId = requestAnimationFrame(step);
    };

    activeScrollRafId = requestAnimationFrame(step);
  };

  // 获取非空段落的索引列表
  const getNonEmptyParagraphIndices = (): number[] => {
    return selectedChapterParagraphs.value
      .map((p, index) => (!isEmptyParagraph(p) ? index : -1))
      .filter((index) => index !== -1);
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

  /**
   * 计算“最小滚动”策略下的目标 scrollTop。
   * - 当元素已在可视区域内（含上下缓冲区 marginPx）时返回 null（不滚动）
   * - 当元素在上方：把元素顶边滚到可视区域上边缘 + margin
   * - 当元素在下方：把元素底边滚到可视区域下边缘 - margin
   */
  const computeRevealScrollTop = (params: {
    elementTop: number;
    elementHeight: number;
    containerHeight: number;
    currentScrollTop: number;
    marginPx: number;
  }): number | null => {
    const { elementTop, elementHeight, containerHeight, currentScrollTop, marginPx } = params;
    const elementBottom = elementTop + elementHeight;

    const visibleTop = currentScrollTop;
    const visibleBottom = currentScrollTop + containerHeight;

    const topThreshold = visibleTop + marginPx;
    const bottomThreshold = visibleBottom - marginPx;

    // 已经在“舒适区”内，不需要滚动
    if (elementTop >= topThreshold && elementBottom <= bottomThreshold) {
      return null;
    }

    // 元素在上方：尽量把元素顶边对齐到 topThreshold
    if (elementTop < topThreshold) {
      return Math.max(0, elementTop - marginPx);
    }

    // 元素在下方：尽量把元素底边对齐到 bottomThreshold
    if (elementBottom > bottomThreshold) {
      return Math.max(0, elementBottom - containerHeight + marginPx);
    }

    return null;
  };

  // 快速滚动到元素（使用自定义动画；仅在元素超出可视区域时滚动，避免每次都居中导致视线跳动）
  const scrollToElementFast = (element: HTMLElement) => {
    // 找到可滚动的容器
    // 注意：BookDetailsPage 在“章节已选择”时，真实滚动容器通常是 `.chapter-content-panel`，
    // 而不是外层的 `.scrollable-content`。因此这里优先从元素向上查找最近的滚动容器。
    const findScrollContainer = (): HTMLElement | null => {
      // 1) 优先使用章节内容面板（章节页段落列表的真实滚动容器）
      try {
        const closestFn = (element as unknown as { closest?: (selector: string) => Element | null })
          .closest;
        if (typeof closestFn === 'function') {
          const chapterPanel = closestFn.call(element, '.chapter-content-panel') as HTMLElement | null;
          if (chapterPanel) return chapterPanel;
        }
      } catch {
        // 忽略 closest 不存在或调用失败（例如在单元测试 stub 中）
      }

      // 2) 退回到外层传入的容器（用于非 split 布局或未来调整）
      const refContainer = scrollableContentRef.value;
      if (refContainer) return refContainer;

      // 3) 最后再兜底：从元素向上找第一个可滚动祖先
      let cur: HTMLElement | null = element.parentElement;
      while (cur && cur !== document.body) {
        try {
          const style = window.getComputedStyle(cur);
          const overflowY = style.overflowY;
          const isScrollable = (overflowY === 'auto' || overflowY === 'scroll') && cur.scrollHeight > cur.clientHeight;
          if (isScrollable) return cur;
        } catch {
          // 忽略计算样式失败的情况
        }
        cur = cur.parentElement;
      }
      return null;
    };

    const scrollContainer = findScrollContainer();
    if (!scrollContainer) {
      // 如果没有找到容器，回退到 window 滚动
      element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    // 计算元素相对于容器的位置
    const elementTopRelativeToContainer =
      elementRect.top - containerRect.top + scrollContainer.scrollTop;
    const elementHeight = elementRect.height;
    const containerHeight = containerRect.height;

    // 计算“最小滚动”目标：只在元素超出可视区域时滚动，并预留一定缓冲区
    const marginPx = Math.round(Math.min(120, Math.max(24, containerHeight * 0.15)));
    const targetScrollY = computeRevealScrollTop({
      elementTop: elementTopRelativeToContainer,
      elementHeight,
      containerHeight,
      currentScrollTop: scrollContainer.scrollTop,
      marginPx,
    });

    // 元素已经在可视范围内，不滚动
    if (targetScrollY === null) {
      return;
    }

    const now = Date.now();
    const isRapidRepeat = now - lastScrollRequestAt < 60;
    lastScrollRequestAt = now;

    // 统一用“单一持续动画”追踪目标：按住键时只更新目标，不会冻结也不会跳
    activeScrollContainer = scrollContainer;
    activeScrollTargetTop = targetScrollY;

    // 连发时不重新启动循环（避免频繁 cancel），只更新目标；首次/非连发则启动
    if (!isRapidRepeat || activeScrollRafId === null) {
      startScrollAnimationLoop();
    }
  };

  // 取消当前正在编辑的段落
  const cancelCurrentEditing = () => {
    if (currentlyEditingParagraphId.value === null) return;

    const editingParagraphId = currentlyEditingParagraphId.value;
    const paragraph = selectedChapterParagraphs.value.find((p) => p.id === editingParagraphId);
    if (paragraph) {
      const cardRef = paragraphCardRefs.value.get(paragraph.id);
      if (cardRef && typeof (cardRef as { stopEditing?: () => void }).stopEditing === 'function') {
        (cardRef as { stopEditing: () => void }).stopEditing();
      }
    }
    currentlyEditingParagraphId.value = null;
  };

  // 导航到指定段落（跳过空段落）
  const navigateToParagraph = (
    index: number,
    scroll: boolean = true,
    isKeyboard: boolean = false,
  ) => {
    if (!selectedChapterParagraphs.value.length) return;

    // 限制索引范围
    const maxIndex = selectedChapterParagraphs.value.length - 1;
    let targetIndex = Math.max(0, Math.min(index, maxIndex));

    // 如果目标段落是空的，查找最近的非空段落
    const paragraph = selectedChapterParagraphs.value[targetIndex];
    if (paragraph && isEmptyParagraph(paragraph)) {
      // 先尝试向下查找
      const nextNonEmpty = findNextNonEmptyParagraph(targetIndex, 'down');
      if (nextNonEmpty !== null) {
        targetIndex = nextNonEmpty;
      } else {
        // 如果向下找不到，尝试向上查找
        const prevNonEmpty = findNextNonEmptyParagraph(targetIndex, 'up');
        if (prevNonEmpty !== null) {
          targetIndex = prevNonEmpty;
        } else {
          // 如果都找不到，说明没有非空段落，直接返回
          return;
        }
      }
    }

    // 如果切换到不同的段落，取消当前正在编辑的段落
    const previousIndex = selectedParagraphIndex.value;
    if (previousIndex !== null && previousIndex !== targetIndex) {
      cancelCurrentEditing();
    }

    selectedParagraphIndex.value = targetIndex;
    // 只有键盘导航时才显示选中效果
    isKeyboardSelected.value = isKeyboard;
    // 如果是键盘导航，清除点击选中状态
    if (isKeyboard) {
      isClickSelected.value = false;
      // 清除之前的定时器
      if (clearSelectionTimeoutId.value !== null) {
        clearTimeout(clearSelectionTimeoutId.value);
      }
      // 2 秒后清除键盘选中效果
      clearSelectionTimeoutId.value = setTimeout(() => {
        isKeyboardSelected.value = false;
        clearSelectionTimeoutId.value = null;
      }, 2000);
    }

    // 自动滚动到选中的段落（如果启用）
    if (scroll) {
      // 如果是键盘导航触发的滚动，标记为程序化滚动
      if (isKeyboard) {
        // 更新最后一次键盘导航的时间
        lastKeyboardNavigationTime.value = Date.now();
        // 清除之前的 timeout（如果存在）
        if (programmaticScrollTimeoutId.value !== null) {
          clearTimeout(programmaticScrollTimeoutId.value);
        }
        isProgrammaticScrolling.value = true;
        // 在滚动动画完成后清除标志（使用更快的动画，缩短到 600ms）
        // 这样可以避免平滑滚动的余波被误判为用户滚动
        programmaticScrollTimeoutId.value = setTimeout(() => {
          isProgrammaticScrolling.value = false;
          programmaticScrollTimeoutId.value = null;
        }, 600);
      }
      const targetParagraph = selectedChapterParagraphs.value[targetIndex];
      if (targetParagraph) {
        const cardRef = paragraphCardRefs.value.get(targetParagraph.id);
        if (cardRef) {
          // 获取组件的 DOM 元素
          const element =
            (cardRef as { $el?: HTMLElement }).$el || (cardRef as unknown as HTMLElement);
          if (element instanceof HTMLElement) {
            if (scroll) {
              scrollToElementFast(element);
            }
            // 将焦点转移到选中的段落
            nextTick(() => {
              // 避免 focus 触发浏览器自动滚动（会导致“看起来仍在居中/大幅跳动”）
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                element.focus({ preventScroll: true } as any);
              } catch {
                element.focus();
              }
            });
          }
        } else {
          // 如果 ref 还没有设置，使用 DOM 查询
          nextTick(() => {
            const element = document.getElementById(`paragraph-${targetParagraph.id}`);
            if (element) {
              if (scroll) {
                scrollToElementFast(element);
              }
              // 将焦点转移到选中的段落
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                element.focus({ preventScroll: true } as any);
              } catch {
                element.focus();
              }
            }
          });
        }
      }
    }
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
      if (isEmptyParagraph(paragraph)) {
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

    const paragraph = selectedChapterParagraphs.value[selectedParagraphIndex.value];
    if (paragraph) {
      // 如果已经有其他段落在编辑，先取消它
      if (
        currentlyEditingParagraphId.value !== null &&
        currentlyEditingParagraphId.value !== paragraph.id
      ) {
        cancelCurrentEditing();
      }

      const cardRef = paragraphCardRefs.value.get(paragraph.id);
      if (cardRef) {
        currentlyEditingParagraphId.value = paragraph.id;
        cardRef.startEditing();
      }
    }
  };

  // 清理所有 timeout（用于组件卸载时）
  const cleanup = () => {
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
    scrollToElementFast,
    navigateToParagraph,
    handleParagraphClick,
    cancelCurrentEditing,
    handleParagraphEditStart,
    handleParagraphEditStop,
    startEditingSelectedParagraph,
    cleanup,
  };
}
