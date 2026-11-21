<script setup lang="ts">
/**
 * 任务详情视图：在任务中心内整面板显示一个任务（列表 → 详情下钻，返回回到列表）。
 * 依次是标题与状态、操作按钮、错误 / 提示，下方的状态栏、待办与实时日志填满剩余高度。
 * popover、固定悬浮面板与手机全屏详情共用；显示对象来自 center.detail。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { TaskQueueItemStatus } from 'src/models/task-queue';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import { isRunningTask } from 'src/composables/task-center/task-center-state';
import TaskCenterTaskDetail from './TaskCenterTaskDetail.vue';

defineProps<{ mode: 'popover' | 'pinned' | 'sheet' }>();
const emit = defineEmits<{ back: [] }>();

const { t } = useI18n();
const center = injectTaskCenter();

const row = computed(() => (center.detail.value?.kind === 'row' ? center.detail.value.row : null));
const other = computed(() =>
  center.detail.value?.kind === 'other' ? center.detail.value.task : null,
);
const logTask = computed(() => center.detailTask.value);

/** 其他 AI 活动的状态映射到队列状态文案 */
const otherStatus = (task: AIProcessingTask): TaskQueueItemStatus => {
  if (isRunningTask(task)) return 'running';
  if (task.status === 'end') return 'done';
  if (task.status === 'error') return 'failed';
  return 'cancelled';
};

const heading = computed(() => {
  if (row.value) {
    return {
      title: row.value.chapterTitle,
      subtitle: row.value.bookTitle,
      kind: t(`taskQueueUi.kind.${row.value.item.kind}`),
      status: row.value.item.status,
    };
  }
  const task = other.value;
  if (!task) return null;
  return {
    title: task.chapterTitle?.trim() || task.message?.trim() || t(`appUi.taskTypes.${task.type}`),
    subtitle: '',
    kind: t(`appUi.taskTypes.${task.type}`),
    status: otherStatus(task),
  };
});

const meta = computed(() => {
  const current = row.value;
  if (!current) return '';
  const parts: string[] = [];
  if (current.item.kind === 'translation' && current.item.mode) {
    parts.push(t(`taskQueueUi.mode.${current.item.mode}`));
  }
  if (current.progress.total > 0) parts.push(t('taskQueueUi.paragraphs', current.progress));
  if (current.item.waitingReason === 'book-busy') parts.push(t('taskQueueUi.waitingBookBusy'));
  return parts.join(' · ');
});

const errorText = computed(() =>
  row.value?.item.status === 'failed' ? (row.value.item.error?.message ?? '') : '',
);

const hint = computed(() => {
  switch (row.value?.detail) {
    case 'remote':
      return t('taskQueueUi.remoteDetail');
    case 'cleared':
      return t('taskQueueUi.logCleared');
    case 'none':
      return t('taskQueueUi.detailQueued');
    default:
      return '';
  }
});

/** 没有本地运行记录（另一个标签页在执行）时，用段落进度条代替状态栏；不显示时为 null */
const rowPercent = computed(() =>
  row.value?.item.status === 'running' && logTask.value === null
    ? row.value.progress.percent
    : null,
);

interface DetailAction {
  key: string;
  icon: string;
  label: string;
  run: () => void;
}

/** 按任务状态可用的操作：停止 / 移出队列 / 重试 / 打开章节 */
const actions = computed<DetailAction[]>(() => {
  const current = row.value;
  if (!current) {
    const task = other.value;
    return task && isRunningTask(task)
      ? [
          {
            key: 'stop',
            icon: 'pi-stop-circle',
            label: t('taskQueueUi.stop'),
            run: () => center.stopOther(task.id),
          },
        ]
      : [];
  }
  const { id, status } = current.item;
  const list: DetailAction[] = [];
  if (status === 'running') {
    list.push({
      key: 'stop',
      icon: 'pi-stop-circle',
      label: t('taskQueueUi.stop'),
      run: () => void center.queue.stopItem(id),
    });
  }
  if (status === 'queued') {
    list.push({
      key: 'remove',
      icon: 'pi-times',
      label: t('taskQueueUi.remove'),
      run: () => void center.queue.removeItem(id),
    });
  }
  if (status === 'failed' || status === 'cancelled') {
    list.push({
      key: 'retry',
      icon: 'pi-refresh',
      label: t('taskQueueUi.retry'),
      run: () => void center.queue.retry(id),
    });
  }
  list.push({
    key: 'open',
    icon: 'pi-external-link',
    label: t('taskQueueUi.openChapter'),
    run: () => void center.openChapter(current),
  });
  return list;
});
</script>

<template>
  <div v-if="heading" class="tc-dv" :class="`tc-dv--${mode}`">
    <div class="tc-dv-head">
      <button
        v-if="mode !== 'sheet'"
        type="button"
        class="hp-icon-btn"
        :title="t('taskQueueUi.backToList')"
        :aria-label="t('taskQueueUi.backToList')"
        @click="emit('back')"
      >
        <i class="pi pi-arrow-left" aria-hidden="true" />
      </button>
      <div class="tc-dv-heading">
        <div class="tc-dv-title" :title="heading.title">{{ heading.title }}</div>
        <div class="tc-dv-tags">
          <span class="tc-dv-kind">{{ heading.kind }}</span>
          <span class="tc-dv-status" :class="`tc-dv-status--${heading.status}`">
            {{ t(`taskQueueUi.status.${heading.status}`) }}
          </span>
          <span v-if="heading.subtitle" class="tc-dv-sub">{{ heading.subtitle }}</span>
        </div>
        <div v-if="meta" class="tc-dv-meta">{{ meta }}</div>
      </div>
    </div>

    <div v-if="rowPercent !== null" class="tc-dv-bar" aria-hidden="true">
      <span :style="{ width: `${rowPercent}%` }" />
    </div>
    <div v-if="errorText" class="tc-dv-error">
      <i class="pi pi-exclamation-triangle" aria-hidden="true" />{{ errorText }}
    </div>

    <div v-if="actions.length > 0" class="tc-dv-actions">
      <button
        v-for="action in actions"
        :key="action.key"
        type="button"
        class="ui-btn ui-btn--ghost ui-btn--sm"
        @click="action.run()"
      >
        <i class="pi" :class="action.icon" aria-hidden="true" />{{ action.label }}
      </button>
    </div>

    <div v-if="hint" class="tc-dv-hint">
      <i class="pi pi-info-circle" aria-hidden="true" />{{ hint }}
    </div>

    <TaskCenterTaskDetail v-if="logTask" :key="logTask.id" :task="logTask" class="tc-dv-log" />
  </div>
</template>

<style scoped>
.tc-dv {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
}

.tc-dv-head {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px 12px 8px;
}

.tc-dv-heading {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tc-dv-title {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--moon-opacity-90);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-dv-tags {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  font-size: 11px;
}

.tc-dv-kind,
.tc-dv-status {
  flex-shrink: 0;
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
}

.tc-dv-kind {
  background: rgba(109, 136, 168, 0.18);
  color: #bac9db;
}

.tc-dv-status {
  background: var(--white-opacity-8);
  color: var(--moon-opacity-70);
}

.tc-dv-status--running {
  background: rgba(163, 183, 207, 0.16);
  color: #c9d6e4;
}

.tc-dv-status--done {
  background: rgba(127, 194, 155, 0.14);
  color: #9fd3b4;
}

.tc-dv-status--failed {
  background: rgba(240, 163, 163, 0.14);
  color: #f0a3a3;
}

.tc-dv-sub {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moon-opacity-50);
}

.tc-dv-meta {
  font-size: 12px;
  color: var(--moon-opacity-60);
}

.tc-dv-bar {
  height: 4px;
  margin: 0 12px 8px;
  border-radius: 2px;
  background: var(--white-opacity-8);
  overflow: hidden;
}

.tc-dv-bar span {
  display: block;
  height: 100%;
  background: #a3b7cf;
  transition: width 300ms ease;
}

.tc-dv-error,
.tc-dv-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0 12px 8px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.5;
}

.tc-dv-error {
  background: rgba(240, 163, 163, 0.08);
  border: 1px solid rgba(240, 163, 163, 0.2);
  color: #f0b8b8;
}

.tc-dv-hint {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-70);
}

.tc-dv-error i,
.tc-dv-hint i {
  margin-top: 2px;
  font-size: 12px;
}

.tc-dv-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 12px 10px;
  border-bottom: 1px solid var(--white-opacity-8);
}

.tc-dv-actions i {
  font-size: 11px;
}

/* 日志区填满剩余高度；面板太矮时保留最小高度，由整个详情视图滚动 */
.tc-dv-log {
  flex: 1 1 0;
  min-height: var(--tc-log-min-height, 280px);
}
</style>
