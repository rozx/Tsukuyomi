import type { Novel, Paragraph, ScoreBreakdown } from 'src/models/novel';
import type { AppLocale, ExecutionLanguages } from 'src/models/locale';
import type { AIModel } from 'src/services/ai/types/ai-model';
import type { ActionInfo } from 'src/services/ai/tools/types';
import type { AIProcessingStore } from 'src/services/ai/tasks/utils/task-types';
import type { TranslationService } from 'src/services/ai/tasks/translation-service';
import type { PolishService } from 'src/services/ai/tasks/polish-service';
import type { ProofreadingService } from 'src/services/ai/tasks/proofreading-service';
import type { ToastMessageWithHistoryOptions } from 'src/composables/useToastHistory';
import type { TaskQueueItem, TaskQueueKind } from 'src/models/task-queue';
import { captureExecutionLanguages } from 'src/services/ai/tasks/utils/execution-languages';
import { hasParagraphTranslation, isEmptyParagraph } from 'src/utils';
import { translateText } from 'src/i18n/translate';
import { CodedLocalizedError } from 'src/utils/coded-localized-error';

/** 段落结果：与服务回调的形态一致 */
export interface ChapterTaskParagraphResult {
  id: string;
  translation: string;
  referencedMemories?: string[];
  memoryScoreBreakdown?: Record<string, ScoreBreakdown>;
}

export interface ChapterTaskProgress {
  current: number;
  total: number;
  message: string;
}

/** 写入段落结果时需要的上下文（执行开始时冻结） */
export interface ChapterTaskSaveContext {
  bookId: string;
  chapterId: string;
  languages: ExecutionLanguages;
  modelId: string;
  sourceParagraphs: Paragraph[];
}

export interface ChapterTaskTitleContext {
  bookId: string;
  chapterId: string;
  languages: ExecutionLanguages;
  modelId: string;
  expectedOriginal: string;
  translation: string;
}

export interface ChapterTaskServices {
  translate: typeof TranslationService.translate;
  polish: typeof PolishService.polish;
  proofread: typeof ProofreadingService.proofread;
}

/** 执行器的全部外部依赖；页面无关，由任务队列 store 注入 */
export interface ChapterTaskExecutorDeps {
  services: ChapterTaskServices;
  aiProcessingStore: AIProcessingStore;
  uiLocale: AppLocale;
  getBook: (bookId: string) => Novel | undefined;
  getModel: (kind: TaskQueueKind, book: Novel) => AIModel | undefined;
  loadChapterParagraphs: (chapterId: string) => Promise<Paragraph[] | undefined>;
  /** 落盘段落结果；resolve 时结果已写入存储 */
  saveParagraphResults: (
    ctx: ChapterTaskSaveContext,
    results: ChapterTaskParagraphResult[],
  ) => Promise<void>;
  saveTitleTranslation: (ctx: ChapterTaskTitleContext) => Promise<void>;
  /** 持久化队列项的断点信息（目标快照、已完成段落、关联的任务记录） */
  persistItem: (
    patch: Pick<
      TaskQueueItem,
      'targetParagraphIds' | 'targetLanguage' | 'completedParagraphIds' | 'aiTaskIds'
    >,
  ) => Promise<void>;
  onProgress: (progress: ChapterTaskProgress) => void;
  onInFlight: (paragraphIds: Set<string>) => void;
  onAction: (action: ActionInfo) => void;
  onToast: (message: ToastMessageWithHistoryOptions) => void;
  /** 已写入（有变化）段落数变化时回报；任务中途失败时据此提示「已保存部分结果」 */
  onAppliedCount?: (count: number) => void;
}

export interface ChapterTaskRunResult {
  /** 本次运行实际写入（有变化）的段落数 */
  appliedCount: number;
  /** 本次需要处理的段落数；0 表示没有可做的（如「继续翻译」时已全部翻译） */
  targetCount: number;
  actions: ActionInfo[];
}

type ProgressInfo = { total: number; current: number; currentParagraphs?: string[] };

function chapterTaskText(
  locale: AppLocale,
  kind: TaskQueueKind,
  message: 'Init' | 'Progress' | 'NoModel',
  values?: Record<string, string | number>,
): string {
  return translateText(locale, `bookUi.chapterTask.${kind}${message}`, values);
}

function resolveTitleOriginal(title: unknown): string {
  if (typeof title === 'string') return title;
  if (title && typeof title === 'object' && 'original' in title) {
    const original = (title as { original?: unknown }).original;
    return typeof original === 'string' ? original : '';
  }
  return '';
}

function findChapterTitle(book: Novel, chapterId: string): string {
  for (const volume of book.volumes ?? []) {
    const chapter = volume.chapters?.find((entry) => entry.id === chapterId);
    if (chapter) return resolveTitleOriginal(chapter.title);
  }
  return '';
}

function chapterExists(book: Novel, chapterId: string): boolean {
  return (book.volumes ?? []).some((volume) =>
    (volume.chapters ?? []).some((chapter) => chapter.id === chapterId),
  );
}

/**
 * 按任务类型与翻译范围计算本章的完整目标段落。
 * - 继续翻译：目标语言下还没有译文的非空段落
 * - 全部重新翻译：全部非空段落
 * - 润色 / 校对：目标语言下已有译文的非空段落
 */
export function computeChapterTaskTargets(
  item: Pick<TaskQueueItem, 'kind' | 'mode'>,
  paragraphs: readonly Paragraph[],
  targetLanguage: AppLocale,
): string[] {
  const nonEmpty = paragraphs.filter((paragraph) => !isEmptyParagraph(paragraph.text));
  if (item.kind === 'translation') {
    if (item.mode === 'retranslate') return nonEmpty.map((paragraph) => paragraph.id);
    return nonEmpty
      .filter((paragraph) => !hasParagraphTranslation(paragraph, targetLanguage))
      .map((paragraph) => paragraph.id);
  }
  return nonEmpty
    .filter((paragraph) => hasParagraphTranslation(paragraph, targetLanguage))
    .map((paragraph) => paragraph.id);
}

/**
 * 决定本次运行要处理的段落，并给出应写回队列项的断点信息。
 *
 * 有快照且目标语言未变、快照中仍有段落存在时：目标 = 快照 ∩ 现存段落 − 已完成。
 * 否则（首次运行、目标语言改了、快照段落全部消失）按原范围重新计算，并清空已完成记录。
 */
export function resolveRunTargets(
  item: Pick<
    TaskQueueItem,
    'kind' | 'mode' | 'targetParagraphIds' | 'targetLanguage' | 'completedParagraphIds'
  >,
  paragraphs: readonly Paragraph[],
  targetLanguage: AppLocale,
): { runIds: string[]; snapshot: string[]; completed: string[] } {
  const existing = new Set(paragraphs.map((paragraph) => paragraph.id));
  const snapshot = item.targetParagraphIds;
  const snapshotUsable =
    snapshot !== undefined &&
    item.targetLanguage === targetLanguage &&
    snapshot.some((id) => existing.has(id));
  if (!snapshotUsable) {
    const fresh = computeChapterTaskTargets(item, paragraphs, targetLanguage);
    return { runIds: fresh, snapshot: fresh, completed: [] };
  }
  const completed = item.completedParagraphIds.filter((id) => existing.has(id));
  const done = new Set(completed);
  const runIds = snapshot.filter((id) => existing.has(id) && !done.has(id));
  return { runIds, snapshot, completed };
}

/**
 * 执行一个章节任务队列项（不依赖任何页面）。
 *
 * 断点续跑：每批结果落盘成功后才把段落记为完成并持久化；
 * 润色 / 校对的服务只回报有改动的段落，因此还按块边界记录完成——
 * 第 k+1 块开始或服务返回时，把第 k 块（最后一块）的全部段落记为完成。
 */
export async function runChapterTask(
  item: TaskQueueItem,
  deps: ChapterTaskExecutorDeps,
  signal: AbortSignal,
): Promise<ChapterTaskRunResult> {
  const book = deps.getBook(item.bookId);
  if (!book) throw new CodedLocalizedError('BOOK_DELETED', 'bookUi.chapterTask.bookDeleted');
  if (!chapterExists(book, item.chapterId))
    throw new CodedLocalizedError('CHAPTER_MISSING', 'bookUi.chapterTask.chapterChanged');

  const model = deps.getModel(item.kind, book);
  if (!model) throw new CodedLocalizedError('NO_MODEL', `bookUi.chapterTask.${item.kind}NoModel`);

  const languages = captureExecutionLanguages(deps.uiLocale, book.targetLanguage ?? 'zh-CN');
  const paragraphs = (await deps.loadChapterParagraphs(item.chapterId)) ?? [];

  const {
    runIds,
    snapshot,
    completed: carried,
  } = resolveRunTargets(item, paragraphs, languages.targetLanguage);
  const completed = new Set(carried);
  const aiTaskIds = [...item.aiTaskIds];
  const persist = () =>
    deps.persistItem({
      targetParagraphIds: snapshot,
      targetLanguage: languages.targetLanguage,
      completedParagraphIds: [...completed],
      aiTaskIds: [...aiTaskIds],
    });
  await persist();

  if (item.kind !== 'translation' && snapshot.length === 0) {
    throw new CodedLocalizedError(
      'NO_TRANSLATION',
      item.kind === 'polish'
        ? 'bookUi.chapterTask.polishNoParagraphs'
        : 'bookUi.chapterTask.proofreadingNoParagraphs',
    );
  }
  if (runIds.length === 0) return { appliedCount: 0, targetCount: 0, actions: [] };

  const runSet = new Set(runIds);
  const runParagraphs = paragraphs.filter((paragraph) => runSet.has(paragraph.id));
  const sourceParagraphs = paragraphs.map((paragraph) => ({ ...paragraph }));
  const saveContext: ChapterTaskSaveContext = {
    bookId: item.bookId,
    chapterId: item.chapterId,
    languages,
    modelId: model.id,
    sourceParagraphs,
  };

  // 任务记录关联：注入 queueItemId，记下本次运行的 taskId，进度只按该 taskId 更新
  let taskId: string | undefined;
  const base = deps.aiProcessingStore;
  const aiProcessingStore: AIProcessingStore = {
    addTask: async (task) => {
      const id = await base.addTask({ ...task, queueItemId: item.id });
      taskId = id;
      aiTaskIds.push(id);
      await persist();
      return id;
    },
    updateTask: (id, updates) => base.updateTask(id, updates),
    appendThinkingMessage: (id, text) => base.appendThinkingMessage(id, text),
    appendOutputContent: (id, text) => base.appendOutputContent(id, text),
    removeTask: (id) => base.removeTask(id),
    get activeTasks() {
      return base.activeTasks;
    },
  };

  const publishProgress = (progress: ChapterTaskProgress) => {
    deps.onProgress(progress);
    if (taskId) void base.updateTask(taskId, { progress });
  };

  const lastApplied = new Map<string, string>();
  let appliedCount = 0;
  let inFlight = new Set<string>();
  let chunkMessage = chapterTaskText(languages.uiLocale, item.kind, 'Init');
  const paragraphProgress = () => ({
    current: runIds.filter((id) => completed.has(id)).length,
    total: runIds.length,
    message: chunkMessage,
  });
  publishProgress(
    item.kind === 'translation'
      ? paragraphProgress()
      : { current: 0, total: 0, message: chunkMessage },
  );

  /** 落盘有变化的结果，成功后再记完成并持久化 */
  const applyResults = async (results: ChapterTaskParagraphResult[], markComplete: boolean) => {
    const changed = results.filter((result) => lastApplied.get(result.id) !== result.translation);
    if (changed.length > 0) {
      await deps.saveParagraphResults(saveContext, changed);
      for (const result of changed) {
        if (!lastApplied.has(result.id)) appliedCount += 1;
        lastApplied.set(result.id, result.translation);
      }
      deps.onAppliedCount?.(appliedCount);
    }
    if (markComplete) {
      for (const result of results) if (runSet.has(result.id)) completed.add(result.id);
      await persist();
    }
    for (const result of results) inFlight.delete(result.id);
    deps.onInFlight(new Set(inFlight));
  };

  // 润色 / 校对：按块边界记完成。块完成的持久化串行执行，保证顺序与落盘一致。
  // 某次落盘失败不能让链条断掉（否则后续块既不记完成也不落盘，恢复后重复调用 AI）：
  // 记下失败继续往后走；每次落盘写的是完整的完成集合，后续一次成功即补上之前的块，失败随之消除
  let currentChunk: string[] = [];
  let chunkCompletion: Promise<void> = Promise.resolve();
  let chunkPersistFailure: { error: unknown } | null = null;
  const completeChunk = (ids: readonly string[]) => {
    if (ids.length === 0) return chunkCompletion;
    chunkCompletion = chunkCompletion.then(async () => {
      for (const id of ids) if (runSet.has(id)) completed.add(id);
      try {
        await persist();
        chunkPersistFailure = null;
      } catch (error) {
        chunkPersistFailure = { error };
      }
    });
    return chunkCompletion;
  };

  const onProgress = (progress: ProgressInfo) => {
    chunkMessage = chapterTaskText(languages.uiLocale, item.kind, 'Progress', {
      current: progress.current,
      total: progress.total,
    });
    if (item.kind !== 'translation') {
      const next = progress.currentParagraphs ?? [];
      // 同一块重试时段落相同，不算换块
      if (currentChunk.length > 0 && next.join() !== currentChunk.join()) {
        void completeChunk(currentChunk);
      }
      currentChunk = next;
      publishProgress({ current: progress.current, total: progress.total, message: chunkMessage });
    } else {
      publishProgress(paragraphProgress());
    }
    if (progress.currentParagraphs) {
      inFlight = new Set(progress.currentParagraphs);
      deps.onInFlight(new Set(inFlight));
    }
  };

  const common = {
    languages,
    bookId: item.bookId,
    chapterId: item.chapterId,
    ...(book.translationChunkSize !== undefined ? { chunkSize: book.translationChunkSize } : {}),
    allChapterParagraphs: paragraphs,
    signal,
    aiProcessingStore,
    onProgress,
    onAction: deps.onAction,
    onToast: deps.onToast,
  };

  let actions: ActionInfo[] = [];
  if (item.kind === 'translation') {
    const chapterTitle = findChapterTitle(book, item.chapterId);
    const result = await deps.services.translate(runParagraphs, model, {
      ...common,
      ...(chapterTitle ? { chapterTitle } : {}),
      onParagraphTranslation: async (translations) => {
        await applyResults(translations, true);
        publishProgress(paragraphProgress());
      },
      onTitleTranslation: (translation) =>
        deps.saveTitleTranslation({
          bookId: item.bookId,
          chapterId: item.chapterId,
          languages,
          modelId: model.id,
          expectedOriginal: chapterTitle,
          translation,
        }),
    });
    actions = result.actions ?? [];
  } else {
    const onChanged = (translations: { id: string; translation: string }[]) =>
      applyResults(translations, false);
    const result =
      item.kind === 'polish'
        ? await deps.services.polish(runParagraphs, model, {
            ...common,
            onParagraphPolish: onChanged,
          })
        : await deps.services.proofread(runParagraphs, model, {
            ...common,
            onParagraphProofreading: onChanged,
          });
    await completeChunk(currentChunk);
    currentChunk = [];
    // 最后一次落盘仍失败：断点没有记全，按失败处理（与之前一致）
    const failure = chunkPersistFailure as { error: unknown } | null;
    if (failure) throw failure.error;
    actions = result.actions ?? [];
  }

  deps.onInFlight(new Set());
  return { appliedCount, targetCount: runIds.length, actions };
}
