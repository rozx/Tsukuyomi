import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useAIProcessingStore, type AIProcessingTask } from 'src/stores/ai-processing';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useSettingsStore } from 'src/stores/settings';
import { useUiStore } from 'src/stores/ui';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import { useImportRouteScope } from 'src/composables/import-page/useImportRouteScope';
import { isRunningTask } from 'src/composables/task-center/task-center-state';
import { useThinkingFormatter } from 'src/composables/useThinkingFormatter';
import { nextFollowed, petMood, pickCandidates, type DeskPetTaskRef } from './desk-pet-state';
import {
  buildDeskPetEntries,
  deskPetToolLine,
  headLine,
  visibleEntries,
} from './desk-pet-entries';

export interface DeskPetFollowed {
  id: string;
  kind: DeskPetTaskRef['kind'];
  /** 标题行：章节标题或「助手」 */
  title: string;
  /** 标题行右侧：章节任务的段落进度 */
  meta: string;
  task: AIProcessingTask | null;
  /** 章节任务在其他标签页执行，本标签页没有运行记录（气泡只能说明在别处运行） */
  remote: boolean;
}

export interface DeskPetSummary {
  kind: 'chapters' | 'assistant';
  /** 头像角标：成功为勾、有失败为失败数、只有被停止的任务时不显示 */
  tone: 'ok' | 'fail' | 'neutral';
  text: string;
  /** 助手回复的开头 */
  detail?: string;
  failed?: number;
  /** 只有一个章节任务结束时，打开小结直接进入该任务详情 */
  rowId?: string;
}

/**
 * 桌面端月詠桌宠的状态与操作。只在桌面布局里使用（任务中心由 MainLayout dispatcher 提供）。
 *
 * - 跟随：运行中的章节任务（任务队列）与助手回复，按 desk-pet-state 的优先级与「跟随直到结束」规则选一个；
 * - 让位：任务中心在屏幕上时不转述章节任务，助手面板打开时不转述助手；
 * - 气泡：跟随任务的流式时间线经 useThinkingFormatter 增量解析（自带节流）后转成条目；
 * - 小结：章节任务沿用任务中心 chip 的完成提示与确认；助手回复在面板收起时完成则记一条，打开面板后清除。
 */
export function useDeskPet() {
  const center = injectTaskCenter();
  const ai = useAIProcessingStore();
  const ui = useUiStore();
  const settings = useSettingsStore();
  const bookDetails = useBookDetailsStore();
  const route = useRoute();
  const { t } = useI18n();
  const translator = {
    t: (key: string, params?: Record<string, unknown>) => (params ? t(key, params) : t(key)),
  };

  // 导入页右侧固定的是导入对话，普通助手面板不在屏幕上
  const isImportRoute = useImportRouteScope();
  const assistantPanelOpen = computed(
    () => ui.rightPanelOpen && ui.activeRightTab === 'chat' && !isImportRoute.value,
  );
  // 右侧已经有月詠（助手面板，或导入页常驻的导入对话）时桌宠隐藏，不重复出现
  const visible = computed(
    () => settings.deskPetEnabled && !assistantPanelOpen.value && !isImportRoute.value,
  );

  // ---------- 可跟随的任务 ----------
  const chapterRows = computed(() => center.groups.value.running);
  const assistantTask = computed(
    () =>
      ai.activeTasks
        .filter((task) => task.type === 'assistant' && isRunningTask(task))
        .sort((a, b) => b.startTime - a.startTime)[0] ?? null,
  );
  const readingChapter = computed(() => {
    const bookId = route.params.id;
    if (!route.path.startsWith('/books/') || typeof bookId !== 'string') return null;
    const chapterId = bookDetails.getSelectedChapter(bookId);
    return chapterId ? { bookId, chapterId } : null;
  });
  const candidates = computed(() =>
    pickCandidates({
      chapterTasks: chapterRows.value.map((row) => ({
        id: row.id,
        kind: 'chapter' as const,
        bookId: row.item.bookId,
        chapterId: row.item.chapterId,
      })),
      assistant: assistantTask.value ? { id: assistantTask.value.id, kind: 'assistant' } : null,
      readingChapter: readingChapter.value,
      taskCenterVisible: center.surfaceVisible.value,
      assistantPanelOpen: assistantPanelOpen.value,
    }),
  );
  /** 角标：正在运行的可跟随任务数（包括被面板让位的） */
  const runningCount = computed(() => chapterRows.value.length + (assistantTask.value ? 1 : 0));

  // 手动选择持续到该任务结束；自动跟随直到当前任务结束才换
  const manualId = ref<string | null>(null);
  const followedId = ref<string | null>(null);
  watch(
    candidates,
    (list) => {
      if (manualId.value && !list.some((task) => task.id === manualId.value)) {
        manualId.value = null;
      }
      followedId.value = nextFollowed(followedId.value, list, manualId.value);
    },
    { immediate: true },
  );

  const followed = computed<DeskPetFollowed | null>(() => {
    const id = followedId.value;
    if (!id) return null;
    const row = chapterRows.value.find((entry) => entry.id === id);
    if (row) {
      const { current, total } = row.progress;
      return {
        id,
        kind: 'chapter',
        title: row.chapterTitle,
        meta: total ? t('deskPetUi.progress', { current, total }) : '',
        task: row.task,
        remote: row.task === null,
      };
    }
    const assistant = assistantTask.value;
    if (assistant?.id === id) {
      return {
        id,
        kind: 'assistant',
        title: t('deskPetUi.assistantTitle'),
        meta: '',
        task: assistant,
        remote: false,
      };
    }
    return null;
  });

  // ---------- 气泡条目 ----------
  const followedTasks = computed(() => (followed.value?.task ? [followed.value.task] : []));
  const { getFormatted } = useThinkingFormatter(followedTasks);
  const allEntries = computed(() => {
    const task = followed.value?.task;
    if (!task) return [];
    return buildDeskPetEntries(getFormatted(task.id), {
      toolLine: (tool) => deskPetToolLine(translator, tool),
      outputContent: task.outputContent,
    });
  });
  const expanded = computed(() => ui.deskPetBubbleExpanded);
  const entries = computed(() => visibleEntries(allEntries.value, expanded.value));
  const toggleExpanded = () => ui.setDeskPetBubbleExpanded(!ui.deskPetBubbleExpanded);

  const candidateCount = computed(() => candidates.value.length);
  const followIndex = computed(() =>
    candidates.value.findIndex((task) => task.id === followedId.value),
  );
  const selectAt = (offset: number) => {
    const list = candidates.value;
    if (list.length === 0) return;
    const index = (Math.max(0, followIndex.value) + offset + list.length) % list.length;
    manualId.value = list[index]!.id;
    followedId.value = manualId.value;
  };
  const selectNext = () => selectAt(1);
  const selectPrevious = () => selectAt(-1);

  // ---------- 结果小结 ----------
  const assistantSummary = ref<{ detail: string } | null>(null);
  watch(assistantTask, (now, before) => {
    if (!before || now?.id === before.id) return;
    if (before.status === 'end' && !assistantPanelOpen.value) {
      assistantSummary.value = { detail: headLine(before.outputContent) };
    }
  });
  watch(assistantPanelOpen, (open) => {
    if (open) assistantSummary.value = null;
  });

  /** 单个章节任务结束时按结果说明：完成为「译完了」等，失败、停止各有说法 */
  const oneChapterText = (row: (typeof center.unseenFinished.value)[number]) => {
    const title = row.chapterTitle;
    if (row.item.status === 'failed') return t('deskPetUi.summary.oneFailed', { title });
    if (row.item.status === 'cancelled') return t('deskPetUi.summary.oneStopped', { title });
    return t('deskPetUi.summary.oneChapter', {
      title,
      action: t(`deskPetUi.actions.${row.item.kind}`),
    });
  };

  // 与任务中心 chip 的完成提示一致：完成数取 chip.done，失败另计
  const chapterSummary = computed<DeskPetSummary | null>(() => {
    const chip = center.chip.value;
    if (chip.kind !== 'finished' || center.surfaceVisible.value) return null;
    const rows = center.unseenFinished.value;
    const only = rows.length === 1 ? rows[0] : undefined;
    let text: string;
    if (only) text = oneChapterText(only);
    else if (chip.done > 0) text = t('deskPetUi.summary.chapters', { count: chip.done }, chip.done);
    else text = t('deskPetUi.summary.noneDone');
    let tone: DeskPetSummary['tone'] = 'neutral';
    if (chip.failed > 0) tone = 'fail';
    else if (chip.done > 0) tone = 'ok';
    const summary: DeskPetSummary = { kind: 'chapters', tone, text, failed: chip.failed };
    if (only) summary.rowId = only.id;
    return summary;
  });

  const summary = computed<DeskPetSummary | null>(() => {
    if (assistantSummary.value) {
      return {
        kind: 'assistant',
        tone: 'ok',
        text: t('deskPetUi.summary.assistantDone'),
        detail: assistantSummary.value.detail,
      };
    }
    return chapterSummary.value;
  });

  const mood = computed(() =>
    petMood({ running: runningCount.value, hasSummary: summary.value !== null }),
  );
  /** 气泡显示什么：小结优先，其次跟随任务的进度；被面板让位或空闲时不显示 */
  const bubble = computed<'summary' | 'task' | 'none'>(() => {
    if (summary.value) return 'summary';
    return followed.value ? 'task' : 'none';
  });

  // ---------- 操作 ----------
  /**
   * 打开任务中心：以顶部系统条的任务中心按钮定位弹层——桌宠自己的按钮在打开后会随让位 / 确认而卸载，
   * 不能当锚点；任务中心已经在屏幕上时不再切换。
   */
  const openTaskCenter = (event?: Event) => {
    const chip = document.querySelector<HTMLElement>('[data-testid="task-center-chip"]');
    center.open(chip ?? undefined, event);
  };
  /** 点桌宠打开助手面板（打开后桌宠随之隐藏） */
  const openAssistant = () => {
    ui.setActiveRightTab('chat');
    if (!ui.rightPanelOpen) ui.openRightPanel();
  };
  const dismissSummary = () => {
    if (summary.value?.kind === 'assistant') assistantSummary.value = null;
    else center.acknowledge();
  };
  const openSummary = (event?: Event) => {
    const current = summary.value;
    if (!current) return;
    if (current.kind === 'assistant') {
      openAssistant();
      return;
    }
    if (current.rowId) center.openDetail(current.rowId);
    openTaskCenter(event);
  };

  return {
    visible,
    assistantPanelOpen,
    mood,
    runningCount,
    candidateCount,
    followIndex,
    followed,
    entries,
    expanded,
    toggleExpanded,
    selectNext,
    selectPrevious,
    bubble,
    summary,
    dismissSummary,
    openSummary,
    openTaskCenter,
    openAssistant,
  };
}
