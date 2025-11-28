import { ref, nextTick, type Ref, type ComputedRef } from 'vue';
import { isEmptyParagraph } from 'src/utils';
import type { Paragraph } from 'src/models/novel';
import ParagraphCard from 'src/components/novel/ParagraphCard.vue';

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

  // 快速滚动到元素（使用自定义动画，比浏览器默认的 smooth 更快）
  const scrollToElementFast = (element: HTMLElement) => {
    // 找到可滚动的容器
    const scrollContainer = scrollableContentRef.value;
    if (!scrollContainer) {
      // 如果没有找到容器，回退到 window 滚动
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    const elementRect = element.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();

    // 计算元素相对于容器的位置
    const elementTopRelativeToContainer =
      elementRect.top - containerRect.top + scrollContainer.scrollTop;
    const elementHeight = elementRect.height;
    const containerHeight = containerRect.height;

    // 计算目标滚动位置（将元素居中）
    const targetScrollY = elementTopRelativeToContainer - containerHeight / 2 + elementHeight / 2;

    const startScrollY = scrollContainer.scrollTop;
    const distance = targetScrollY - startScrollY;
    const duration = 300; // 300ms 的快速动画
    let startTime: number | null = null;

    const easeInOutCubic = (t: number): number => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    const animateScroll = (currentTime: number) => {
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);
      const easedProgress = easeInOutCubic(progress);

      scrollContainer.scrollTop = startScrollY + distance * easedProgress;

      if (progress < 1) {
        requestAnimationFrame(animateScroll);
      }
    };

    requestAnimationFrame(animateScroll);
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
              element.focus();
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
              element.focus();
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

      // 如果点击的段落已经被选中，不需要重新显示选中效果
      if (
        selectedParagraphIndex.value === targetIndex &&
        (isKeyboardSelected.value || isClickSelected.value)
      ) {
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
            element.focus();
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
