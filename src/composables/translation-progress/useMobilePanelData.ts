import { computed, type Ref, type ComputedRef } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { AppLocale } from 'src/models/locale';
import type { MessageKey } from 'src/i18n/types';
import { translateText } from 'src/i18n/translate';

/**
 * 手机端派生数据 composable。
 *
 * 负责：进度（current/total/percent）、工作流标签、ETA、状态图例、统计卡片
 * 等基于当前选中任务与实时时钟派生的只读计算。不包含 store 写入或生命周期。
 *
 * 参数都是父 composable 已声明的响应式引用；避免子 composable 自行访问 store。
 */
export function useMobilePanelData(params: {
  currentTask: ComputedRef<AIProcessingTask | null>;
  now: Ref<number>;
  getWorkingChapterLabel: (task: AIProcessingTask) => string | null;
  /** 当前界面语言；固定标签随其变化重绘 */
  locale: ComputedRef<AppLocale>;
}) {
  const { currentTask, now, getWorkingChapterLabel, locale } = params;
  const t = (key: MessageKey, values?: Record<string, string | number>) =>
    translateText(locale.value, key, values);

  // 进度：current/total
  const mobileProgress = computed(() => {
    const p = currentTask.value?.progress;
    if (!p || !p.total) return { current: 0, total: 0, percent: 0 };
    const percent = Math.min(100, Math.round((p.current / p.total) * 100));
    return { current: p.current, total: p.total, percent };
  });

  const TERMINAL_STATUS_KEYS: Record<string, MessageKey> = {
    end: 'activityUi.status.end',
    error: 'activityUi.progress.failed',
    cancelled: 'activityUi.status.cancelled',
  };

  const WORKFLOW_STATUS_KEYS: Record<string, MessageKey> = {
    planning: 'activityUi.workflow.planning',
    working: 'activityUi.progress.mobileTranslating',
    review: 'activityUi.progress.mobileReview',
    end: 'activityUi.status.end',
  };

  // 手机端任务状态描述（ChineseWorkflow）
  const mobileWorkflowLabel = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '';
    const terminal = TERMINAL_STATUS_KEYS[task.status];
    if (terminal) return t(terminal);
    const workflow = WORKFLOW_STATUS_KEYS[task.workflowStatus ?? ''];
    if (workflow) return t(workflow);
    return t(
      task.status === 'thinking' ? 'activityUi.status.thinking' : 'activityUi.status.processing',
    );
  });

  // 预计剩余（线性外推）
  const mobileEta = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '—';
    if (task.status === 'end' || task.status === 'error' || task.status === 'cancelled')
      return t('activityUi.progress.ended');
    const { current, total } = mobileProgress.value;
    if (!total || current <= 0) return '—';
    if (current >= total) return t('activityUi.progress.almostDone');
    const elapsed = Math.max(0, now.value - task.startTime);
    const rate = elapsed / current; // ms per unit
    const remaining = (total - current) * rate;
    const seconds = Math.max(0, Math.floor(remaining / 1000));
    if (seconds < 60) return t('activityUi.progress.etaSeconds', { seconds });
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return t('activityUi.progress.etaMinutes', {
      minutes: mins,
      seconds: String(secs).padStart(2, '0'),
    });
  });

  // 当前章节标题（用于副标题）
  const mobileCurrentChapterLabel = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '';
    const label = getWorkingChapterLabel(task);
    return label || '';
  });

  // 手机端操作
  const mobileIsRunning = computed(() => {
    const s = currentTask.value?.status;
    return s === 'thinking' || s === 'processing';
  });

  // 统计卡片数据
  const formatElapsedLabel = (elapsedMs: number): string => {
    const seconds = Math.floor(elapsedMs / 1000);
    if (seconds <= 0) return '—';
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    return `${mm}:${String(ss).padStart(2, '0')}`;
  };

  const formatAvgSpeed = (elapsedMs: number, current: number): string => {
    if (current <= 0) return '—';
    const avgMs = Math.round(elapsedMs / current);
    if (avgMs <= 0) return '—';
    return avgMs >= 1000
      ? t('activityUi.progress.speedSeconds', { value: (avgMs / 1000).toFixed(1) })
      : t('activityUi.progress.speedMs', { value: avgMs });
  };

  const mobileStatTotals = computed(() => {
    const task = currentTask.value;
    const total = task?.progress?.total ?? 0;
    const current = task?.progress?.current ?? 0;
    const elapsedMs = task ? Math.max(0, (task.endTime ?? now.value) - task.startTime) : 0;
    return [
      { label: t('activityUi.progress.totalParagraphs'), value: String(total), icon: 'pi-list' },
      {
        label: t('activityUi.progress.completed'),
        value: String(current),
        icon: 'pi-check-circle',
      },
      {
        label: t('activityUi.progress.elapsed'),
        value: formatElapsedLabel(elapsedMs),
        icon: 'pi-clock',
      },
      {
        label: t('activityUi.progress.avgSpeed'),
        value: formatAvgSpeed(elapsedMs, current),
        icon: 'pi-bolt',
      },
    ];
  });

  // 手机端状态图例（颜色 · 数量）
  const mobileLegend = computed(() => {
    const task = currentTask.value;
    const legend = (success: number, running: number, queued: number, failed: number) => [
      { color: '#A7D1B0', label: t('activityUi.progress.legendSuccess'), value: success },
      { color: '#A3B7CF', label: t('activityUi.progress.legendRunning'), value: running },
      { color: '#F2C037', label: t('activityUi.progress.legendQueued'), value: queued },
      { color: '#EF5F5F', label: t('activityUi.progress.legendFailed'), value: failed },
    ];
    if (!task) return legend(0, 0, 0, 0);
    const { current, total } = mobileProgress.value;
    const queued = Math.max(0, total - current - (mobileIsRunning.value ? 1 : 0));
    const running = mobileIsRunning.value ? 1 : 0;
    const failed = task.status === 'error' ? 1 : 0;
    return legend(current, running, queued, failed);
  });

  return {
    mobileProgress,
    mobileWorkflowLabel,
    mobileEta,
    mobileCurrentChapterLabel,
    mobileIsRunning,
    mobileStatTotals,
    mobileLegend,
  };
}
