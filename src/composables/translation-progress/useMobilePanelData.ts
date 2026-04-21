import { computed, type Ref, type ComputedRef } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';

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
}) {
  const { currentTask, now, getWorkingChapterLabel } = params;

  // 进度：current/total
  const mobileProgress = computed(() => {
    const p = currentTask.value?.progress;
    if (!p || !p.total) return { current: 0, total: 0, percent: 0 };
    const percent = Math.min(100, Math.round((p.current / p.total) * 100));
    return { current: p.current, total: p.total, percent };
  });

  // 手机端任务状态描述（ChineseWorkflow）
  const mobileWorkflowLabel = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '';
    if (task.status === 'end') return '已完成';
    if (task.status === 'error') return '已失败';
    if (task.status === 'cancelled') return '已取消';
    switch (task.workflowStatus) {
      case 'planning':
        return '规划阶段';
      case 'working':
        return '翻译中';
      case 'review':
        return '审核阶段';
      case 'end':
        return '已完成';
      default:
        return task.status === 'thinking' ? '思考中' : '处理中';
    }
  });

  // 预计剩余（线性外推）
  const mobileEta = computed<string>(() => {
    const task = currentTask.value;
    if (!task) return '—';
    if (task.status === 'end' || task.status === 'error' || task.status === 'cancelled')
      return '已结束';
    const { current, total } = mobileProgress.value;
    if (!total || current <= 0) return '—';
    if (current >= total) return '即将完成';
    const elapsed = Math.max(0, now.value - task.startTime);
    const rate = elapsed / current; // ms per unit
    const remaining = (total - current) * rate;
    const seconds = Math.max(0, Math.floor(remaining / 1000));
    if (seconds < 60) return `~ ${seconds} 秒`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `~ ${mins} 分 ${String(secs).padStart(2, '0')} 秒`;
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
  const mobileStatTotals = computed(() => {
    const task = currentTask.value;
    const total = task?.progress?.total ?? 0;
    const current = task?.progress?.current ?? 0;
    const elapsedMs = task ? Math.max(0, (task.endTime ?? now.value) - task.startTime) : 0;
    const seconds = Math.floor(elapsedMs / 1000);
    const mm = Math.floor(seconds / 60);
    const ss = seconds % 60;
    const elapsedLabel = seconds > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : '—';
    const avgMs = current > 0 ? Math.round(elapsedMs / current) : 0;
    const avgLabel =
      avgMs > 0 ? (avgMs >= 1000 ? `${(avgMs / 1000).toFixed(1)}s/段` : `${avgMs}ms/段`) : '—';
    return [
      { label: '总段数', value: String(total), icon: 'pi-list' },
      { label: '已完成', value: String(current), icon: 'pi-check-circle' },
      { label: '总耗时', value: elapsedLabel, icon: 'pi-clock' },
      { label: '平均速度', value: avgLabel, icon: 'pi-bolt' },
    ];
  });

  // 手机端状态图例（颜色 · 数量）
  const mobileLegend = computed(() => {
    const task = currentTask.value;
    if (!task) {
      return [
        { color: '#A7D1B0', label: '成功', value: 0 },
        { color: '#A3B7CF', label: '进行中', value: 0 },
        { color: '#F2C037', label: '排队', value: 0 },
        { color: '#EF5F5F', label: '失败', value: 0 },
      ];
    }
    const { current, total } = mobileProgress.value;
    const queued = Math.max(0, total - current - (mobileIsRunning.value ? 1 : 0));
    const running = mobileIsRunning.value ? 1 : 0;
    const failed = task.status === 'error' ? 1 : 0;
    return [
      { color: '#A7D1B0', label: '成功', value: current },
      { color: '#A3B7CF', label: '进行中', value: running },
      { color: '#F2C037', label: '排队', value: queued },
      { color: '#EF5F5F', label: '失败', value: failed },
    ];
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
