import { defineStore, acceptHMRUpdate } from 'pinia';

const STORAGE_KEY = 'luna-ai-context';

/**
 * 检查段落是否为空或仅包含符号
 * 空段落：没有文本或只有空白字符
 * 仅符号段落：只包含标点符号、特殊字符，但没有实际内容（字母、数字、CJK字符等）
 * @param text 段落文本
 * @returns 如果段落为空或仅符号，返回 true
 */
function isEmptyOrSymbolOnly(text: string | null | undefined): boolean {
  if (!text || typeof text !== 'string') {
    return true;
  }

  // 去除首尾空白字符
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return true;
  }

  // 检查是否包含实际内容（字母、数字、CJK字符）
  // \p{L} 匹配任何语言的字母
  // \p{N} 匹配任何语言的数字
  // \u4e00-\u9fff 匹配汉字 (CJK Unified Ideographs)
  // \u3040-\u309f 匹配平假名 (Hiragana)
  // \u30a0-\u30ff 匹配片假名 (Katakana)
  const hasContent = /[\p{L}\p{N}\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]/u.test(trimmed);

  // 如果没有实际内容，则认为是仅符号段落
  return !hasContent;
}

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
      };
    }
  } catch (error) {
    console.error('Failed to load context from storage:', error);
  }
  return {
    currentBookId: null,
    currentChapterId: null,
    hoveredParagraphId: null,
  };
}

/**
 * 保存上下文状态到 localStorage
 */
function saveContextToStorage(state: ContextState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error('Failed to save context to storage:', error);
  }
}

export const useContextStore = defineStore('context', {
  state: (): ContextState & { isLoaded: boolean } => ({
    currentBookId: null,
    currentChapterId: null,
    hoveredParagraphId: null,
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
    }),

    /**
     * 检查是否有当前书籍
     */
    hasCurrentBook: (state): boolean => {
      return state.currentBookId !== null;
    },

    /**
     * 检查是否有当前章节
     */
    hasCurrentChapter: (state): boolean => {
      return state.currentChapterId !== null;
    },

    /**
     * 检查是否有悬停的段落
     */
    hasHoveredParagraph: (state): boolean => {
      return state.hoveredParagraphId !== null;
    },
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
      this.isLoaded = true;
    },

    /**
     * 设置当前书籍
     */
    setCurrentBook(bookId: string | null): void {
      const previousBookId = this.currentBookId;
      this.currentBookId = bookId;
      // 如果切换书籍，清除章节和段落上下文
      if (bookId === null || previousBookId !== bookId) {
        this.currentChapterId = null;
        this.hoveredParagraphId = null;
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
      if (chapterId === null || previousChapterId !== chapterId) {
        this.hoveredParagraphId = null;
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
      if (paragraphId && paragraphText !== undefined && paragraphText !== null) {
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
        if (context.currentBookId === null || previousBookId !== context.currentBookId) {
          this.currentChapterId = null;
          this.hoveredParagraphId = null;
        }
      }
      if (context.currentChapterId !== undefined) {
        const previousChapterId = this.currentChapterId;
        this.currentChapterId = context.currentChapterId;
        // 如果切换章节，清除段落上下文
        if (context.currentChapterId === null || previousChapterId !== context.currentChapterId) {
          this.hoveredParagraphId = null;
        }
      }
      if (context.hoveredParagraphId !== undefined) {
        // 如果提供了段落文本且为空或仅符号，则不设置段落 ID
        if (context.hoveredParagraphId && paragraphText !== undefined && paragraphText !== null) {
          if (isEmptyOrSymbolOnly(paragraphText)) {
            // 如果段落是空的或仅符号，清除悬停状态
            this.hoveredParagraphId = null;
          } else {
            this.hoveredParagraphId = context.hoveredParagraphId;
          }
        } else {
          this.hoveredParagraphId = context.hoveredParagraphId;
        }
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
      this.saveState();
    },

    /**
     * 清除段落悬停状态
     */
    clearHoveredParagraph(): void {
      this.hoveredParagraphId = null;
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
      });
    },
  },
});

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useContextStore, import.meta.hot));
}
