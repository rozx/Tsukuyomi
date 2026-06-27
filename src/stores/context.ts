import { defineStore, acceptHMRUpdate } from 'pinia';
import { isEmptyOrSymbolOnly } from 'src/utils/text-utils';

const STORAGE_KEY = 'tsukuyomi-context';

/**
 * 用户上下文状态
 */
interface ContextState {
  // 当前书籍 ID
  currentBookId: string | null;
  // 当前章节 ID
  currentChapterId: string | null;
  // 当前悬停的段落 ID
  hoveredParagraphId: string | null;
  // 当前选中的段落 ID
  selectedParagraphId: string | null;
}

/**
 * 从 localStorage 加载上下文状态
 */
function loadContextFromStorage(): ContextState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const state = JSON.parse(stored);
      return {
        currentBookId: state.currentBookId ?? null,
        currentChapterId: state.currentChapterId ?? null,
        hoveredParagraphId: state.hoveredParagraphId ?? null,
        selectedParagraphId: state.selectedParagraphId ?? null,
      };
    }
  } catch (error) {
    console.error('Failed to load context from storage:', error);
  }
  return {
    currentBookId: null,
    currentChapterId: null,
    hoveredParagraphId: null,
    selectedParagraphId: null,
  };
}

/**
 * 保存上下文状态到 localStorage
 */
function saveContextToStorage(state: ContextState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save context from storage:', error);
  }
}

/**
 * 书籍 / 章节切换判定：传入新值为 null，或与原值不同时，需要清除下级上下文。
 */
function shouldResetForChange(previous: string | null, incoming: string | null): boolean {
  return incoming === null || previous !== incoming;
}

/**
 * 计算悬停段落的目标值：提供了 paragraphText 且文本为空/仅符号时清空，否则原样写入。
 */
function resolveHoveredTarget(
  next: string | null,
  paragraphText: string | null | undefined,
): string | null {
  if (next && paragraphText !== undefined) {
    return isEmptyOrSymbolOnly(paragraphText) ? null : next;
  }
  return next;
}

export const useContextStore = defineStore('context', {
  state: (): ContextState & { isLoaded: boolean } => ({
    currentBookId: null,
    currentChapterId: null,
    hoveredParagraphId: null,
    selectedParagraphId: null,
    isLoaded: false,
  }),

  getters: {
    /**
     * 获取当前上下文信息
     */
    getContext: (state): ContextState => ({
      currentBookId: state.currentBookId,
      currentChapterId: state.currentChapterId,
      hoveredParagraphId: state.hoveredParagraphId,
      selectedParagraphId: state.selectedParagraphId,
    }),
  },

  actions: {
    /**
     * 从 localStorage 加载上下文状态
     */
    loadState(): void {
      if (this.isLoaded) {
        return;
      }

      const state = loadContextFromStorage();
      this.currentBookId = state.currentBookId;
      this.currentChapterId = state.currentChapterId;
      this.hoveredParagraphId = state.hoveredParagraphId;
      this.selectedParagraphId = state.selectedParagraphId;
      this.isLoaded = true;
    },

    /**
     * 设置当前书籍
     */
    setCurrentBook(bookId: string | null): void {
      const previousBookId = this.currentBookId;
      this.currentBookId = bookId;
      // 如果切换书籍，清除章节和段落上下文
      if (shouldResetForChange(previousBookId, bookId)) {
        this.currentChapterId = null;
        this.hoveredParagraphId = null;
        this.selectedParagraphId = null;
      }
      this.saveState();
    },

    /**
     * 设置当前章节
     */
    setCurrentChapter(chapterId: string | null): void {
      const previousChapterId = this.currentChapterId;
      this.currentChapterId = chapterId;
      // 如果切换章节，清除段落上下文
      if (shouldResetForChange(previousChapterId, chapterId)) {
        this.hoveredParagraphId = null;
        this.selectedParagraphId = null;
      }
      this.saveState();
    },

    /**
     * 设置悬停的段落
     * @param paragraphId 段落 ID
     * @param paragraphText 可选的段落文本，如果提供且为空或仅符号，则不设置段落 ID
     */
    setHoveredParagraph(paragraphId: string | null, paragraphText?: string | null): void {
      // 如果提供了段落文本且为空或仅符号，则不设置段落 ID
      if (paragraphId && paragraphText !== undefined) {
        if (isEmptyOrSymbolOnly(paragraphText)) {
          // 如果段落是空的或仅符号，清除悬停状态
          this.hoveredParagraphId = null;
          this.saveState();
          return;
        }
      }
      this.hoveredParagraphId = paragraphId;
      this.saveState();
    },

    /**
     * 设置完整的上下文
     * @param context 上下文对象
     * @param paragraphText 可选的段落文本，如果提供且为空或仅符号，则不设置段落 ID
     */
    setContext(context: Partial<ContextState>, paragraphText?: string | null): void {
      if (context.currentBookId !== undefined) {
        const previousBookId = this.currentBookId;
        this.currentBookId = context.currentBookId;
        // 如果切换书籍，清除章节和段落上下文
        if (shouldResetForChange(previousBookId, context.currentBookId)) {
          this.currentChapterId = null;
          this.hoveredParagraphId = null;
          this.selectedParagraphId = null;
        }
      }
      if (context.currentChapterId !== undefined) {
        const previousChapterId = this.currentChapterId;
        this.currentChapterId = context.currentChapterId;
        // 如果切换章节，清除段落上下文
        if (shouldResetForChange(previousChapterId, context.currentChapterId)) {
          this.hoveredParagraphId = null;
          this.selectedParagraphId = null;
        }
      }
      if (context.hoveredParagraphId !== undefined) {
        // 如果提供了段落文本且为空或仅符号，则不设置段落 ID
        this.hoveredParagraphId = resolveHoveredTarget(context.hoveredParagraphId, paragraphText);
      }
      if (context.selectedParagraphId !== undefined) {
        this.selectedParagraphId = context.selectedParagraphId;
      }
      this.saveState();
    },

    /**
     * 清除所有上下文
     */
    clearContext(): void {
      this.currentBookId = null;
      this.currentChapterId = null;
      this.hoveredParagraphId = null;
      this.selectedParagraphId = null;
      this.saveState();
    },

    /**
     * 设置选中的段落
     * @param paragraphId 段落 ID
     */
    setSelectedParagraph(paragraphId: string | null): void {
      this.selectedParagraphId = paragraphId;
      this.saveState();
    },

    /**
     * 保存状态到 localStorage
     */
    saveState(): void {
      saveContextToStorage({
        currentBookId: this.currentBookId,
        currentChapterId: this.currentChapterId,
        hoveredParagraphId: this.hoveredParagraphId,
        selectedParagraphId: this.selectedParagraphId,
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useContextStore, import.meta.hot));
}
