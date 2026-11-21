<script setup lang="ts">
/**
 * 「其他 AI 活动」区：助手、单段任务、术语翻译等非队列 AI 任务（原「AI 思考」面板的内容）。
 * 不计入队列数量、并发名额与 chip 进度条。点击行打开该任务的详情视图。
 */
import { useI18n } from 'vue-i18n';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import { isRunningTask } from 'src/composables/task-center/task-center-state';
import TaskCenterSectionHeader from './TaskCenterSectionHeader.vue';

const emit = defineEmits<{ openDetail: [id: string] }>();

const { t } = useI18n();
const center = injectTaskCenter();

const statusIcon = (task: AIProcessingTask) => {
  if (isRunningTask(task)) return 'pi pi-spin pi-spinner tc-other-running';
  if (task.status === 'end') return 'pi pi-check tc-other-ok';
  if (task.status === 'error') return 'pi pi-exclamation-triangle tc-other-bad';
  return 'pi pi-ban tc-other-muted';
};
const description = (task: AIProcessingTask) =>
  task.chapterTitle?.trim() || task.message?.trim() || task.modelName;
</script>

<template>
  <section class="tc-section">
    <TaskCenterSectionHeader
      tone="other"
      :label="t('taskQueueUi.sectionOther')"
      :count="center.otherTasks.value.length"
      collapsible
      :collapsed="center.otherCollapsed.value"
      @toggle="center.toggleOtherCollapsed"
    >
      <template v-if="!center.otherCollapsed.value && center.otherTasks.value.length > 0">
        <button type="button" class="tc-sh-action" @click="center.clearOther('finished')">
          {{ t('taskQueueUi.clearOtherFinished') }}
        </button>
        <button type="button" class="tc-sh-action" @click="center.clearOther('all')">
          {{ t('taskQueueUi.clearOtherAll') }}
        </button>
      </template>
    </TaskCenterSectionHeader>
    <template v-if="!center.otherCollapsed.value">
      <div v-for="task in center.otherTasks.value" :key="task.id" class="tc-other-row">
        <div class="tc-other-head">
          <button type="button" class="tc-other-main" @click="emit('openDetail', task.id)">
            <i :class="statusIcon(task)" aria-hidden="true" />
            <span class="tc-other-kind">{{ t(`appUi.taskTypes.${task.type}`) }}</span>
            <span class="tc-other-desc">{{ description(task) }}</span>
            <span v-if="center.isUnseen(task.id)" class="tc-other-unseen" aria-hidden="true" />
            <i class="pi pi-angle-right tc-other-chevron" aria-hidden="true" />
          </button>
          <button
            v-if="isRunningTask(task)"
            type="button"
            class="tc-other-stop"
            :title="t('taskQueueUi.stop')"
            :aria-label="t('taskQueueUi.stop')"
            @click="center.stopOther(task.id)"
          >
            <i class="pi pi-stop-circle" aria-hidden="true" />
          </button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.tc-other-row {
  padding: 8px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
  transition: background-color 0.15s;
}

.tc-other-row:hover {
  background: var(--white-opacity-4);
}

.tc-other-row:last-child {
  border-bottom: none;
}

.tc-other-head {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tc-other-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  color: inherit;
  font-size: 12.5px;
  cursor: pointer;
  text-align: left;
}

.tc-other-main i {
  font-size: 11px;
}

.tc-other-kind {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--white-opacity-8);
  color: var(--moon-opacity-70);
}

.tc-other-desc {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--moon-opacity-80);
}

.tc-other-unseen {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f0b46c;
}

.tc-other-main .tc-other-chevron {
  font-size: 12px;
  color: var(--moon-opacity-40);
}

.tc-other-row:hover .tc-other-chevron {
  color: var(--moon-opacity-70);
}

.tc-other-stop {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  /* 按钮系统：文字 / 图标按钮 */
  color: var(--btn-text-color);
  cursor: pointer;
}

.tc-other-stop:hover {
  background: var(--btn-text-hover-bg);
  color: var(--btn-text-hover-color);
}

.tc-other-running {
  color: #a3b7cf;
}

.tc-other-ok {
  color: #7fc29b;
}

.tc-other-bad {
  color: #f0a3a3;
}

.tc-other-muted {
  color: var(--moon-opacity-50);
}
</style>
