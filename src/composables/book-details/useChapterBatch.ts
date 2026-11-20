import {
  computed,
  inject,
  onUnmounted,
  provide,
  reactive,
  ref,
  watch,
  type InjectionKey,
  type Ref,
} from 'vue';
import type { Novel, Paragraph, Volume } from 'src/models/novel';
import type { TaskQueueKind, TaskQueueTranslationMode } from 'src/models/task-queue';
import { useTaskQueueStore } from 'src/stores/task-queue';
import { useSettingsStore } from 'src/stores/settings';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import { translateText } from 'src/i18n/translate';
import { createChapterBatchSelection } from './useChapterBatchSelection';
import { createChapterCompletionStats } from './useChapterCompletionStats';
import { planEnqueue, type EnqueueRequest } from 'src/services/chapter-task/task-queue-logic';

export interface BatchConfirmOptions {
  kind: TaskQueueKind;
  mode: TaskQueueTranslationMode;
  position: 'front' | 'back';
}

/**
 * 章节列表批量启动：多选状态、完成度统计、确认对话框与入队。
 * 由书籍详情页 composable 创建一次，桌面 / 平板 / 手机的章节列表与页面 dispatcher 上的对话框共用。
 */
export function createChapterBatch(
  book: Ref<Novel | undefined>,
  seed: () => Map<string, { translated: number; total: number }> | undefined,
  options: {
    /** 卷是否展开；多选时只为展开的卷计算完成度 */
    isVolumeExpanded?: (volumeId: string) => boolean;
    load?: (chapterIds: string[]) => Promise<Map<string, Paragraph[] | undefined>>;
  } = {},
) {
  const selection = createChapterBatchSelection(book);
  const stats = createChapterCompletionStats(book, {
    seed,
    ...(options.load ? { load: options.load } : {}),
  });
  const queue = useTaskQueueStore();
  const settings = useSettingsStore();
  const toast = useToastWithHistory();

  const dialog = reactive({ visible: false, kind: 'translation' as TaskQueueKind });

  watch(
    () => book.value?.id,
    () => {
      selection.exit();
      dialog.visible = false;
    },
  );

  // 完成度缓存只在一次多选会话内有效，退出时清空
  watch(selection.active, (active) => {
    if (!active) stats.reset();
  });

  // 多选时按需计算已展开卷的章节完成度（展开新卷时补算）
  const expandedChapterIds = () =>
    (book.value?.volumes ?? [])
      .filter((volume) => options.isVolumeExpanded?.(volume.id) ?? true)
      .flatMap((volume) => (volume.chapters ?? []).map((chapter) => chapter.id));
  watch(
    () => (selection.active.value ? expandedChapterIds() : []),
    (ids) => {
      if (ids.length > 0) void stats.ensure(ids);
    },
  );

  // Esc 退出多选（对话框打开时交给对话框处理）
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && selection.active.value && !dialog.visible) selection.exit();
  };
  if (typeof window !== 'undefined') window.addEventListener('keydown', onKeydown);
  onUnmounted(() => {
    if (typeof window !== 'undefined') window.removeEventListener('keydown', onKeydown);
  });

  const openDialog = (kind: TaskQueueKind) => {
    if (selection.count.value === 0) return;
    dialog.kind = kind;
    dialog.visible = true;
    // 润色 / 校对需要知道哪些章节有译文
    void stats.ensure(selection.orderedIds.value);
  };

  /** 选未翻译：先算出全书完成度，再勾选未完成的章节；计算期间 untranslatedLoading 为 true */
  const untranslatedLoading = ref(false);
  const selectUntranslated = async () => {
    if (untranslatedLoading.value) return;
    untranslatedLoading.value = true;
    try {
      await stats.ensure(selection.chapterOrder.value);
      selection.selectWhere((id) => !stats.isComplete(id));
    } finally {
      untranslatedLoading.value = false;
    }
  };

  /** 章节在队列中的状态（任意任务类型）；没有待处理项返回 null */
  const chapterQueueState = (chapterId: string): 'running' | 'queued' | null => {
    const bookId = book.value?.id;
    const pending = queue.items.filter(
      (item) =>
        item.bookId === bookId &&
        item.chapterId === chapterId &&
        (item.status === 'running' || item.status === 'queued'),
    );
    if (pending.some((item) => item.status === 'running')) return 'running';
    return pending.length > 0 ? 'queued' : null;
  };

  /** 选中章节按书序生成的入队请求 */
  const buildRequests = (kind: TaskQueueKind, mode: TaskQueueTranslationMode): EnqueueRequest[] => {
    const bookId = book.value?.id;
    if (!bookId) return [];
    return selection.orderedIds.value.map((chapterId) => ({
      bookId,
      chapterId,
      kind,
      mode: kind === 'translation' ? mode : undefined,
      origin: 'batch' as const,
    }));
  };
  /** 润色 / 校对要求章节已有目标语言译文 */
  const applicability = (kind: TaskQueueKind) =>
    kind === 'translation'
      ? {}
      : { isApplicable: (request: EnqueueRequest) => stats.hasTranslation(request.chapterId) };

  /** 对话框预估：将新增、已在队列、不适用的数量（与真正入队同一套判定） */
  const preview = (kind: TaskQueueKind) => {
    const plan = planEnqueue(queue.items, buildRequests(kind, 'continue'), {
      position: 'back',
      now: 0,
      newId: () => '',
      ...applicability(kind),
    });
    return {
      add: plan.added.length,
      duplicate: plan.skippedDuplicate,
      notApplicable: plan.skippedNotApplicable,
    };
  };

  /** 按书中章节顺序批量入队，提示结果并退出多选 */
  const confirm = async (options: BatchConfirmOptions) => {
    if (!book.value?.id) return;
    const result = await queue.enqueue(buildRequests(options.kind, options.mode), {
      position: options.position,
      ...applicability(options.kind),
    });
    const locale = settings.uiLocale;
    const parts = [
      translateText(locale, 'taskQueueUi.batch.resultAdded', { count: result.added.length }),
    ];
    if (result.skippedDuplicate > 0) {
      parts.push(
        translateText(locale, 'taskQueueUi.batch.resultDuplicate', {
          count: result.skippedDuplicate,
        }),
      );
    }
    if (result.skippedNotApplicable > 0) {
      parts.push(
        translateText(locale, 'taskQueueUi.batch.resultNotApplicable', {
          count: result.skippedNotApplicable,
        }),
      );
    }
    toast.add({
      severity: result.added.length > 0 ? 'success' : 'info',
      summary: parts.join(translateText(locale, 'taskQueueUi.batch.resultJoin')),
      life: 3000,
    });
    dialog.visible = false;
    selection.exit();
  };

  return {
    selection,
    stats,
    queue,
    dialog,
    openDialog,
    selectUntranslated,
    untranslatedLoading,
    chapterQueueState,
    preview,
    confirm,
  };
}

export type ChapterBatch = ReturnType<typeof createChapterBatch>;

const CHAPTER_BATCH_KEY: InjectionKey<ChapterBatch> = Symbol('chapter-batch');

export function provideChapterBatch(batch: ChapterBatch): void {
  provide(CHAPTER_BATCH_KEY, batch);
}

/** 章节行等子组件读取批量状态；不在书籍详情页内时为 null */
export function injectChapterBatch(): ChapterBatch | null {
  return inject(CHAPTER_BATCH_KEY, null);
}

/**
 * 章节列表（桌面 / 平板）行级多选辅助：复选框状态与「多选时点行切换勾选」。
 * 不在书籍详情页内（没有 provide）时全部退化为普通行为。
 */
export function useChapterBatchRows() {
  const batch = injectChapterBatch();
  const selecting = computed(() => !!batch?.selection.active.value);
  return {
    selecting,
    isChecked: (chapterId: string) => !!batch?.selection.isSelected(chapterId),
    volumeCheckState: (volume: Volume) => batch?.selection.volumeState(volume) ?? 'none',
    toggleVolumeSelection: (volume: Volume) => batch?.selection.toggleVolume(volume),
    /** 多选中则切换勾选并返回 true（调用方不再打开章节） */
    toggleIfSelecting: (chapterId: string) => {
      if (!batch || !selecting.value) return false;
      batch.selection.toggle(chapterId);
      return true;
    },
  };
}
