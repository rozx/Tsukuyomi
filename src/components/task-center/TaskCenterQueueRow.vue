<script setup lang="ts">
/**
 * 任务中心中的一个章节任务行：标题、进度、行级操作，点击标题行展开详细过程。
 * 排队中的行可拖动调整顺序。
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  injectTaskCenter,
  type TaskCenterRow,
} from 'src/composables/task-center/useTaskCenter';
import TaskCenterTaskDetail from './TaskCenterTaskDetail.vue';

const props = defineProps<{
  row: TaskCenterRow;
  /** 手机抽屉：点击行打开全屏详情，不在行内展开 */
  openDetailExternally?: boolean;
}>();
const emit = defineEmits<{ openDetail: [row: TaskCenterRow] }>();

const { t } = useI18n();
const center = injectTaskCenter();

const item = computed(() => props.row.item);
const expanded = computed(
  () => !props.openDetailExternally && center.expandedId.value === props.row.id,
);
const unseen = computed(() => center.isUnseen(props.row.id));
const title = computed(() =>
  props.row.bookTitle ? `${props.row.bookTitle} · ${props.row.chapterTitle}` : props.row.chapterTitle,
);
const kindLabel = computed(() => t(`taskQueueUi.kind.${item.value.kind}`));
const statusIcon = computed(() => {
  switch (item.value.status) {
    case 'done':
      return 'pi pi-check tc-row-ok';
    case 'failed':
      return 'pi pi-exclamation-triangle tc-row-bad';
    case 'cancelled':
      return 'pi pi-ban tc-row-muted';
    default:
      return '';
  }
});
const meta = computed(() => {
  const parts: string[] = [];
  if (item.value.kind === 'translation' && item.value.mode) {
    parts.push(t(`taskQueueUi.mode.${item.value.mode}`));
  }
  if (props.row.progress.total > 0) {
    parts.push(t('taskQueueUi.paragraphs', props.row.progress));
  }
  if (item.value.waitingReason === 'book-busy') parts.push(t('taskQueueUi.waitingBookBusy'));
  if (item.value.status === 'failed' && item.value.error) parts.push(item.value.error.message);
  return parts.join(' · ');
});

const onHeaderClick = () => {
  if (props.openDetailExternally) {
    emit('openDetail', props.row);
    return;
  }
  center.toggleExpand(props.row.id);
};

const onDragStart = (event: DragEvent) => {
  event.dataTransfer?.setData('text/task-queue-item', props.row.id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
};
const onDrop = (event: DragEvent) => {
  const draggedId = event.dataTransfer?.getData('text/task-queue-item');
  if (!draggedId || draggedId === props.row.id) return;
  const target = center.groups.value.queued.findIndex((entry) => entry.id === props.row.id);
  if (target >= 0) void center.queue.reorder(draggedId, target);
};
</script>

<template>
  <div
    class="tc-row"
    :class="[`tc-row--${item.status}`, { 'tc-row--expanded': expanded }]"
    :draggable="item.status === 'queued'"
    @dragstart="onDragStart"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <div class="tc-row-head">
      <button type="button" class="tc-row-main" :aria-expanded="expanded" @click="onHeaderClick">
        <i
          v-if="item.status === 'queued'"
          class="pi pi-bars tc-row-grip"
          :title="t('taskQueueUi.dragToReorder')"
          aria-hidden="true"
        />
        <i v-else-if="!openDetailExternally" class="pi tc-row-chevron" :class="expanded ? 'pi-chevron-down' : 'pi-chevron-right'" aria-hidden="true" />
        <i v-if="statusIcon" :class="statusIcon" aria-hidden="true" />
        <span class="tc-row-kind">{{ kindLabel }}</span>
        <span class="tc-row-title">{{ title }}</span>
        <span v-if="unseen" class="tc-row-unseen" aria-hidden="true" />
        <span v-if="item.status === 'running'" class="tc-row-percent">{{ row.progress.percent }}%</span>
      </button>
      <div class="tc-row-actions">
        <button
          v-if="item.status === 'running'"
          type="button"
          class="tc-icon-btn"
          :title="t('taskQueueUi.stop')"
          :aria-label="t('taskQueueUi.stop')"
          @click="center.queue.stopItem(item.id)"
        >
          <i class="pi pi-stop-circle" aria-hidden="true" />
        </button>
        <button
          v-if="item.status === 'queued'"
          type="button"
          class="tc-icon-btn"
          :title="t('taskQueueUi.remove')"
          :aria-label="t('taskQueueUi.remove')"
          @click="center.queue.removeItem(item.id)"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
        <button
          v-if="item.status === 'failed' || item.status === 'cancelled'"
          type="button"
          class="tc-icon-btn"
          :title="t('taskQueueUi.retry')"
          :aria-label="t('taskQueueUi.retry')"
          @click="center.queue.retry(item.id)"
        >
          <i class="pi pi-refresh" aria-hidden="true" />
        </button>
      </div>
    </div>
    <div v-if="item.status === 'running'" class="tc-row-bar" aria-hidden="true">
      <span :style="{ width: `${row.progress.percent}%` }" />
    </div>
    <div v-if="meta" class="tc-row-meta">{{ meta }}</div>

    <div v-if="expanded" class="tc-row-expanded">
      <TaskCenterTaskDetail v-if="row.detail === 'local' && row.task" :task="row.task" />
      <div v-else-if="row.detail === 'remote'" class="tc-row-hint">
        {{ t('taskQueueUi.remoteDetail') }}
      </div>
      <div v-else-if="row.detail === 'cleared'" class="tc-row-hint">
        {{ t(`taskQueueUi.status.${item.status}`) }} · {{ t('taskQueueUi.logCleared') }}
      </div>
      <button type="button" class="tc-link" @click="center.openChapter(row)">
        <i class="pi pi-external-link" aria-hidden="true" />{{ t('taskQueueUi.openChapter') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.tc-row {
  padding: 7px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
}

.tc-row[draggable='true'] {
  cursor: grab;
}

.tc-row-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tc-row-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  cursor: pointer;
  text-align: left;
  font-size: 12px;
}

.tc-row-grip,
.tc-row-chevron {
  font-size: 10px;
  color: var(--moon-opacity-50);
}

.tc-row-kind {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: rgba(109, 136, 168, 0.18);
  color: #bac9db;
}

.tc-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moon-opacity-90);
}

.tc-row-unseen {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f0b46c;
  flex-shrink: 0;
}

.tc-row-percent {
  font-size: 11px;
  color: var(--moon-opacity-60);
  font-variant-numeric: tabular-nums;
}

.tc-row-ok {
  color: #7fc29b;
  font-size: 11px;
}

.tc-row-bad {
  color: #f0a3a3;
  font-size: 11px;
}

.tc-row-muted {
  color: var(--moon-opacity-50);
  font-size: 11px;
}

.tc-row-actions {
  display: flex;
  gap: 2px;
}

.tc-icon-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 6px;
  background: transparent;
  /* 按钮系统：文字 / 图标按钮 */
  color: var(--btn-text-color);
  cursor: pointer;
}

.tc-icon-btn:hover {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.tc-icon-btn i {
  font-size: 12px;
}

.tc-row-bar {
  height: 3px;
  margin-top: 5px;
  border-radius: 2px;
  background: var(--white-opacity-8);
  overflow: hidden;
}

.tc-row-bar span {
  display: block;
  height: 100%;
  background: #a3b7cf;
  transition: width 300ms ease;
}

.tc-row-meta {
  margin-top: 3px;
  font-size: 11px;
  color: var(--moon-opacity-50);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tc-row-expanded {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tc-row-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--moon-opacity-60);
}

.tc-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #a3b7cf;
  background: none;
  border: none;
  padding: 2px 0;
  cursor: pointer;
}

.tc-link i {
  font-size: 10px;
}
</style>
