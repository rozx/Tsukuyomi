<script setup lang="ts">
/**
 * 手机任务中心：点击 chip 打开底部抽屉；点击任务行打开该任务的全屏详情。
 * 手机端不提供固定与收起（固定状态保留，回到桌面断点时恢复）。
 */
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import {
  injectTaskCenter,
  type TaskCenterRow,
} from 'src/composables/task-center/useTaskCenter';
import { isRunningTask } from 'src/composables/task-center/task-center-state';
import TaskCenterBody from './TaskCenterBody.vue';
import TaskCenterTaskDetail from './TaskCenterTaskDetail.vue';

const { t } = useI18n();
const center = injectTaskCenter();

const sheetVisible = ref(false);
const detailRowId = ref<string | null>(null);
const detailTaskId = ref<string | null>(null);

const detailRow = computed(() => {
  if (!detailRowId.value) return null;
  const { running, queued, finished } = center.groups.value;
  return [...running, ...queued, ...finished].find((row) => row.id === detailRowId.value) ?? null;
});
const detailTask = computed<AIProcessingTask | null>(() => {
  if (detailRow.value) return detailRow.value.detail === 'local' ? detailRow.value.task : null;
  if (!detailTaskId.value) return null;
  return center.otherTasks.value.find((task) => task.id === detailTaskId.value) ?? null;
});
const detailVisible = computed({
  get: () => detailRowId.value !== null || detailTaskId.value !== null,
  set: (open: boolean) => {
    if (open) return;
    detailRowId.value = null;
    detailTaskId.value = null;
    const expanded = center.expandedId.value;
    if (expanded) center.toggleExpand(expanded);
  },
});
const detailTitle = computed(() => {
  if (detailRow.value) return detailRow.value.chapterTitle;
  return detailTask.value ? t(`appUi.taskTypes.${detailTask.value.type}`) : '';
});

const openRowDetail = (row: TaskCenterRow) => {
  detailTaskId.value = null;
  detailRowId.value = row.id;
  if (center.expandedId.value !== row.id) center.toggleExpand(row.id);
};
const openTaskDetail = (task: AIProcessingTask) => {
  detailRowId.value = null;
  detailTaskId.value = task.id;
  if (center.expandedId.value !== task.id) center.toggleExpand(task.id);
};

const setSheetVisible = (open: boolean) => {
  sheetVisible.value = open;
  center.setOpen(open);
};

onMounted(() => {
  center.registerOpener(() => setSheetVisible(!sheetVisible.value));
});
onUnmounted(() => center.registerOpener(null));
</script>

<template>
  <MobileBottomSheet
    :visible="sheetVisible"
    :title="t('taskQueueUi.title')"
    min-height="50dvh"
    full-bleed
    @update:visible="setSheetVisible"
  >
    <TaskCenterBody
      mode="sheet"
      @open-row-detail="openRowDetail"
      @open-task-detail="openTaskDetail"
    />
  </MobileBottomSheet>

  <MobileBottomSheet
    v-model:visible="detailVisible"
    :title="detailTitle"
    min-height="100dvh"
    max-height="100dvh"
    full-bleed
  >
    <div class="tc-mobile-detail">
      <template v-if="detailRow">
        <div class="tc-mobile-meta">
          {{ t(`taskQueueUi.kind.${detailRow.item.kind}`) }} ·
          {{ t(`taskQueueUi.status.${detailRow.item.status}`) }}
          <span v-if="detailRow.progress.total > 0">
            · {{ t('taskQueueUi.paragraphs', detailRow.progress) }}
          </span>
        </div>
        <div class="tc-mobile-actions">
          <button
            v-if="detailRow.item.status === 'running'"
            type="button"
            class="tc-mobile-btn"
            @click="center.queue.stopItem(detailRow.item.id)"
          >
            <i class="pi pi-stop-circle" aria-hidden="true" />{{ t('taskQueueUi.stop') }}
          </button>
          <button
            v-if="detailRow.item.status === 'queued'"
            type="button"
            class="tc-mobile-btn"
            @click="center.queue.removeItem(detailRow.item.id)"
          >
            <i class="pi pi-times" aria-hidden="true" />{{ t('taskQueueUi.remove') }}
          </button>
          <button
            v-if="detailRow.item.status === 'failed' || detailRow.item.status === 'cancelled'"
            type="button"
            class="tc-mobile-btn"
            @click="center.queue.retry(detailRow.item.id)"
          >
            <i class="pi pi-refresh" aria-hidden="true" />{{ t('taskQueueUi.retry') }}
          </button>
          <button type="button" class="tc-mobile-btn" @click="center.openChapter(detailRow)">
            <i class="pi pi-external-link" aria-hidden="true" />{{ t('taskQueueUi.openChapter') }}
          </button>
        </div>
        <div v-if="detailRow.detail === 'remote'" class="tc-mobile-hint">
          {{ t('taskQueueUi.remoteDetail') }}
        </div>
        <div v-else-if="detailRow.detail === 'cleared'" class="tc-mobile-hint">
          {{ t('taskQueueUi.logCleared') }}
        </div>
      </template>
      <div v-else-if="detailTask && isRunningTask(detailTask)" class="tc-mobile-actions">
        <button type="button" class="tc-mobile-btn" @click="center.stopOther(detailTask.id)">
          <i class="pi pi-stop-circle" aria-hidden="true" />{{ t('taskQueueUi.stop') }}
        </button>
      </div>
      <TaskCenterTaskDetail v-if="detailTask" :task="detailTask" stream-height="60dvh" />
    </div>
  </MobileBottomSheet>
</template>

<style scoped>
.tc-mobile-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 16px;
}

.tc-mobile-meta {
  font-size: 12px;
  color: var(--moon-opacity-60);
}

.tc-mobile-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tc-mobile-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-4);
  color: var(--moon-opacity-90);
  font-size: 13px;
}

.tc-mobile-hint {
  font-size: 12px;
  color: var(--moon-opacity-60);
}
</style>
