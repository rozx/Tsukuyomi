import { computed, watch, type Ref, type ComputedRef } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useChapterTasksStore } from 'src/stores/chapter-tasks';
import { useTaskQueueStore } from 'src/stores/task-queue';
import type { TaskQueueKind, TaskQueueTranslationMode } from 'src/models/task-queue';
import type {
  ChapterTranslationState,
  ChapterPolishState,
  ChapterProofreadingState,
} from 'src/stores/chapter-tasks';
import { TranslationService, PolishService, ProofreadingService } from 'src/services/ai';
import { createAIProcessingStoreAdapter } from 'src/services/ai/tasks/utils/task-types';
import { isEmptyParagraph, hasParagraphTranslation } from 'src/utils';
import type { Chapter, Novel, Paragraph, ScoreBreakdown } from 'src/models/novel';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { MenuItem } from 'primevue/menuitem';
import { BookExecutionGuard } from 'src/services/book-execution-guard';
import { useSettingsStore } from 'src/stores/settings';
import { translateText } from 'src/i18n/translate';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { saveLanguageParagraphResults } from 'src/services/ai/tasks/utils/save-language-results';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { localizedErrorMessage } from 'src/utils/localized-error';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';

/** 章节任务种类：决定反馈文案的资源 key */
type ChapterTaskKind = 'translation' | 'polish' | 'proofreading';
type ChapterTaskMessage =
  | 'Failed'
  | 'NotFound'
  | 'NoModel'
  | 'Done'
  | 'ParagraphDone'
  | 'BulkDetail'
  | 'Init'
  | 'Progress';

/** 用户可见的任务反馈；按执行开始时冻结的界面语言渲染 */
function taskText(
  locale: AppLocale,
  kind: ChapterTaskKind,
  message: ChapterTaskMessage,
  values?: Record<string, string | number>,
): string {
  return translateText(locale, `bookUi.chapterTask.${kind}${message}`, values);
}

export function useChapterTranslation(
  book: Ref<Novel | undefined>,
  selectedChapter: Ref<Chapter | null>,
  selectedChapterWithContent: Ref<Chapter | null>,
  selectedChapterParagraphs: ComputedRef<Paragraph[]>,
  updateSelectedChapterWithContent: (updatedVolumes: Novel['volumes']) => void,
  handleActionInfoToast: (
    action: ActionInfo,
    options?: {
      severity?: 'info' | 'success' | 'warn' | 'error';
      life?: number;
      withRevert?: boolean;
    },
  ) => void,
  _countUniqueActions: (actions: ActionInfo[]) => { terms: number; characters: number },
  _saveState: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();
  const aiProcessingStore = useAIProcessingStore();
  const settingsStore = useSettingsStore();
  const targetLanguage = computed(() => book.value?.targetLanguage ?? 'zh-CN');

  const persistExecutionResults = async (
    ctx: {
      bookId: string;
      chapterId: string;
      languages: ExecutionLanguages;
      modelId: string;
      sourceParagraphs: Paragraph[];
    },
    results: {
      id: string;
      translation: string;
      referencedMemories?: string[];
      memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
    }[],
  ) => {
    await saveLanguageParagraphResults(
      ctx.bookId,
      ctx.chapterId,
      ctx.languages.targetLanguage,
      ctx.modelId,
      ctx.sourceParagraphs,
      results,
    );
    const current = await booksStore.refreshBookFromStorage(ctx.bookId, ctx.chapterId);
    if (current?.volumes) updateSelectedChapterWithContent(current.volumes);
  };

  const guarded =
    <Args extends unknown[]>(
      labelKey: MessageKey,
      execute: (languages: ExecutionLanguages, ...args: Args) => Promise<void>,
    ) =>
    async (...args: Args): Promise<void> => {
      const bookId = book.value?.id;
      const chapterId = selectedChapter.value?.id;
      if (!bookId || !chapterId) return;
      const languages = captureExecutionLanguages(settingsStore.uiLocale, targetLanguage.value);
      const label = translateText(languages.uiLocale, labelKey);
      try {
        await BookExecutionGuard.write(
          bookId,
          { label: translateText('zh-CN', labelKey), labelKey, chapterId },
          async () => {
            if (book.value?.id !== bookId || selectedChapter.value?.id !== chapterId) return;
            await execute(languages, ...args);
          },
          async () => {
            const fresh = await booksStore.refreshBookFromStorage(bookId, chapterId);
            if (!fresh)
              throw new CodedLocalizedError('BOOK_CHANGED', 'bookUi.chapterTask.bookDeleted');
            if (book.value?.id !== bookId || selectedChapter.value?.id !== chapterId) return;
            const chapter = fresh.volumes
              ?.flatMap((volume) => volume.chapters ?? [])
              .find((entry) => entry.id === chapterId);
            if (!chapter)
              throw new CodedLocalizedError('BOOK_CHANGED', 'bookUi.chapterTask.chapterChanged');
            selectedChapterWithContent.value = chapter;
            updateSelectedChapterWithContent(fresh.volumes);
          },
        );
      } catch (error) {
        toast.add({
          severity: 'error',
          summary: translateText(languages.uiLocale, 'bookUi.chapterTask.notStarted', { label }),
          detail: localizedErrorMessage(
            error,
            languages.uiLocale,
            'bookUi.chapterTask.unknownError',
          ),
          life: 6000,
        });
      }
    };

  /** 取章节标题原文（兼容旧数据格式：title 为字符串或 { original }） */
  const resolveChapterTitleOriginal = (title: Chapter['title']): string => {
    return typeof title === 'string' ? title : title.original;
  };

  const updateTitleTranslation = async (
    translation: string,
    aiModelId: string,
    targetChapterId: string,
    targetBookId: string,
    languages: ExecutionLanguages,
    expectedOriginal: string,
  ): Promise<void> => {
    await booksStore.editTitle(targetBookId, languages.targetLanguage, {
      kind: 'chapter',
      id: targetChapterId,
      expectedOriginal,
      translation,
      aiModelId,
    });
    const latest = booksStore
      .getBookById(targetBookId)
      ?.volumes?.flatMap((volume) => volume.chapters ?? [])
      .find((chapter) => chapter.id === targetChapterId);
    if (latest && selectedChapterWithContent.value?.id === targetChapterId) {
      selectedChapterWithContent.value = {
        ...selectedChapterWithContent.value,
        title: latest.title,
        lastEdited: latest.lastEdited,
      };
    }
  };

  // 章节级别的翻译状态管理（按章节ID分别跟踪）：存放在 store 中，页面卸载后任务继续，状态不丢失
  const chapterTasksStore = useChapterTasksStore();

  // 获取当前选中章节的状态
  const currentChapterState = computed(() => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return null;

    const translationState = chapterTasksStore.translation.get(chapterId);
    const polishState = chapterTasksStore.polish.get(chapterId);
    const proofreadingState = chapterTasksStore.proofreading.get(chapterId);

    return {
      translation: translationState || {
        isTranslating: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        translatingParagraphIds: new Set(),
      },
      polish: polishState || {
        isPolishing: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        polishingParagraphIds: new Set(),
      },
      proofreading: proofreadingState || {
        isProofreading: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        proofreadingParagraphIds: new Set(),
      },
    };
  });

  // 向后兼容的状态变量（供外部组件使用）
  const isTranslatingChapter = computed(
    () => currentChapterState.value?.translation.isTranslating ?? false,
  );
  const translationProgress = computed(
    () => currentChapterState.value?.translation.progress ?? { current: 0, total: 0, message: '' },
  );
  const translatingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.translation.translatingParagraphIds ?? new Set<string>(),
  );

  const isPolishingChapter = computed(() => currentChapterState.value?.polish.isPolishing ?? false);
  const polishProgress = computed(
    () => currentChapterState.value?.polish.progress ?? { current: 0, total: 0, message: '' },
  );
  const polishingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.polish.polishingParagraphIds ?? new Set<string>(),
  );

  const isProofreadingChapter = computed(
    () => currentChapterState.value?.proofreading.isProofreading ?? false,
  );
  const proofreadingProgress = computed(
    () => currentChapterState.value?.proofreading.progress ?? { current: 0, total: 0, message: '' },
  );
  const proofreadingParagraphIds = computed<Set<string>>(
    () => currentChapterState.value?.proofreading.proofreadingParagraphIds ?? new Set<string>(),
  );

  // 辅助函数：获取或创建章节状态
  const getOrCreateTranslationState = (chapterId: string): ChapterTranslationState => {
    if (!chapterTasksStore.translation.has(chapterId)) {
      chapterTasksStore.translation.set(chapterId, {
        isTranslating: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        translatingParagraphIds: new Set(),
      });
    }
    return chapterTasksStore.translation.get(chapterId)!;
  };

  const getOrCreatePolishState = (chapterId: string): ChapterPolishState => {
    if (!chapterTasksStore.polish.has(chapterId)) {
      chapterTasksStore.polish.set(chapterId, {
        isPolishing: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        polishingParagraphIds: new Set(),
      });
    }
    return chapterTasksStore.polish.get(chapterId)!;
  };

  const getOrCreateProofreadingState = (chapterId: string): ChapterProofreadingState => {
    if (!chapterTasksStore.proofreading.has(chapterId)) {
      chapterTasksStore.proofreading.set(chapterId, {
        isProofreading: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        proofreadingParagraphIds: new Set(),
      });
    }
    return chapterTasksStore.proofreading.get(chapterId)!;
  };

  /**
   * 单段落任务的公共前置校验：检查 book/章节/段落/模型可用性。
   * - 任何一项不满足时返回 null 并推送对应 toast
   * - 命中时返回已解析好的上下文，调用方可直接使用
   */
  const resolveSingleParagraphContext = (
    paragraphId: string,
    kind: ChapterTaskKind,
    modelTaskKey: 'translation' | 'proofreading',
    options: { requireTranslation: boolean; languages: ExecutionLanguages },
  ): {
    paragraph: Paragraph;
    bookId: string;
    chapterId: string;
    selectedModel: AIModel;
    languages: ExecutionLanguages;
    chapterOriginal: string;
  } | null => {
    if (
      !book.value ||
      !selectedChapterWithContent.value ||
      !selectedChapterWithContent.value.content
    ) {
      return null;
    }

    const chapterId = selectedChapterWithContent.value.id;
    const bookId = book.value.id;

    const locale = options.languages.uiLocale;
    const paragraph = selectedChapterWithContent.value.content.find((p) => p.id === paragraphId);
    if (!paragraph) {
      toast.add({
        severity: 'error',
        summary: taskText(locale, kind, 'Failed'),
        detail: taskText(locale, kind, 'NotFound'),
        life: 3000,
      });
      return null;
    }

    if (
      options.requireTranslation &&
      !hasParagraphTranslation(paragraph, options.languages.targetLanguage)
    ) {
      toast.add({
        severity: 'error',
        summary: taskText(locale, kind, 'Failed'),
        detail: translateText(locale, 'bookUi.chapterTask.needsTranslation'),
        life: 3000,
      });
      return null;
    }

    const selectedModel = aiModelsStore.getModelForTask(modelTaskKey, book.value);
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: taskText(locale, kind, 'Failed'),
        detail: taskText(locale, kind, 'NoModel'),
        life: 3000,
      });
      return null;
    }

    return {
      paragraph,
      bookId,
      chapterId,
      selectedModel,
      chapterOriginal: resolveChapterTitleOriginal(selectedChapterWithContent.value.title),
      languages: options.languages,
    };
  };

  /**
   * 生成单段落润色/校对服务共用的 options 字典。两个服务接收完全相同的字段，
   * 这里集中构造，避免每个调用点重复 9 行样板。
   */
  const buildSingleParagraphServiceOptions = (
    ctx: {
      bookId: string;
      chapterId: string;
      selectedModel: { id: string };
      languages: ExecutionLanguages;
    },
    signal: AbortSignal,
  ) => {
    const sourceParagraphs = selectedChapterParagraphs.value.map((paragraph) => ({
      ...paragraph,
      text: paragraph.text,
    }));
    return {
      languages: ctx.languages,
      bookId: ctx.bookId,
      chapterId: ctx.chapterId,
      allChapterParagraphs: selectedChapterParagraphs.value,
      signal,
      aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
      onToast: (message: Parameters<typeof toast.add>[0]) => {
        toast.add(message);
      },
      onParagraphResult: (paragraphResults: { id: string; translation: string }[]) =>
        persistExecutionResults(
          {
            bookId: ctx.bookId,
            chapterId: ctx.chapterId,
            languages: ctx.languages,
            modelId: ctx.selectedModel.id,
            sourceParagraphs,
          },
          paragraphResults,
        ),
      onAction: (action: ActionInfo) => {
        handleActionInfoToast(action, { severity: 'info' });
      },
    };
  };

  // 润色单个段落
  const runPolishParagraph = async (
    executionLanguages: ExecutionLanguages,
    paragraphId: string,
  ) => {
    const ctx = resolveSingleParagraphContext(paragraphId, 'polish', 'proofreading', {
      requireTranslation: true,
      languages: executionLanguages,
    });
    if (!ctx) return;
    const {
      paragraph,
      bookId: targetBookId,
      chapterId: targetChapterId,
      selectedModel,
      languages,
    } = ctx;

    // 获取该章节的状态
    const state = getOrCreatePolishState(targetChapterId);

    // 添加段落 ID 到正在润色的集合中
    state.polishingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消润色
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 调用单段落润色服务（简化模式，无状态机）
      await PolishService.polishSingle(
        paragraph,
        selectedModel,
        buildSingleParagraphServiceOptions(
          { bookId: targetBookId, chapterId: targetChapterId, selectedModel, languages },
          abortController.signal,
        ),
      );

      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'polish', 'Done'),
        detail: taskText(executionLanguages.uiLocale, 'polish', 'ParagraphDone'),
        life: 3000,
      });
    } catch (error) {
      console.error('润色段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在润色的集合中移除段落 ID
      state.polishingParagraphIds.delete(paragraphId);
      state.abortController = null;
    }
  };
  const polishParagraph = guarded('translationUi.polishParagraph', runPolishParagraph);

  // 校对单个段落
  const runProofreadParagraph = async (
    executionLanguages: ExecutionLanguages,
    paragraphId: string,
  ) => {
    const ctx = resolveSingleParagraphContext(paragraphId, 'proofreading', 'proofreading', {
      requireTranslation: true,
      languages: executionLanguages,
    });
    if (!ctx) return;
    const {
      paragraph,
      bookId: targetBookId,
      chapterId: targetChapterId,
      selectedModel,
      languages,
    } = ctx;

    // 获取该章节的状态
    const state = getOrCreateProofreadingState(targetChapterId);

    // 添加段落 ID 到正在校对的集合中
    state.proofreadingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消校对
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 调用单段落校对服务（简化模式，无状态机）
      await ProofreadingService.proofreadSingle(
        paragraph,
        selectedModel,
        buildSingleParagraphServiceOptions(
          { bookId: targetBookId, chapterId: targetChapterId, selectedModel, languages },
          abortController.signal,
        ),
      );

      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'proofreading', 'Done'),
        detail: taskText(executionLanguages.uiLocale, 'proofreading', 'ParagraphDone'),
        life: 3000,
      });
    } catch (error) {
      console.error('校对段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在校对的集合中移除段落 ID
      state.proofreadingParagraphIds.delete(paragraphId);
      state.abortController = null;
    }
  };
  const proofreadParagraph = guarded('translationUi.proofreadParagraph', runProofreadParagraph);

  // 重新翻译单个段落
  const runRetranslateParagraph = async (
    executionLanguages: ExecutionLanguages,
    paragraphId: string,
  ) => {
    const ctx = resolveSingleParagraphContext(paragraphId, 'translation', 'translation', {
      requireTranslation: false,
      languages: executionLanguages,
    });
    if (!ctx) return;
    const {
      paragraph,
      bookId: targetBookId,
      chapterId: targetChapterId,
      selectedModel,
      languages,
      chapterOriginal,
    } = ctx;

    const sourceParagraphs = selectedChapterParagraphs.value.map((value) => ({ ...value }));
    // 获取该章节的状态
    const state = getOrCreateTranslationState(targetChapterId);

    // 添加段落 ID 到正在翻译的集合中
    state.translatingParagraphIds.add(paragraphId);

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;
      // 调用翻译服务
      await TranslationService.translate([paragraph], selectedModel, {
        languages,
        bookId: targetBookId,
        chapterId: targetChapterId,
        ...(chunkSize !== undefined ? { chunkSize } : {}),
        allChapterParagraphs: selectedChapterParagraphs.value,
        signal: abortController.signal,
        aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
        onToast: (message) => {
          toast.add(message);
        },
        onTitleTranslation: (translation) => {
          // 立即更新标题翻译（不等待整个翻译完成）
          return updateTitleTranslation(
            translation,
            selectedModel.id,
            targetChapterId,
            targetBookId,
            languages,
            chapterOriginal,
          );
        },
        onParagraphTranslation: (paragraphTranslations) => {
          // 使用共享函数更新段落翻译
          return persistExecutionResults(
            {
              bookId: targetBookId,
              chapterId: targetChapterId,
              languages,
              modelId: selectedModel.id,
              sourceParagraphs,
            },
            paragraphTranslations,
          ).then(() => {
            // 从正在翻译的集合中移除已完成的段落 ID
            paragraphTranslations.forEach((pt) => {
              state.translatingParagraphIds.delete(pt.id);
            });
          });
        },
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info', withRevert: true });
        },
      });

      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'translation', 'Done'),
        detail: taskText(executionLanguages.uiLocale, 'translation', 'ParagraphDone'),
        life: 3000,
      });
    } catch (error) {
      console.error('重新翻译段落时出错:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      // 从正在翻译的集合中移除段落 ID
      state.translatingParagraphIds.delete(paragraphId);
      state.abortController = null;
    }
  };
  const retranslateParagraph = guarded(
    'bookUi.chapterTask.translateParagraphLabel',
    runRetranslateParagraph,
  );

  // ---------- 整章任务：经任务队列执行（不依赖当前页面） ----------
  const taskQueue = useTaskQueueStore();

  /** 当前章节某类整章任务在队列中的状态 */
  const queueEntryFor = (kind: TaskQueueKind) =>
    computed(() => {
      const chapterId = selectedChapter.value?.id;
      if (!chapterId) return null;
      const item = taskQueue.findPending(chapterId, kind);
      if (!item) return null;
      return { item, position: taskQueue.queuePosition(item.id) };
    });
  const translationQueueEntry = queueEntryFor('translation');
  const polishQueueEntry = queueEntryFor('polish');
  const proofreadingQueueEntry = queueEntryFor('proofreading');

  /** 当前章节排队中（尚未运行）的整章任务位置；没有排队项时为 null */
  const chapterQueuePosition = computed(() => {
    for (const entry of [translationQueueEntry, polishQueueEntry, proofreadingQueueEntry]) {
      if (entry.value?.item.status === 'queued') return entry.value.position;
    }
    return null;
  });

  /**
   * 手动启动整章任务：排到队首，有空位立即运行，否则排第一位等待（不超过并发上限）。
   * 返回新队列项 ID；该章节同类任务已在队列中时提示并返回 undefined。
   */
  const enqueueChapterTask = async (
    kind: TaskQueueKind,
    mode?: TaskQueueTranslationMode,
  ): Promise<string | undefined> => {
    const bookId = book.value?.id;
    const chapter = selectedChapter.value;
    if (!bookId || !chapter) return undefined;
    const result = await taskQueue.enqueue(
      [{ bookId, chapterId: chapter.id, kind, mode, origin: 'manual' }],
      { position: 'front' },
    );
    if (result.added.length === 0 && result.skippedDuplicate > 0) {
      const locale = settingsStore.uiLocale;
      toast.add({
        severity: 'info',
        summary: translateText(locale, 'taskQueueUi.alreadyQueued'),
        detail: translateText(locale, 'taskQueueUi.alreadyQueuedDetail', {
          chapter: resolveChapterTitleOriginal(chapter.title),
          kind: translateText(locale, `taskQueueUi.kind.${kind}`),
        }),
        life: 3000,
      });
    }
    return result.added[0];
  };

  const translateAllParagraphs = () => enqueueChapterTask('translation', 'retranslate');
  const retranslateAllParagraphs = translateAllParagraphs;
  const continueTranslation = () => enqueueChapterTask('translation', 'continue');
  const polishAllParagraphs = () => enqueueChapterTask('polish');
  const proofreadAllParagraphs = () => enqueueChapterTask('proofreading');

  /** 取消某章节的整章任务：运行中则停止（已落盘的段落保留），排队中则移出 */
  const cancelChapterTask = async (kind: TaskQueueKind, targetChapterId?: string) => {
    const chapterId = targetChapterId || selectedChapter.value?.id;
    if (!chapterId) return;
    const item = taskQueue.findPending(chapterId, kind);
    if (!item) return;
    if (item.status === 'running') await taskQueue.stopItem(item.id);
    else await taskQueue.removeItem(item.id);
  };
  const cancelTranslation = (targetChapterId?: string) =>
    cancelChapterTask('translation', targetChapterId);
  const cancelPolish = (targetChapterId?: string) => cancelChapterTask('polish', targetChapterId);
  const cancelProofreading = (targetChapterId?: string) =>
    cancelChapterTask('proofreading', targetChapterId);

  // 队列任务每批落盘后（含其他标签页执行的）刷新当前打开的章节
  watch(
    () => taskQueue.lastChapterWrite,
    (event) => {
      if (!event || event.chapterId !== selectedChapter.value?.id) return;
      const current = booksStore.getBookById(event.bookId);
      if (current?.volumes) updateSelectedChapterWithContent(current.volumes);
    },
  );

  // 注意：组件卸载时不取消任务——任务在后台继续，状态保存在 chapterTasksStore 中，
  // 回到页面后仍可查看进度或取消。

  // 翻译状态计算属性
  const translationStatus = computed(() => {
    const paragraphs = selectedChapterParagraphs.value;
    if (paragraphs.length === 0) {
      return { hasNone: true, hasPartial: false, hasAll: false };
    }

    // 过滤掉空段落，只统计有内容的段落
    const nonEmptyParagraphs = paragraphs.filter((p) => !isEmptyParagraph(p.text));

    if (nonEmptyParagraphs.length === 0) {
      // 如果所有段落都是空的，视为无翻译状态
      return { hasNone: true, hasPartial: false, hasAll: false };
    }

    const translatedCount = nonEmptyParagraphs.filter((paragraph) =>
      hasParagraphTranslation(paragraph, targetLanguage.value),
    ).length;
    const totalCount = nonEmptyParagraphs.length;

    if (translatedCount === 0) {
      return { hasNone: true, hasPartial: false, hasAll: false };
    } else if (translatedCount === totalCount) {
      return { hasNone: false, hasPartial: false, hasAll: true };
    } else {
      return { hasNone: false, hasPartial: true, hasAll: false };
    }
  });

  // SplitButton 的标签和菜单项
  const translationButtonLabel = computed(() => {
    // 手动启动的整章任务遇到并发上限时排在队首等待，按钮显示排队位置
    if (chapterQueuePosition.value !== null) {
      return translateText(settingsStore.uiLocale, 'taskQueueUi.queuedAt', {
        position: chapterQueuePosition.value,
      });
    }
    if (translationStatus.value.hasNone) {
      return translateText(settingsStore.uiLocale, 'readerUi.translateChapter');
    } else if (translationStatus.value.hasPartial) {
      return translateText(settingsStore.uiLocale, 'readerUi.continueTranslation');
    } else {
      return translateText(settingsStore.uiLocale, 'readerUi.polishChapter');
    }
  });

  const translationButtonMenuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [];

    // 总是显示"重新翻译"
    items.push({
      label: translateText(settingsStore.uiLocale, 'readerUi.retranslate'),
      icon: 'pi pi-refresh',
      command: () => {
        void translateAllParagraphs();
      },
    });

    // 如果所有段落都已翻译，显示"校对本章"
    if (translationStatus.value.hasAll) {
      items.push({
        label: translateText(settingsStore.uiLocale, 'readerUi.proofreadChapter'),
        icon: 'pi pi-check-circle',
        command: () => {
          void proofreadAllParagraphs();
        },
      });
    }

    return items;
  });

  const translationButtonClick = () => {
    if (translationStatus.value.hasNone) {
      void translateAllParagraphs();
    } else if (translationStatus.value.hasPartial) {
      void continueTranslation();
    } else {
      void polishAllParagraphs();
    }
  };

  return {
    // 状态
    isTranslatingChapter,
    translationProgress,
    translatingParagraphIds,
    isPolishingChapter,
    polishProgress,
    polishingParagraphIds,
    isProofreadingChapter,
    proofreadingProgress,
    proofreadingParagraphIds,
    chapterQueuePosition,
    // 函数
    polishParagraph,
    proofreadParagraph,
    retranslateParagraph,
    translateAllParagraphs,
    continueTranslation,
    retranslateAllParagraphs,
    polishAllParagraphs,
    proofreadAllParagraphs,
    cancelTranslation,
    cancelPolish,
    cancelProofreading,
    // 计算属性
    translationStatus,
    translationButtonLabel,
    translationButtonMenuItems,
    translationButtonClick,
  };
}
