import { nextTick, type Ref, type ComputedRef } from 'vue';
import type { Chapter, Paragraph } from 'src/models/novel';
import { isEmptyParagraph } from 'src/utils';

/**
 * useKeyboardShortcuts 的参数选项。
 * 将原先 20+ 个位置参数整合成单一对象，降低调用端的重复样板代码。
 */
export interface ShortcutRegistrationOptions {
  // 搜索替换相关
  isSearchVisible: Ref<boolean>;
  toggleSearch: () => void;
  showReplace: Ref<boolean>;
  nextMatch: () => void;
  prevMatch: () => void;
  // 导出相关
  copyAllTranslatedText: () => Promise<void>;
  selectedChapterWithContent: Ref<Chapter | null>;
  selectedChapterParagraphs: ComputedRef<Paragraph[]>;
  // 组件状态
  selectedChapter: Ref<Chapter | null>;
  selectedSettingMenu: Ref<'terms' | 'characters' | 'memory' | null>;
  editMode: Ref<'original' | 'translation' | 'preview'>;
  // 段落导航相关
  selectedParagraphIndex: Ref<number | null>;
  isKeyboardNavigating: Ref<boolean>;
  isKeyboardSelected: Ref<boolean>;
  isClickSelected: Ref<boolean>;
  isProgrammaticScrolling: Ref<boolean>;
  lastKeyboardNavigationTime: Ref<number | null>;
  resetNavigationTimeoutId: Ref<ReturnType<typeof setTimeout> | null>;
  getNonEmptyParagraphIndices: () => number[];
  findNextNonEmptyParagraph: (currentIndex: number, direction: 'up' | 'down') => number | null;
  navigateToParagraph: (index: number, scroll?: boolean, isKeyboard?: boolean) => void;
  startEditingSelectedParagraph: () => void;
  // 撤销/重做
  canUndo: ComputedRef<boolean>;
  undo: () => Promise<void>;
  canRedo: ComputedRef<boolean>;
  redo: () => Promise<void>;
}

export function useKeyboardShortcuts(opts: ShortcutRegistrationOptions) {
  const {
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
  } = opts;

  const INTERACTIVE_OVERLAY_SELECTOR = [
    // PrimeVue 常见 overlay/popup 容器
    '.p-tieredmenu',
    '.p-menu',
    '.p-contextmenu',
    '.p-dropdown-panel',
    '.p-multiselect-panel',
    '.p-overlaypanel',
    '.p-dialog',
    // 通用 ARIA role
    '[role="menu"]',
    '[role="listbox"]',
    '[role="tree"]',
    '[role="grid"]',
    '[role="combobox"]',
  ].join(',');

  /**
   * 查找替换相关快捷键：Ctrl+F / Ctrl+H / F3 / Shift+F3 / Escape。
   * 返回 true 表示已处理。
   */
  const tryHandleSearchShortcut = (event: KeyboardEvent, isInputElement: boolean): boolean => {
    const hasMod = event.ctrlKey || event.metaKey;

    // Ctrl+F / Cmd+F
    if (hasMod && event.key === 'f' && !event.shiftKey) {
      if (isSearchVisible.value && isInputElement) return true;
      event.preventDefault();
      toggleSearch();
      return true;
    }

    // Ctrl+H / Cmd+H
    if (hasMod && event.key === 'h' && !event.shiftKey) {
      if (isInputElement) return true;
      event.preventDefault();
      if (isSearchVisible.value) {
        showReplace.value = !showReplace.value;
      } else {
        toggleSearch();
        nextTick(() => {
          showReplace.value = true;
        });
      }
      return true;
    }

    // F3 / Shift+F3（仅在搜索工具栏打开且不在输入框时响应）
    if (event.key === 'F3' && !event.ctrlKey && !event.metaKey) {
      if (isSearchVisible.value && !isInputElement) {
        event.preventDefault();
        if (event.shiftKey) prevMatch();
        else nextMatch();
      }
      return true;
    }

    // Escape：关闭搜索
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (isSearchVisible.value) {
        event.preventDefault();
        toggleSearch();
        return true;
      }
    }

    return false;
  };

  /**
   * Ctrl+Shift+C: 复制所有已翻译文本。
   */
  const tryHandleCopyShortcut = (event: KeyboardEvent, isInputElement: boolean): boolean => {
    const isCopyCombo =
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'c' &&
      !event.altKey;
    if (!isCopyCombo) return false;
    if (isInputElement) return true;
    event.preventDefault();
    if (selectedChapterWithContent.value && selectedChapterParagraphs.value.length > 0) {
      void copyAllTranslatedText();
    }
    return true;
  };

  /**
   * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z: 撤销 / 重做。
   */
  const tryHandleUndoRedoShortcut = (
    event: KeyboardEvent,
    isInputElement: boolean,
  ): boolean => {
    const hasMod = event.ctrlKey || event.metaKey;

    if (hasMod && event.key === 'z' && !event.shiftKey) {
      if (!isInputElement && canUndo.value) {
        event.preventDefault();
        void undo();
      }
      return true;
    }

    const isRedoCombo =
      (hasMod && event.key === 'y') ||
      (hasMod && event.shiftKey && event.key === 'z');
    if (isRedoCombo) {
      if (!isInputElement && canRedo.value) {
        event.preventDefault();
        void redo();
      }
      return true;
    }

    return false;
  };

  /**
   * 计算箭头导航起点：若当前索引为空段落，跳到最近的非空段落。
   * 找不到非空段落时返回 null。
   */
  const resolveArrowNavigationStart = (): number | null => {
    if (selectedChapterParagraphs.value.length === 0) return null;

    let currentIndex: number;
    if (selectedParagraphIndex.value !== null) {
      currentIndex = selectedParagraphIndex.value;
    } else {
      const nonEmptyIndices = getNonEmptyParagraphIndices();
      if (nonEmptyIndices.length === 0) return null;
      const firstIndex = nonEmptyIndices[0];
      if (firstIndex === undefined) return null;
      currentIndex = firstIndex;
      selectedParagraphIndex.value = currentIndex;
    }

    const paragraph = selectedChapterParagraphs.value[currentIndex];
    if (paragraph && isEmptyParagraph(paragraph.text)) {
      const nextNonEmpty = findNextNonEmptyParagraph(currentIndex, 'down');
      if (nextNonEmpty !== null) {
        currentIndex = nextNonEmpty;
      } else {
        const prevNonEmpty = findNextNonEmptyParagraph(currentIndex, 'up');
        if (prevNonEmpty === null) return null;
        currentIndex = prevNonEmpty;
      }
      selectedParagraphIndex.value = currentIndex;
    }

    return currentIndex;
  };

  /**
   * 从 currentIndex 在 nonEmptyIndices 中计算 ArrowUp/ArrowDown 的目标下标。
   */
  const computeNextArrowTarget = (
    nonEmptyIndices: number[],
    currentIndex: number,
    direction: 'up' | 'down',
  ): number | undefined => {
    if (nonEmptyIndices.length === 0) return undefined;

    let currentNonEmptyIndex = nonEmptyIndices.findIndex((idx) => idx === currentIndex);
    if (currentNonEmptyIndex === -1) {
      if (direction === 'up') {
        const reversedIndices = [...nonEmptyIndices].reverse();
        const foundIndex = reversedIndices.findIndex((idx) => idx < currentIndex);
        currentNonEmptyIndex =
          foundIndex !== -1 ? nonEmptyIndices.length - 1 - foundIndex : nonEmptyIndices.length - 1;
      } else {
        const foundIndex = nonEmptyIndices.findIndex((idx) => idx > currentIndex);
        currentNonEmptyIndex = foundIndex === -1 ? 0 : foundIndex;
      }
    }

    const targetNonEmptyIndex =
      direction === 'up'
        ? currentNonEmptyIndex > 0
          ? currentNonEmptyIndex - 1
          : nonEmptyIndices.length - 1
        : currentNonEmptyIndex < nonEmptyIndices.length - 1
          ? currentNonEmptyIndex + 1
          : 0;
    return nonEmptyIndices[targetNonEmptyIndex];
  };

  /**
   * 箭头键段落导航（翻译模式下）。
   */
  const tryHandleArrowNavigation = (
    event: KeyboardEvent,
    isInInteractiveOverlay: boolean,
  ): boolean => {
    const isArrowKey = event.key === 'ArrowUp' || event.key === 'ArrowDown';
    if (!isArrowKey) return false;
    if (!selectedChapter.value) return false;
    if (selectedSettingMenu.value) return false;
    if (editMode.value !== 'translation') return false;
    if (isInInteractiveOverlay) return false;

    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
    }

    isKeyboardNavigating.value = true;
    lastKeyboardNavigationTime.value = Date.now();
    if (resetNavigationTimeoutId.value !== null) {
      clearTimeout(resetNavigationTimeoutId.value);
      resetNavigationTimeoutId.value = null;
    }

    const currentIndex = resolveArrowNavigationStart();
    if (currentIndex === null) return true;

    if (!isKeyboardSelected.value) {
      isClickSelected.value = false;
      if (selectedParagraphIndex.value === currentIndex) {
        isKeyboardSelected.value = true;
      } else {
        navigateToParagraph(currentIndex, false, true);
        return true;
      }
    }

    const direction = event.key === 'ArrowUp' ? 'up' : 'down';
    const targetIndex = computeNextArrowTarget(
      getNonEmptyParagraphIndices(),
      currentIndex,
      direction,
    );
    if (targetIndex !== undefined) {
      navigateToParagraph(targetIndex, true, true);
    }
    return true;
  };

  /**
   * Enter: 在翻译模式下对选中段落开始编辑。
   */
  const tryHandleEnterEdit = (event: KeyboardEvent): boolean => {
    const isPlainEnter =
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey;
    if (!isPlainEnter) return false;
    if (!selectedChapter.value || selectedSettingMenu.value) return false;
    if (editMode.value !== 'translation') return false;
    if (selectedParagraphIndex.value === null) return false;

    event.preventDefault();
    startEditingSelectedParagraph();
    return true;
  };

  // 键盘快捷键处理
  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isInputElement =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
    const isInInteractiveOverlay = !!target.closest(INTERACTIVE_OVERLAY_SELECTOR);

    // 全局快捷键：在输入框中也要处理（自己内部判断）
    if (tryHandleSearchShortcut(event, isInputElement)) return;
    if (tryHandleCopyShortcut(event, isInputElement)) return;
    if (tryHandleUndoRedoShortcut(event, isInputElement)) return;

    // 其余快捷键仅在非输入框中响应
    if (isInputElement) return;

    if (tryHandleArrowNavigation(event, isInInteractiveOverlay)) return;
    tryHandleEnterEdit(event);
  };

  // 处理点击事件，重置键盘导航状态（允许鼠标悬停再次生效）
  const handleClick = (event: MouseEvent) => {
    // 如果点击的不是段落卡片，重置键盘导航状态
    const target = event.target as HTMLElement;
    const isParagraphCard =
      target.closest('.paragraph-card') || target.closest('.paragraph-with-line-number');
    if (!isParagraphCard) {
      isKeyboardNavigating.value = false;
      lastKeyboardNavigationTime.value = null;
    }
  };

  // 性能优化：用 requestAnimationFrame 节流 mousemove/scroll 处理器，
  // 避免在窗口捕获阶段对每个事件都跑一次处理逻辑（mousemove 可达 120+/s）。
  // 每帧至多执行一次（约 16ms），对 UI 响应无感知影响。
  // 在没有 rAF 的测试环境中回退到 setTimeout(16)。
  const scheduleFrame: (cb: () => void) => void =
    typeof requestAnimationFrame === 'function'
      ? (cb) => {
          requestAnimationFrame(cb);
        }
      : (cb) => {
          setTimeout(cb, 16);
        };
  const rafThrottle = (fn: () => void): (() => void) => {
    let scheduled = false;
    return () => {
      if (scheduled) return;
      scheduled = true;
      scheduleFrame(() => {
        scheduled = false;
        fn();
      });
    };
  };

  // 处理鼠标移动事件，重新启用鼠标悬停逻辑
  // 但忽略程序化滚动期间的鼠标移动（滚动时鼠标相对位置会变化，触发 mousemove）
  const handleMouseMove = rafThrottle(() => {
    const now = Date.now();
    const timeSinceLastKeyboardNav = lastKeyboardNavigationTime.value
      ? now - lastKeyboardNavigationTime.value
      : Infinity;

    // 只有在非程序化滚动，且距离最后一次键盘导航超过 2 秒时才重置键盘导航状态
    // 这样可以避免滚动时鼠标相对位置变化触发的 mousemove 重置状态
    if (!isProgrammaticScrolling.value && timeSinceLastKeyboardNav > 2000) {
      // 使用防抖，避免频繁重置（只有在停止鼠标移动 300ms 后才真正重置）
      if (resetNavigationTimeoutId.value !== null) {
        clearTimeout(resetNavigationTimeoutId.value);
      }
      resetNavigationTimeoutId.value = setTimeout(() => {
        if (isKeyboardNavigating.value) {
          isKeyboardNavigating.value = false;
          lastKeyboardNavigationTime.value = null;
        }
        resetNavigationTimeoutId.value = null;
      }, 300);
    }
  });

  // 处理滚动事件，重新启用鼠标悬停逻辑
  // 但忽略程序化滚动（由键盘导航触发的滚动）
  const handleScroll = rafThrottle(() => {
    const now = Date.now();
    const timeSinceLastKeyboardNav = lastKeyboardNavigationTime.value
      ? now - lastKeyboardNavigationTime.value
      : Infinity;

    // 只有在非程序化滚动，且距离最后一次键盘导航超过 2 秒时才重置键盘导航状态
    // 这样可以避免：
    // 1. 键盘导航触发的 scrollIntoView 重置鼠标悬停状态
    // 2. 平滑滚动的余波在 timeout 之后被误判为用户滚动
    if (!isProgrammaticScrolling.value && timeSinceLastKeyboardNav > 2000) {
      // 使用防抖，避免频繁重置（只有在停止滚动 300ms 后才真正重置）
      if (resetNavigationTimeoutId.value !== null) {
        clearTimeout(resetNavigationTimeoutId.value);
      }
      resetNavigationTimeoutId.value = setTimeout(() => {
        if (isKeyboardNavigating.value) {
          isKeyboardNavigating.value = false;
          lastKeyboardNavigationTime.value = null;
        }
        resetNavigationTimeoutId.value = null;
      }, 300);
    }
  });

  return {
    handleKeydown,
    handleClick,
    handleMouseMove,
    handleScroll,
  };
}
