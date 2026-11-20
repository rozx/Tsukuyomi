<script setup lang="ts">
/**
 * 「其他 AI 活动」区：助手、单段任务、术语翻译等非队列 AI 任务（原「AI 思考」面板的内容）。
 * 不计入队列数量、并发名额与 chip 进度条。
 */
import { useI18n } from 'vue-i18n';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';
import { isRunningTask } from 'src/composables/task-center/task-center-state';
import TaskCenterTaskDetail from './TaskCenterTaskDetail.vue';

defineProps<{ openDetailExternally?: boolean }>();
const emit = defineEmits<{ openDetail: [task: AIProcessingTask] }>();

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
  <section class="tc-other">
    <div class="tc-section-head">
      <button
        type="button"
        class="tc-section-toggle"
        :aria-expanded="!center.otherCollapsed.value"
        @click="center.toggleOtherCollapsed"
      >
        <i
          class="pi"
          :class="center.otherCollapsed.value ? 'pi-chevron-right' : 'pi-chevron-down'"
          aria-hidden="true"
        />
        {{ t('taskQueueUi.sectionOther', { count: center.otherTasks.value.length }) }}
      </button>
      <template v-if="!center.otherCollapsed.value && center.otherTasks.value.length > 0">
        <button type="button" class="tc-section-action" @click="center.clearOther('finished')">
          {{ t('taskQueueUi.clearOtherFinished') }}
        </button>
        <button type="button" class="tc-section-action" @click="center.clearOther('all')">
          {{ t('taskQueueUi.clearOtherAll') }}
        </button>
      </template>
    </div>
    <template v-if="!center.otherCollapsed.value">
      <div v-for="task in center.otherTasks.value" :key="task.id" class="tc-other-row">
        <div class="tc-other-head">
          <button
            type="button"
            class="tc-other-main"
            @click="
              openDetailExternally ? emit('openDetail', task) : center.toggleExpand(task.id)
            "
          >
            <i :class="statusIcon(task)" aria-hidden="true" />
            <span class="tc-other-kind">{{ t(`appUi.taskTypes.${task.type}`) }}</span>
            <span class="tc-other-desc">{{ description(task) }}</span>
            <span v-if="center.isUnseen(task.id)" class="tc-other-unseen" aria-hidden="true" />
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
        <TaskCenterTaskDetail
          v-if="!openDetailExternally && center.expandedId.value === task.id"
          :task="task"
        />
      </div>
    </template>
  </section>
</template>

<style scoped>
.tc-other {
  border-top: 1px solid var(--white-opacity-10);
}

.tc-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px 4px;
}

.tc-section-toggle {
  flex: 1;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  padding: 0;
  color: var(--moon-opacity-50);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}

.tc-section-toggle i {
  font-size: 10px;
}

.tc-section-action {
  background: none;
  border: none;
  padding: 0;
  font-size: 11px;
  color: #a3b7cf;
  cursor: pointer;
}

.tc-other-row {
  padding: 6px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
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
  font-size: 12px;
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

.tc-other-stop {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--moon-opacity-60);
  cursor: pointer;
}

.tc-other-stop:hover {
  background: var(--white-opacity-8);
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
