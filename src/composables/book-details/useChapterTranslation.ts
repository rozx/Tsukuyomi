import { ref, computed, watch, onUnmounted, type Ref, type ComputedRef } from 'vue';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useUiStore } from 'src/stores/ui';
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
  countUniqueActions: (actions: ActionInfo[]) => { terms: number; characters: number },
  _saveState: (description?: string) => void,
) {
  const toast = useToastWithHistory();
  const booksStore = useBooksStore();
  const aiModelsStore = useAIModelsStore();
  const aiProcessingStore = useAIProcessingStore();
  const uiStore = useUiStore();
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

  // 将进度同步到 aiProcessingStore 对应任务，使 AppRightPanel 的翻译进度 Tab 可读取
  const syncProgressToStore = (
    type: 'translation' | 'polish' | 'proofreading',
    chapterId: string,
    progress: { current: number; total: number; message: string },
  ) => {
    const task = aiProcessingStore.activeTasks.find(
      (t) =>
        t.type === type &&
        t.chapterId === chapterId &&
        (t.status === 'thinking' || t.status === 'processing'),
    );
    if (task) {
      void aiProcessingStore.updateTask(task.id, { progress });
    }
  };

  /**
   * 批量任务共享的增量更新回调：
   * 按执行语言将 AI 返回的段落译文立即合并到最新正文，
   * 然后把属于目标集合的段落 ID 计入 completedParagraphIds，最后执行任务特定的收尾（afterUpdate）。
   * translate 的收尾是刷新进度条；polish/proofread 的收尾是把段落从 inFlight 集合里移除。
   */
  const applyIncrementalAndTrackCompletion = (
    translations: {
      id: string;
      translation: string;
      referencedMemories?: string[];
      memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
    }[],
    ctx: {
      aiModelId: string;
      languages: ExecutionLanguages;
      sourceParagraphs: Paragraph[];
      targetChapterId: string;
      targetBookId: string;
      lastAppliedTranslations: Map<string, string>;
      targetParagraphIds: Set<string>;
      completedParagraphIds: Set<string>;
    },
    afterUpdate?: (translations: { id: string; translation: string }[]) => void,
  ): Promise<void> => {
    const changed = translations.filter(
      (value) => ctx.lastAppliedTranslations.get(value.id) !== value.translation,
    );
    if (!changed.length) return Promise.resolve();
    return saveLanguageParagraphResults(
      ctx.targetBookId,
      ctx.targetChapterId,
      ctx.languages.targetLanguage,
      ctx.aiModelId,
      ctx.sourceParagraphs,
      changed,
    ).then(async () => {
      const current = await booksStore.refreshBookFromStorage(
        ctx.targetBookId,
        ctx.targetChapterId,
      );
      if (current?.volumes) updateSelectedChapterWithContent(current.volumes);
      for (const value of changed) ctx.lastAppliedTranslations.set(value.id, value.translation);
      for (const pt of translations) {
        if (ctx.targetParagraphIds.has(pt.id)) {
          ctx.completedParagraphIds.add(pt.id);
        }
      }
      afterUpdate?.(translations);
    });
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

  // 章节级别的翻译状态管理（按章节ID分别跟踪）
  type ChapterTranslationState = {
    isTranslating: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    translatingParagraphIds: Set<string>;
  };

  type ChapterPolishState = {
    isPolishing: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    polishingParagraphIds: Set<string>;
  };

  type ChapterProofreadingState = {
    isProofreading: boolean;
    progress: { current: number; total: number; message: string };
    abortController: AbortController | null;
    proofreadingParagraphIds: Set<string>;
  };

  // 使用 Map 存储每个章节的状态，key 为章节ID
  const chapterTranslationStates = ref<Map<string, ChapterTranslationState>>(new Map());
  const chapterPolishStates = ref<Map<string, ChapterPolishState>>(new Map());
  const chapterProofreadingStates = ref<Map<string, ChapterProofreadingState>>(new Map());

  // 获取当前选中章节的状态
  const currentChapterState = computed(() => {
    const chapterId = selectedChapter.value?.id;
    if (!chapterId) return null;

    const translationState = chapterTranslationStates.value.get(chapterId);
    const polishState = chapterPolishStates.value.get(chapterId);
    const proofreadingState = chapterProofreadingStates.value.get(chapterId);

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
    if (!chapterTranslationStates.value.has(chapterId)) {
      chapterTranslationStates.value.set(chapterId, {
        isTranslating: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        translatingParagraphIds: new Set(),
      });
    }
    return chapterTranslationStates.value.get(chapterId)!;
  };

  const getOrCreatePolishState = (chapterId: string): ChapterPolishState => {
    if (!chapterPolishStates.value.has(chapterId)) {
      chapterPolishStates.value.set(chapterId, {
        isPolishing: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        polishingParagraphIds: new Set(),
      });
    }
    return chapterPolishStates.value.get(chapterId)!;
  };

  const getOrCreateProofreadingState = (chapterId: string): ChapterProofreadingState => {
    if (!chapterProofreadingStates.value.has(chapterId)) {
      chapterProofreadingStates.value.set(chapterId, {
        isProofreading: false,
        progress: { current: 0, total: 0, message: '' },
        abortController: null,
        proofreadingParagraphIds: new Set(),
      });
    }
    return chapterProofreadingStates.value.get(chapterId)!;
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
   * 整章翻译流程的公共前置步骤：校验翻译模型可用性、初始化翻译状态，并切换右侧面板到进度 Tab。
   * - 模型不可用时推送 toast 并返回 null（调用方据此提前退出，不抛异常）
   * - 成功时返回解析好的上下文供调用方继续使用
   */
  const prepareTranslationRun = (
    currentChapter: Chapter,
    currentBook: Novel,
    languages: ExecutionLanguages,
  ): {
    selectedModel: AIModel;
    languages: ExecutionLanguages;
    sourceParagraphs: Paragraph[];
    chapterOriginal: string;
    targetChapterId: string;
    targetBookId: string;
    state: ChapterTranslationState;
  } | null => {
    const selectedModel = aiModelsStore.getModelForTask('translation', currentBook);
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: taskText(languages.uiLocale, 'translation', 'Failed'),
        detail: taskText(languages.uiLocale, 'translation', 'NoModel'),
        life: 3000,
      });
      return null;
    }

    const targetChapterId = currentChapter.id;
    const targetBookId = currentBook.id;
    const state = getOrCreateTranslationState(targetChapterId);

    state.isTranslating = true;
    state.translatingParagraphIds.clear();
    uiStore.setActiveRightTab('progress');

    return {
      selectedModel,
      targetChapterId,
      targetBookId,
      state,
      languages,
      chapterOriginal: resolveChapterTitleOriginal(currentChapter.title),
      sourceParagraphs: selectedChapterParagraphs.value.map((paragraph) => ({ ...paragraph })),
    };
  };

  /**
   * 整章翻译两个入口（translateAllParagraphs / continueTranslation）共用的
   * TranslationService.translate options 构造器。集中处理条件字段 (chapterTitle /
   * customInstructions / chunkSize) 的可选展开，以及 aiProcessingStore 适配。
   * 调用方需传入各自的段落/标题/进度回调，以保留各自的增量更新策略。
   */
  type TranslationServiceOptionsArg = NonNullable<
    Parameters<typeof TranslationService.translate>[2]
  >;
  const buildTranslationServiceOptions = (params: {
    languages: ExecutionLanguages;
    bookId: string;
    chapterId: string;
    chapterTitle: string | undefined;
    customInstructions: string | undefined;
    chunkSize: number | undefined;
    signal: AbortSignal;
    state: ChapterTranslationState;
    onParagraphTranslation: NonNullable<TranslationServiceOptionsArg['onParagraphTranslation']>;
    onTitleTranslation: NonNullable<TranslationServiceOptionsArg['onTitleTranslation']>;
    onAction: NonNullable<TranslationServiceOptionsArg['onAction']>;
    onToast: NonNullable<TranslationServiceOptionsArg['onToast']>;
  }): TranslationServiceOptionsArg => ({
    languages: params.languages,
    bookId: params.bookId,
    chapterId: params.chapterId,
    ...(params.chapterTitle ? { chapterTitle: params.chapterTitle } : {}),
    ...(params.customInstructions !== undefined
      ? { customInstructions: params.customInstructions }
      : {}),
    ...(params.chunkSize !== undefined ? { chunkSize: params.chunkSize } : {}),
    allChapterParagraphs: selectedChapterParagraphs.value,
    signal: params.signal,
    aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
    onProgress: createBulkProgressHandler({
      taskType: 'translation',
      locale: params.languages.uiLocale,
      state: params.state,
      targetChapterId: params.chapterId,
      setInFlight: (ids) => {
        params.state.translatingParagraphIds = ids;
      },
      resolveProgress: (_, s) => ({
        current: s.progress.current,
        total: s.progress.total,
      }),
    }),
    onParagraphTranslation: params.onParagraphTranslation,
    onTitleTranslation: params.onTitleTranslation,
    onAction: params.onAction,
    onToast: params.onToast,
  });

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

  /**
   * 构建批量任务（翻译/润色/校对全章）完成后的 toast 详情文案。
   * 包含"成功处理 N 个段落"主句；如果 AI 执行了术语/角色 CRUD 工具，则附加
   * "并执行了 X 个术语操作、Y 个角色操作" 后缀。
   */
  const buildBulkTaskCompletionDetail = (
    kind: ChapterTaskKind,
    count: number,
    actions: ActionInfo[] | undefined,
    locale: AppLocale,
  ): string => {
    const detail = taskText(locale, kind, 'BulkDetail', { count });
    const actionList = actions || [];
    if (actionList.length === 0) return detail;
    const { terms, characters } = countUniqueActions(actionList);
    const parts: string[] = [];
    if (terms > 0)
      parts.push(translateText(locale, 'bookUi.chapterTask.termActions', { count: terms }));
    if (characters > 0)
      parts.push(
        translateText(locale, 'bookUi.chapterTask.characterActions', { count: characters }),
      );
    if (parts.length === 0) return detail;
    return translateText(locale, 'bookUi.chapterTask.actionsSuffix', {
      detail,
      parts: parts.join(translateText(locale, 'bookUi.chapterTask.actionsJoin')),
    });
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

  // 翻译章节所有段落
  const runTranslateAllParagraphs = async (
    executionLanguages: ExecutionLanguages,
    customInstructions?: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 复用翻译前置准备：模型校验 + 状态初始化 + 切换进度 Tab
    const prep = prepareTranslationRun(selectedChapter.value, book.value, executionLanguages);
    if (!prep) return;
    const {
      selectedModel,
      targetChapterId,
      targetBookId,
      state,
      languages,
      sourceParagraphs,
      chapterOriginal,
    } = prep;

    const paragraphs = selectedChapterParagraphs.value;
    const nonEmptyParagraphs = paragraphs.filter((para) => !isEmptyParagraph(para.text));
    const targetParagraphIds = new Set(nonEmptyParagraphs.map((para) => para.id));

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: taskText(executionLanguages.uiLocale, 'translation', 'Init'),
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    // 标记本次翻译是否失败/中断（用于 finally 中决定是否提示“已保存部分结果”）
    let translationFailed = false;

    try {
      const paragraphs = nonEmptyParagraphs;

      // 获取章节标题
      const chapterTitle =
        typeof selectedChapter.value?.title === 'string'
          ? selectedChapter.value.title
          : selectedChapter.value?.title?.original;
      // 获取书籍的 chunk size 设置
      const chunkSize = book.value?.translationChunkSize;

      // 调用翻译服务
      const result = await TranslationService.translate(
        paragraphs,
        selectedModel,
        buildTranslationServiceOptions({
          languages,
          bookId: book.value.id,
          chapterId: targetChapterId,
          chapterTitle,
          customInstructions: customInstructions?.translationInstructions,
          chunkSize,
          signal: abortController.signal,
          state,
          onAction: (action) => {
            handleActionInfoToast(action, { severity: 'success', life: 4000, withRevert: true });
          },
          onToast: (message) => {
            // 工具可以直接显示 toast
            toast.add(message);
          },
          onParagraphTranslation: async (translations) => {
            await persistExecutionResults(
              {
                bookId: targetBookId,
                chapterId: targetChapterId,
                languages,
                modelId: selectedModel.id,
                sourceParagraphs,
              },
              translations,
            );

            // 记录已应用的翻译
            for (const pt of translations) {
              lastAppliedTranslations.set(pt.id, pt.translation);
              if (targetParagraphIds.has(pt.id)) {
                completedParagraphIds.add(pt.id);
              }
            }

            const updatedProgress = {
              current: completedParagraphIds.size,
              total: targetParagraphIds.size,
              message: state.progress.message,
            };
            state.progress = updatedProgress;
            syncProgressToStore('translation', targetChapterId, updatedProgress);

            // 从正在翻译的集合中移除已完成的段落 ID
            translations.forEach((pt) => {
              state.translatingParagraphIds.delete(pt.id);
            });
          },
          onTitleTranslation: async (translation) => {
            // 立即更新标题翻译（不等待整个翻译完成）
            await updateTitleTranslation(
              translation,
              selectedModel.id,
              targetChapterId,
              targetBookId,
              languages,
              chapterOriginal,
            );
          },
        }),
      );

      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'translation', 'Done'),
        detail: buildBulkTaskCompletionDetail(
          'translation',
          lastAppliedTranslations.size,
          result.actions,
          executionLanguages.uiLocale,
        ),
        life: 3000,
      });
    } catch (error) {
      console.error('翻译失败:', error);
      translationFailed = true;
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      if (translationFailed && lastAppliedTranslations.size > 0) {
        toast.add({
          severity: abortController.signal.aborted ? 'info' : 'warn',
          summary: translateText(
            executionLanguages.uiLocale,
            abortController.signal.aborted
              ? 'bookUi.chapterTask.cancelledPartial'
              : 'bookUi.chapterTask.interruptedPartial',
          ),
          detail: translateText(
            executionLanguages.uiLocale,
            'bookUi.chapterTask.savedPartialDetail',
            {
              count: lastAppliedTranslations.size,
            },
          ),
          life: 5000,
        });
      }

      state.isTranslating = false;
      state.abortController = null;
      // 延迟清除进度信息和正在翻译的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.translatingParagraphIds.clear();
      }, 1000);
    }
  };
  const translateAllParagraphs = guarded(
    'bookUi.chapterTask.translateChapterLabel',
    runTranslateAllParagraphs,
  );

  // 继续翻译（只翻译未翻译的段落）
  const isUntranslatedParagraph = (para: Paragraph, languages: ExecutionLanguages): boolean => {
    return !isEmptyParagraph(para.text) && !hasParagraphTranslation(para, languages.targetLanguage);
  };

  /** 取当前选中章节的标题原文（兼容字符串 / 对象两种 title 形态） */
  const resolveSelectedChapterTitle = (): string | undefined => {
    const title = selectedChapter.value?.title;
    return typeof title === 'string' ? title : title?.original;
  };

  /** 从自定义指令对象中安全取出 translationInstructions（可能整体为 undefined） */
  const getTranslationInstructions = (customInstructions?: {
    translationInstructions?: string;
  }): string | undefined => {
    return customInstructions?.translationInstructions;
  };

  const runContinueTranslation = async (
    executionLanguages: ExecutionLanguages,
    customInstructions?: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ) => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return;
    }

    // 过滤出未翻译的段落（排除空段落）
    const untranslatedParagraphs = selectedChapterParagraphs.value.filter((paragraph) =>
      isUntranslatedParagraph(paragraph, executionLanguages),
    );

    if (untranslatedParagraphs.length === 0) {
      toast.add({
        severity: 'info',
        summary: translateText(
          executionLanguages.uiLocale,
          'bookUi.chapterTask.nothingToTranslate',
        ),
        detail: translateText(executionLanguages.uiLocale, 'bookUi.chapterTask.allTranslated'),
        life: 3000,
      });
      return;
    }

    // 复用翻译前置准备：模型校验 + 状态初始化 + 切换进度 Tab
    const prep = prepareTranslationRun(selectedChapter.value, book.value, executionLanguages);
    if (!prep) return;
    const {
      selectedModel,
      targetChapterId,
      targetBookId,
      state,
      languages,
      sourceParagraphs,
      chapterOriginal,
    } = prep;

    const targetParagraphIds = new Set(untranslatedParagraphs.map((para) => para.id));

    // 用于跟踪已更新的段落，避免重复更新
    const lastAppliedTranslations = new Map<string, string>();
    const completedParagraphIds = new Set<string>();

    // 初始化进度
    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: taskText(executionLanguages.uiLocale, 'translation', 'Init'),
    };

    // 创建 AbortController 用于取消翻译
    const abortController = new AbortController();
    state.abortController = abortController;

    try {
      // 获取章节标题与 chunk size
      const chapterTitle = resolveSelectedChapterTitle();
      const chunkSize = book.value.translationChunkSize;
      const translationInstructions = getTranslationInstructions(customInstructions);

      // 调用翻译服务，只翻译未翻译的段落
      await TranslationService.translate(
        untranslatedParagraphs,
        selectedModel,
        buildTranslationServiceOptions({
          languages,
          bookId: book.value.id,
          chapterId: targetChapterId,
          chapterTitle,
          customInstructions: translationInstructions,
          chunkSize,
          signal: abortController.signal,
          state,
          onParagraphTranslation: (translations) => {
            return applyIncrementalAndTrackCompletion(
              translations,
              {
                aiModelId: selectedModel.id,
                languages,
                sourceParagraphs,
                targetChapterId,
                targetBookId,
                lastAppliedTranslations,
                targetParagraphIds,
                completedParagraphIds,
              },
              () => {
                const updatedProgress = {
                  current: completedParagraphIds.size,
                  total: targetParagraphIds.size,
                  message: state.progress.message,
                };
                state.progress = updatedProgress;
                syncProgressToStore('translation', targetChapterId, updatedProgress);
              },
            );
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
          onAction: (action) => {
            handleActionInfoToast(action, { severity: 'info' });
          },
          onToast: (message) => {
            toast.add(message);
          },
        }),
      );

      // 所有段落都已通过 onParagraphTranslation 回调立即更新
      const totalTranslatedCount = lastAppliedTranslations.size;
      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'translation', 'Done'),
        detail: taskText(executionLanguages.uiLocale, 'translation', 'BulkDetail', {
          count: totalTranslatedCount,
        }),
        life: 3000,
      });
    } catch (error) {
      console.error('翻译失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      state.isTranslating = false;
      state.abortController = null;
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.translatingParagraphIds.clear();
      }, 1000);
    }
  };
  const continueTranslation = guarded('bookUi.chapterTask.continueLabel', runContinueTranslation);

  // 重新翻译所有段落
  const retranslateAllParagraphs = async () => {
    // 重新翻译就是调用 translateAllParagraphs，它会重新翻译所有段落
    await translateAllParagraphs();
  };

  /**
   * polishAllParagraphs / proofreadAllParagraphs 共享的入口校验 + 运行上下文：
   * 校验书籍 / 章节 / 模型可用性 + 过滤出有翻译的段落，所有错误路径已通过 toast 反馈。
   * 返回 null 表示校验失败，调用方应直接 return。
   */
  const prepareBulkChapterTask = (
    kind: 'polish' | 'proofreading',
    languages: ExecutionLanguages,
  ): {
    targetBook: Novel;
    languages: ExecutionLanguages;
    sourceParagraphs: Paragraph[];
    targetChapter: Chapter;
    selectedModel: AIModel;
    paragraphsWithTranslation: Paragraph[];
    targetChapterId: string;
    targetBookId: string;
    targetParagraphIds: Set<string>;
    abortController: AbortController;
    lastAppliedTranslations: Map<string, string>;
    completedParagraphIds: Set<string>;
  } | null => {
    if (!book.value || !selectedChapter.value || !selectedChapterParagraphs.value.length) {
      return null;
    }
    const selectedModel = aiModelsStore.getModelForTask('proofreading', book.value);
    if (!selectedModel) {
      toast.add({
        severity: 'error',
        summary: taskText(languages.uiLocale, kind, 'Failed'),
        detail: taskText(languages.uiLocale, kind, 'NoModel'),
        life: 3000,
      });
      return null;
    }
    const paragraphsWithTranslation = selectedChapterParagraphs.value.filter(
      (para) =>
        !isEmptyParagraph(para.text) && hasParagraphTranslation(para, languages.targetLanguage),
    );
    if (paragraphsWithTranslation.length === 0) {
      toast.add({
        severity: 'error',
        summary: taskText(languages.uiLocale, kind, 'Failed'),
        detail: translateText(languages.uiLocale, `bookUi.chapterTask.${kind}NoParagraphs`),
        life: 3000,
      });
      return null;
    }
    return {
      targetBook: book.value,
      languages,
      sourceParagraphs: selectedChapterParagraphs.value.map((paragraph) => ({ ...paragraph })),
      targetChapter: selectedChapter.value,
      selectedModel,
      paragraphsWithTranslation,
      targetChapterId: selectedChapter.value.id,
      targetBookId: book.value.id,
      targetParagraphIds: new Set(paragraphsWithTranslation.map((para) => para.id)),
      abortController: new AbortController(),
      lastAppliedTranslations: new Map<string, string>(),
      completedParagraphIds: new Set<string>(),
    };
  };

  /**
   * 批量章节任务（translation / polish / proofreading）的 onProgress 回调工厂：
   * 统一 newProgress 构造、进度同步、inFlight 段落集合更新与 debug 日志输出。
   * `resolveProgress` 允许 translate 保留已有 state.progress.current/total（由 onParagraphTranslation 推进）
   * 而非覆盖为 chunk 级进度；polish / proofreading 使用默认 chunk 级进度。
   */
  const createBulkProgressHandler = <
    S extends { progress: { current: number; total: number; message: string } },
  >(opts: {
    taskType: ChapterTaskKind;
    locale: AppLocale;
    state: S;
    targetChapterId: string;
    setInFlight: (ids: Set<string>) => void;
    resolveProgress?: (
      progress: { current: number; total: number },
      state: S,
    ) => { current: number; total: number };
  }) => {
    return (progress: { current: number; total: number; currentParagraphs?: string[] }): void => {
      const resolved = opts.resolveProgress
        ? opts.resolveProgress(progress, opts.state)
        : { current: progress.current, total: progress.total };
      const newProgress = {
        current: resolved.current,
        total: resolved.total,
        message: taskText(opts.locale, opts.taskType, 'Progress', {
          current: progress.current,
          total: progress.total,
        }),
      };
      opts.state.progress = newProgress;
      syncProgressToStore(opts.taskType, opts.targetChapterId, newProgress);
      if (progress.currentParagraphs) {
        opts.setInFlight(new Set(progress.currentParagraphs));
      }
      console.debug(`${opts.taskType} 进度:`, progress);
    };
  };

  // 润色章节所有段落
  const runPolishAllParagraphs = async (
    executionLanguages: ExecutionLanguages,
    customInstructions?: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ) => {
    const prepared = prepareBulkChapterTask('polish', executionLanguages);
    if (!prepared) return;
    const {
      targetBook,
      languages,
      sourceParagraphs,
      selectedModel,
      paragraphsWithTranslation,
      targetChapterId,
      targetBookId,
      targetParagraphIds,
      abortController,
      lastAppliedTranslations,
      completedParagraphIds,
    } = prepared;

    const state = getOrCreatePolishState(targetChapterId);
    state.isPolishing = true;
    state.polishingParagraphIds.clear();
    uiStore.setActiveRightTab('progress');

    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: taskText(executionLanguages.uiLocale, 'polish', 'Init'),
    };
    state.abortController = abortController;

    try {
      const chunkSize = targetBook.translationChunkSize;
      // 调用润色服务
      const result = await PolishService.polish(paragraphsWithTranslation, selectedModel, {
        languages,
        bookId: targetBookId,
        chapterId: targetChapterId,
        ...(customInstructions?.polishInstructions !== undefined
          ? { customInstructions: customInstructions.polishInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
        allChapterParagraphs: selectedChapterParagraphs.value,
        signal: abortController.signal,
        aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
        onProgress: createBulkProgressHandler({
          taskType: 'polish',
          locale: executionLanguages.uiLocale,
          state,
          targetChapterId,
          setInFlight: (ids) => {
            state.polishingParagraphIds = ids;
          },
        }),
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphPolish: (translations) => {
          // 润色进度保持基于 chunk（由 onProgress 更新），不使用段落数量
          return applyIncrementalAndTrackCompletion(
            translations,
            {
              aiModelId: selectedModel.id,
              languages,
              sourceParagraphs,
              targetChapterId,
              targetBookId,
              lastAppliedTranslations,
              targetParagraphIds,
              completedParagraphIds,
            },
            (done) => {
              done.forEach((pt) => {
                state.polishingParagraphIds.delete(pt.id);
              });
            },
          );
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphPolish 回调立即更新）
      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'polish', 'Done'),
        detail: buildBulkTaskCompletionDetail(
          'polish',
          lastAppliedTranslations.size,
          result.actions,
          executionLanguages.uiLocale,
        ),
        life: 3000,
      });
    } catch (error) {
      console.error('润色失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      state.isPolishing = false;
      state.abortController = null;
      // 延迟清除进度信息和正在润色的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.polishingParagraphIds.clear();
      }, 1000);
    }
  };
  const polishAllParagraphs = guarded(
    'bookUi.chapterTask.polishChapterLabel',
    runPolishAllParagraphs,
  );

  // 取消翻译
  const cancelTranslation = (targetChapterId?: string) => {
    const chapterId = targetChapterId || selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterTranslationStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController（这是最重要的，因为它会真正停止翻译请求）
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const translationTasks = allTasks.filter(
      (task) => task.type === 'translation' && task.chapterId === chapterId,
    );

    // 取消当前章节的翻译任务
    for (const task of translationTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isTranslating = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.translatingParagraphIds = new Set();
  };

  // 取消润色
  const cancelPolish = (targetChapterId?: string) => {
    const chapterId = targetChapterId || selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterPolishStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const polishTasks = allTasks.filter(
      (task) => task.type === 'polish' && task.chapterId === chapterId,
    );

    // 取消当前章节的润色任务
    for (const task of polishTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isPolishing = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.polishingParagraphIds = new Set();
  };

  // 校对章节所有段落
  const runProofreadAllParagraphs = async (
    executionLanguages: ExecutionLanguages,
    customInstructions?: {
      translationInstructions?: string;
      polishInstructions?: string;
      proofreadingInstructions?: string;
    },
  ) => {
    const prepared = prepareBulkChapterTask('proofreading', executionLanguages);
    if (!prepared) return;
    const {
      targetBook,
      languages,
      sourceParagraphs,
      selectedModel,
      paragraphsWithTranslation,
      targetChapterId,
      targetBookId,
      targetParagraphIds,
      abortController,
      lastAppliedTranslations,
      completedParagraphIds,
    } = prepared;

    const state = getOrCreateProofreadingState(targetChapterId);
    state.isProofreading = true;
    state.proofreadingParagraphIds.clear();
    uiStore.setActiveRightTab('progress');

    state.progress = {
      current: 0,
      total: targetParagraphIds.size,
      message: taskText(executionLanguages.uiLocale, 'proofreading', 'Init'),
    };
    state.abortController = abortController;

    try {
      const chunkSize = targetBook.translationChunkSize;
      // 调用校对服务
      const result = await ProofreadingService.proofread(paragraphsWithTranslation, selectedModel, {
        languages,
        bookId: targetBookId,
        chapterId: targetChapterId,
        ...(customInstructions?.proofreadingInstructions !== undefined
          ? { customInstructions: customInstructions.proofreadingInstructions }
          : {}),
        ...(chunkSize !== undefined ? { chunkSize } : {}),
        allChapterParagraphs: selectedChapterParagraphs.value,
        signal: abortController.signal,
        aiProcessingStore: createAIProcessingStoreAdapter(aiProcessingStore),
        onProgress: createBulkProgressHandler({
          taskType: 'proofreading',
          locale: executionLanguages.uiLocale,
          state,
          targetChapterId,
          setInFlight: (ids) => {
            state.proofreadingParagraphIds = ids;
          },
        }),
        onAction: (action) => {
          handleActionInfoToast(action, { severity: 'info' });
        },
        onToast: (message) => {
          toast.add(message);
        },
        onParagraphProofreading: (translations) => {
          // 校对进度保持基于 chunk（由 onProgress 更新），不使用段落数量
          return applyIncrementalAndTrackCompletion(
            translations,
            {
              aiModelId: selectedModel.id,
              languages,
              sourceParagraphs,
              targetChapterId,
              targetBookId,
              lastAppliedTranslations,
              targetParagraphIds,
              completedParagraphIds,
            },
            (done) => {
              done.forEach((pt) => {
                state.proofreadingParagraphIds.delete(pt.id);
              });
            },
          );
        },
      });

      // 构建成功消息（所有段落都已通过 onParagraphProofreading 回调立即更新）
      toast.add({
        severity: 'success',
        summary: taskText(executionLanguages.uiLocale, 'proofreading', 'Done'),
        detail: buildBulkTaskCompletionDetail(
          'proofreading',
          lastAppliedTranslations.size,
          result.actions,
          executionLanguages.uiLocale,
        ),
        life: 3000,
      });
    } catch (error) {
      console.error('校对失败:', error);
      // 注意：错误 toast 已由 MainLayout.vue 中的任务状态监听器全局处理，这里不再重复显示
    } finally {
      state.isProofreading = false;
      state.abortController = null;
      // 延迟清除进度信息和正在校对的段落 ID，让用户看到完成状态
      setTimeout(() => {
        state.progress = {
          current: 0,
          total: 0,
          message: '',
        };
        state.proofreadingParagraphIds.clear();
      }, 1000);
    }
  };
  const proofreadAllParagraphs = guarded(
    'bookUi.chapterTask.proofreadChapterLabel',
    runProofreadAllParagraphs,
  );

  // 取消校对
  const cancelProofreading = (targetChapterId?: string) => {
    const chapterId = targetChapterId || selectedChapter.value?.id;
    if (!chapterId) return;

    const state = chapterProofreadingStates.value.get(chapterId);
    if (!state) return;

    // 首先取消本地的 abortController
    if (state.abortController) {
      state.abortController.abort();
      state.abortController = null;
    }

    // 然后取消当前章节相关的 AI 任务
    const allTasks = aiProcessingStore.activeTasks;
    const proofreadingTasks = allTasks.filter(
      (task) => task.type === 'proofreading' && task.chapterId === chapterId,
    );

    // 取消当前章节的校对任务
    for (const task of proofreadingTasks) {
      if (task.status !== 'end') {
        void aiProcessingStore.stopTask(task.id);
      }
    }

    // 更新 UI 状态
    state.isProofreading = false;
    state.progress = {
      current: 0,
      total: 0,
      message: '',
    };
    state.proofreadingParagraphIds = new Set();
  };

  // 监听 aiProcessingStore 任务取消事件，同步更新局部 UI 状态
  // 当用户从右侧面板翻译进度 Tab 取消任务时，此 watch 负责中止本地 AbortController 并重置 UI
  // 使用字符串 join 作为 watch 源，确保只在任务 id/status 真正变化时才触发回调
  watch(
    () =>
      aiProcessingStore.activeTasks
        .filter((t) => t.type === 'translation' || t.type === 'polish' || t.type === 'proofreading')
        .map((t) => `${t.id}:${t.status}:${t.type}:${t.chapterId ?? ''}`)
        .join(','),
    (newKey, oldKey) => {
      if (!oldKey) return;
      const newTasks = parseTaskWatchKey(newKey);
      const oldTasks = parseTaskWatchKey(oldKey);
      for (const newTask of newTasks) {
        const oldTask = oldTasks.find((t) => t.id === newTask.id);
        if (isCancelledTaskTransition(oldTask, newTask)) {
          resetChapterStateForCancelledTask(newTask);
        }
      }
    },
  );

  /** 解析 watch 的字符串 key 为任务摘要列表 */
  type TaskWatchEntry = {
    id: string;
    status: string;
    type: string;
    chapterId: string | undefined;
  };
  const parseTaskWatchKey = (key: string | null | undefined): TaskWatchEntry[] => {
    if (!key) return [];
    return key.split(',').map((s) => {
      const [id, status, type, chapterId] = s.split(':');
      return {
        id: id!,
        status: status!,
        type: type!,
        chapterId: chapterId || undefined,
      };
    });
  };

  /** 判定 newTask 是否为"从非 cancelled 变为 cancelled 且关联了章节"的取消转换 */
  const isCancelledTaskTransition = (
    oldTask: TaskWatchEntry | undefined,
    newTask: TaskWatchEntry,
  ): boolean => {
    return (
      !!oldTask &&
      oldTask.status !== 'cancelled' &&
      newTask.status === 'cancelled' &&
      !!newTask.chapterId
    );
  };

  /** 重置翻译任务的局部 UI 状态（中止 AbortController + 清零进度） */
  const resetTranslationStateIfActive = (chapterId: string): void => {
    const state = chapterTranslationStates.value.get(chapterId);
    if (!state?.isTranslating) return;
    state.abortController?.abort();
    state.abortController = null;
    state.isTranslating = false;
    state.progress = { current: 0, total: 0, message: '' };
    state.translatingParagraphIds = new Set();
  };

  const resetPolishStateIfActive = (chapterId: string): void => {
    const state = chapterPolishStates.value.get(chapterId);
    if (!state?.isPolishing) return;
    state.abortController?.abort();
    state.abortController = null;
    state.isPolishing = false;
    state.progress = { current: 0, total: 0, message: '' };
    state.polishingParagraphIds = new Set();
  };

  const resetProofreadingStateIfActive = (chapterId: string): void => {
    const state = chapterProofreadingStates.value.get(chapterId);
    if (!state?.isProofreading) return;
    state.abortController?.abort();
    state.abortController = null;
    state.isProofreading = false;
    state.progress = { current: 0, total: 0, message: '' };
    state.proofreadingParagraphIds = new Set();
  };

  /** 按任务类型分派，重置对应章节的局部状态 */
  const resetChapterStateForCancelledTask = (newTask: TaskWatchEntry): void => {
    const chapterId = newTask.chapterId!;
    if (newTask.type === 'translation') {
      resetTranslationStateIfActive(chapterId);
    } else if (newTask.type === 'polish') {
      resetPolishStateIfActive(chapterId);
    } else if (newTask.type === 'proofreading') {
      resetProofreadingStateIfActive(chapterId);
    }
  };

  // 组件卸载时取消所有任务
  onUnmounted(() => {
    cancelTranslation();
    cancelPolish();
    cancelProofreading();
  });

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
