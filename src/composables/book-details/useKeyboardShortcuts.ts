import { nextTick, type Ref, type ComputedRef } from 'vue';
import type { Chapter, Paragraph } from 'src/models/novel';
import { isEmptyParagraph } from 'src/utils';

export function useKeyboardShortcuts(
  // 搜索替换相关
  isSearchVisible: Ref<boolean>,
  toggleSearch: () => void,
  showReplace: Ref<boolean>,
  nextMatch: () => void,
  prevMatch: () => void,
  // 导出相关
  copyAllTranslatedText: () => Promise<void>,
  selectedChapterWithContent: Ref<Chapter | null>,
  selectedChapterParagraphs: ComputedRef<Paragraph[]>,
  // 组件状态
  selectedChapter: Ref<Chapter | null>,
  selectedSettingMenu: Ref<'terms' | 'characters' | null>,
  editMode: Ref<'original' | 'translation' | 'preview'>,
  // 段落导航相关
  selectedParagraphIndex: Ref<number | null>,
  isKeyboardNavigating: Ref<boolean>,
  isKeyboardSelected: Ref<boolean>,
  isClickSelected: Ref<boolean>,
  isProgrammaticScrolling: Ref<boolean>,
  lastKeyboardNavigationTime: Ref<number | null>,
  resetNavigationTimeoutId: Ref<ReturnType<typeof setTimeout> | null>,
  getNonEmptyParagraphIndices: () => number[],
  findNextNonEmptyParagraph: (currentIndex: number, direction: 'up' | 'down') => number | null,
  navigateToParagraph: (index: number, scroll?: boolean, isKeyboard?: boolean) => void,
  startEditingSelectedParagraph: () => void,
  // 撤销/重做
  canUndo: ComputedRef<boolean>,
  undo: () => Promise<void>,
  canRedo: ComputedRef<boolean>,
  redo: () => Promise<void>,
) {
  // 键盘快捷键处理
  const handleKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement;
    const isInputElement =
      target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

    // Ctrl+F 或 Cmd+F: 打开/关闭查找（如果不在搜索输入框中）
    if ((event.ctrlKey || event.metaKey) && event.key === 'f' && !event.shiftKey) {
      // 如果搜索工具栏已打开且焦点在搜索输入框，不处理（让浏览器默认行为处理）
      if (isSearchVisible.value && isInputElement) {
        return;
      }
      event.preventDefault();
      toggleSearch();
      return;
    }

    // Ctrl+H 或 Cmd+H: 打开/关闭替换（如果查找已打开）
    if ((event.ctrlKey || event.metaKey) && event.key === 'h' && !event.shiftKey) {
      // 如果焦点在输入框中，不处理
      if (isInputElement) {
        return;
      }
      event.preventDefault();
      if (isSearchVisible.value) {
        showReplace.value = !showReplace.value;
      } else {
        toggleSearch();
        // 延迟显示替换，确保搜索工具栏已打开
        nextTick(() => {
          showReplace.value = true;
        });
      }
      return;
    }

    // F3: 下一个匹配（仅在搜索工具栏打开时，且不在输入框中）
    if (event.key === 'F3' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (isSearchVisible.value && !isInputElement) {
        event.preventDefault();
        nextMatch();
      }
      return;
    }

    // Shift+F3: 上一个匹配（仅在搜索工具栏打开时，且不在输入框中）
    if (event.key === 'F3' && event.shiftKey && !event.ctrlKey && !event.metaKey) {
      if (isSearchVisible.value && !isInputElement) {
        event.preventDefault();
        prevMatch();
      }
      return;
    }

    // Escape: 关闭搜索工具栏（如果搜索工具栏已打开）
    if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
      if (isSearchVisible.value) {
        event.preventDefault();
        toggleSearch();
        return;
      }
    }

    // Ctrl+Shift+C 或 Cmd+Shift+C: 复制所有已翻译文本到剪贴板
    if (
      (event.ctrlKey || event.metaKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === 'c' &&
      !event.altKey
    ) {
      if (isInputElement) {
        return;
      }
      event.preventDefault();
      if (selectedChapterWithContent.value && selectedChapterParagraphs.value.length > 0) {
        void copyAllTranslatedText();
      }
      return;
    }

    // Ctrl+Z 或 Cmd+Z: 撤销（需要在输入框检查之前处理，但只在非输入框时生效）
    if ((event.ctrlKey || event.metaKey) && event.key === 'z' && !event.shiftKey) {
      if (!isInputElement && canUndo.value) {
        event.preventDefault();
        void undo();
      }
      return;
    }

    // Ctrl+Y 或 Ctrl+Shift+Z 或 Cmd+Shift+Z: 重做（需要在输入框检查之前处理，但只在非输入框时生效）
    if (
      ((event.ctrlKey || event.metaKey) && event.key === 'y') ||
      ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'z')
    ) {
      if (!isInputElement && canRedo.value) {
        event.preventDefault();
        void redo();
      }
      return;
    }

    // 如果用户在输入框中输入，不处理其他快捷键
    if (isInputElement) {
      return;
    }

    // 上下箭头键：在段落之间导航（仅在翻译模式下且不在预览模式下）
    if (
      selectedChapter.value &&
      !selectedSettingMenu.value &&
      editMode.value === 'translation' &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      if (selectedChapterParagraphs.value.length === 0) return;

      // 标记正在使用键盘导航
      isKeyboardNavigating.value = true;
      // 更新最后一次键盘导航的时间
      lastKeyboardNavigationTime.value = Date.now();
      // 清除重置导航的防抖 timeout（避免在键盘导航期间触发重置）
      if (resetNavigationTimeoutId.value !== null) {
        clearTimeout(resetNavigationTimeoutId.value);
        resetNavigationTimeoutId.value = null;
      }

      // 获取当前索引：使用 selectedParagraphIndex（如果已通过点击设置）
      // 如果 selectedParagraphIndex 是 null，说明还没有选中任何段落，需要找到第一个非空段落
      let currentIndex: number;
      if (selectedParagraphIndex.value !== null) {
        currentIndex = selectedParagraphIndex.value;
      } else {
        // 如果还没有选中，找到第一个非空段落作为起点
        const nonEmptyIndices = getNonEmptyParagraphIndices();
        if (nonEmptyIndices.length === 0) return;
        const firstIndex = nonEmptyIndices[0];
        if (firstIndex === undefined) return;
        currentIndex = firstIndex;
        // 设置选中段落
        selectedParagraphIndex.value = currentIndex;
      }

      // 确保当前索引对应的段落是非空的
      const paragraph = selectedChapterParagraphs.value[currentIndex];
      if (paragraph && isEmptyParagraph(paragraph)) {
        // 如果是空段落，找到最近的非空段落
        const nextNonEmpty = findNextNonEmptyParagraph(currentIndex, 'down');
        if (nextNonEmpty !== null) {
          currentIndex = nextNonEmpty;
        } else {
          const prevNonEmpty = findNextNonEmptyParagraph(currentIndex, 'up');
          if (prevNonEmpty !== null) {
            currentIndex = prevNonEmpty;
          } else {
            return; // 没有非空段落
          }
        }
        // 更新选中段落
        selectedParagraphIndex.value = currentIndex;
      }

      // 如果还没有显示键盘选中效果，需要先切换到键盘选中模式
      // 如果段落是通过点击选中的，第一次按箭头键应该直接开始导航
      // 如果段落还没有被选中，第一次按箭头键先显示选中效果
      if (!isKeyboardSelected.value) {
        // 清除点击选中状态，切换到键盘选中模式
        isClickSelected.value = false;
        // 如果段落已经被选中（通过点击），直接开始导航，不需要先显示选中效果
        if (selectedParagraphIndex.value === currentIndex) {
          isKeyboardSelected.value = true;
          // 继续执行下面的导航逻辑
        } else {
          // 如果段落还没有被选中，先显示选中效果
          navigateToParagraph(currentIndex, false, true); // 不滚动，只显示选中效果
          return;
        }
      }

      // 如果已经显示了选中效果，则移动到下一个/上一个段落
      if (event.key === 'ArrowUp') {
        // 向上导航到上一个非空段落
        const nonEmptyIndices = getNonEmptyParagraphIndices();
        if (nonEmptyIndices.length === 0) return;

        // 找到当前索引在非空段落列表中的位置
        let currentNonEmptyIndex = nonEmptyIndices.findIndex((idx) => idx === currentIndex);
        if (currentNonEmptyIndex === -1) {
          // 如果当前索引不在非空段落列表中（可能是空段落），找到第一个小于当前索引的
          const reversedIndices = [...nonEmptyIndices].reverse();
          const foundIndex = reversedIndices.findIndex((idx) => idx < currentIndex);
          if (foundIndex !== -1) {
            currentNonEmptyIndex = nonEmptyIndices.length - 1 - foundIndex;
          } else {
            // 如果都大于当前索引，选择最后一个
            currentNonEmptyIndex = nonEmptyIndices.length - 1;
          }
        }

        // 获取上一个非空段落的索引（循环）
        const prevNonEmptyIndex =
          currentNonEmptyIndex > 0 ? currentNonEmptyIndex - 1 : nonEmptyIndices.length - 1;
        const targetIndex = nonEmptyIndices[prevNonEmptyIndex];
        if (targetIndex !== undefined) {
          navigateToParagraph(targetIndex, true, true); // 键盘导航，显示效果
        }
      } else if (event.key === 'ArrowDown') {
        // 向下导航到下一个非空段落
        const nonEmptyIndices = getNonEmptyParagraphIndices();
        if (nonEmptyIndices.length === 0) return;

        // 找到当前索引在非空段落列表中的位置
        let currentNonEmptyIndex = nonEmptyIndices.findIndex((idx) => idx === currentIndex);
        if (currentNonEmptyIndex === -1) {
          // 如果当前索引不在非空段落列表中（可能是空段落），找到第一个大于当前索引的
          currentNonEmptyIndex = nonEmptyIndices.findIndex((idx) => idx > currentIndex);
          if (currentNonEmptyIndex === -1) {
            // 如果都小于当前索引，选择第一个
            currentNonEmptyIndex = 0;
          }
        }

        // 获取下一个非空段落的索引（循环）
        const nextNonEmptyIndex =
          currentNonEmptyIndex < nonEmptyIndices.length - 1 ? currentNonEmptyIndex + 1 : 0;
        const targetIndex = nonEmptyIndices[nextNonEmptyIndex];
        if (targetIndex !== undefined) {
          navigateToParagraph(targetIndex, true, true); // 键盘导航，显示效果
        }
      }
      return;
    }

    // Enter 键：开始编辑当前选中的段落（仅在翻译模式下）
    if (
      event.key === 'Enter' &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      !event.altKey &&
      selectedChapter.value &&
      !selectedSettingMenu.value &&
      editMode.value === 'translation' &&
      selectedParagraphIndex.value !== null
    ) {
      event.preventDefault();
      startEditingSelectedParagraph();
      return;
    }

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

  // 处理鼠标移动事件，重新启用鼠标悬停逻辑
  // 但忽略程序化滚动期间的鼠标移动（滚动时鼠标相对位置会变化，触发 mousemove）
  const handleMouseMove = () => {
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
  };

  // 处理滚动事件，重新启用鼠标悬停逻辑
  // 但忽略程序化滚动（由键盘导航触发的滚动）
  const handleScroll = () => {
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
  };

  return {
    handleKeydown,
    handleClick,
    handleMouseMove,
    handleScroll,
  };
}
