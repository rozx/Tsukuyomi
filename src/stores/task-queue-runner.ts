import { TranslationService, PolishService, ProofreadingService } from 'src/services/ai';
import { createAIProcessingStoreAdapter } from 'src/services/ai/tasks/utils/task-types';
import { saveLanguageParagraphResults } from 'src/services/ai/tasks/utils/save-language-results';
import { ChapterContentService } from 'src/services/chapter-content-service';
import {
  runChapterTask,
  type ChapterTaskExecutorDeps,
  type ChapterTaskRunResult,
} from 'src/services/chapter-task/chapter-task-executor';
import { buildActionInfoToastMessage } from 'src/composables/book-details/useActionInfoToast';
import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';
import type { TaskQueueItem } from 'src/models/task-queue';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useSettingsStore } from 'src/stores/settings';
import { useChapterTasksStore } from 'src/stores/chapter-tasks';
import type {
  ChapterPolishState,
  ChapterProofreadingState,
  ChapterTranslationState,
} from 'src/stores/chapter-tasks';

/** 运行一个队列项时由队列 store 提供的钩子 */
export interface TaskQueueRunContext {
  persistItem: ChapterTaskExecutorDeps['persistItem'];
  /** 段落落盘并刷新书籍缓存后调用，用于通知阅读页 */
  onChapterWrite?: (bookId: string, chapterId: string) => void;
  /** 按来源路由提示：手动来源弹出，批量来源只写消息历史 */
  notify?: (message: ToastMessageWithHistoryOptions) => void;
  onAppliedCount?: (count: number) => void;
}

export type TaskQueueRunner = (
  item: TaskQueueItem,
  signal: AbortSignal,
  ctx: TaskQueueRunContext,
) => Promise<ChapterTaskRunResult>;

type ChapterUiState = ChapterTranslationState | ChapterPolishState | ChapterProofreadingState;

const EMPTY_PROGRESS = { current: 0, total: 0, message: '' };

/**
 * 取得（或创建）阅读页读取的章节任务状态。
 * 阅读页按钮、段落高亮仍读 chapterTasksStore，因此执行器的进度写回这里。
 */
function chapterUiState(item: TaskQueueItem): {
  state: ChapterUiState;
  setActive: (active: boolean) => void;
  setInFlight: (ids: Set<string>) => void;
} {
  const store = useChapterTasksStore();
  if (item.kind === 'translation') {
    let state = store.translation.get(item.chapterId);
    if (!state) {
      state = {
        isTranslating: false,
        progress: { ...EMPTY_PROGRESS },
        abortController: null,
        translatingParagraphIds: new Set(),
      };
      store.translation.set(item.chapterId, state);
      state = store.translation.get(item.chapterId)!;
    }
    const current = state;
    return {
      state: current,
      setActive: (active) => {
        current.isTranslating = active;
      },
      setInFlight: (ids) => {
        current.translatingParagraphIds = ids;
      },
    };
  }
  if (item.kind === 'polish') {
    let state = store.polish.get(item.chapterId);
    if (!state) {
      state = {
        isPolishing: false,
        progress: { ...EMPTY_PROGRESS },
        abortController: null,
        polishingParagraphIds: new Set(),
      };
      store.polish.set(item.chapterId, state);
      state = store.polish.get(item.chapterId)!;
    }
    const current = state;
    return {
      state: current,
      setActive: (active) => {
        current.isPolishing = active;
      },
      setInFlight: (ids) => {
        current.polishingParagraphIds = ids;
      },
    };
  }
  let state = store.proofreading.get(item.chapterId);
  if (!state) {
    state = {
      isProofreading: false,
      progress: { ...EMPTY_PROGRESS },
      abortController: null,
      proofreadingParagraphIds: new Set(),
    };
    store.proofreading.set(item.chapterId, state);
    state = store.proofreading.get(item.chapterId)!;
  }
  const current = state;
  return {
    state: current,
    setActive: (active) => {
      current.isProofreading = active;
    },
    setInFlight: (ids) => {
      current.proofreadingParagraphIds = ids;
    },
  };
}

/** 默认执行函数：把执行器接到真实的书库、模型、AI 服务与阅读页状态上 */
export const runQueueItemWithStores: TaskQueueRunner = async (item, signal, ctx) => {
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();
  const aiProcessingStore = useAIProcessingStore();
  const settingsStore = useSettingsStore();
  const ui = chapterUiState(item);
  const uiLocale = settingsStore.uiLocale;

  ui.setActive(true);
  ui.setInFlight(new Set());
  ui.state.progress = { ...EMPTY_PROGRESS };

  const notify = ctx.notify ?? (() => {});
  const deps: ChapterTaskExecutorDeps = {
    services: {
      translate: TranslationService.translate.bind(TranslationService),
      polish: PolishService.polish.bind(PolishService),
      proofread: ProofreadingService.proofread.bind(ProofreadingService),
    },
    aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
    uiLocale,
    getBook: (bookId) => booksStore.getBookById(bookId),
    // 润色与校对沿用同一个任务模型（与原阅读页一致）
    getModel: (kind, book) =>
      aiModelsStore.getModelForTask(kind === 'translation' ? 'translation' : 'proofreading', book),
    loadChapterParagraphs: (chapterId) => ChapterContentService.loadChapterContent(chapterId),
    saveParagraphResults: async (saveCtx, results) => {
      await saveLanguageParagraphResults(
        saveCtx.bookId,
        saveCtx.chapterId,
        saveCtx.languages.targetLanguage,
        saveCtx.modelId,
        saveCtx.sourceParagraphs,
        results,
      );
      await booksStore.refreshBookFromStorage(saveCtx.bookId, saveCtx.chapterId);
      ctx.onChapterWrite?.(saveCtx.bookId, saveCtx.chapterId);
    },
    saveTitleTranslation: async (titleCtx) => {
      await booksStore.editTitle(titleCtx.bookId, titleCtx.languages.targetLanguage, {
        kind: 'chapter',
        id: titleCtx.chapterId,
        expectedOriginal: titleCtx.expectedOriginal,
        translation: titleCtx.translation,
        aiModelId: titleCtx.modelId,
      });
      ctx.onChapterWrite?.(titleCtx.bookId, titleCtx.chapterId);
    },
    persistItem: ctx.persistItem,
    onProgress: (progress) => {
      ui.state.progress = progress;
    },
    onInFlight: (ids) => ui.setInFlight(ids),
    onAction: (action) => {
      const book = booksStore.getBookById(item.bookId);
      const message = buildActionInfoToastMessage(
        action,
        { bookId: item.bookId, targetLanguage: book?.targetLanguage, uiLocale },
        // 整章翻译的动作提示带撤销（与原阅读页一致）
        item.kind === 'translation' && item.mode === 'retranslate'
          ? { severity: 'success', life: 4000, withRevert: true }
          : { severity: 'info' },
      );
      if (message) notify(message);
    },
    onToast: (message) => notify(message),
    ...(ctx.onAppliedCount ? { onAppliedCount: ctx.onAppliedCount } : {}),
  };

  try {
    return await runChapterTask(item, deps, signal);
  } finally {
    ui.setActive(false);
    // 稍后清除进度与段落高亮，让用户看到完成状态（与原阅读页一致）
    setTimeout(() => {
      if (
        (item.kind === 'translation' && (ui.state as ChapterTranslationState).isTranslating) ||
        (item.kind === 'polish' && (ui.state as ChapterPolishState).isPolishing) ||
        (item.kind === 'proofreading' && (ui.state as ChapterProofreadingState).isProofreading)
      ) {
        return;
      }
      ui.state.progress = { ...EMPTY_PROGRESS };
      ui.setInFlight(new Set());
    }, 1000);
  }
};
