<script setup lang="ts">
import { useTranslationProgressPanel } from 'src/composables/translation-progress/useTranslationProgressPanel';
import TaskSwitcher from './translation-progress/TaskSwitcher.vue';
import TaskStatusBar from './translation-progress/TaskStatusBar.vue';
import TaskTodos from './translation-progress/TaskTodos.vue';
import TaskStream from './translation-progress/TaskStream.vue';
import TaskActionBar from './translation-progress/TaskActionBar.vue';
import TaskEmptyState from './translation-progress/TaskEmptyState.vue';

const {
  bookDetailsStore,
  recentAITasks,
  selectedTaskId,
  currentTask,
  currentParts,
  currentTaskTodos,
  currentAutoScroll,
  toggleAutoScroll,
  toggleTodoCollapsed,
  showOnlyCurrentChapter,
  getWorkingChapterLabel,
  formatDuration,
  selectTask,
  stopTask,
  clearCompletedTasks,
  toggleChapterFilter,
} = useTranslationProgressPanel();
</script>

<template>
  <div class="translation-progress">
    <TaskSwitcher
      :tasks="recentAITasks"
      :selected-task-id="selectedTaskId"
      :unseen-activity="bookDetailsStore.translationProgress.unseenActivity"
      :get-working-chapter-label="getWorkingChapterLabel"
      :format-duration="formatDuration"
      @select="selectTask"
    />

    <template v-if="currentTask">
      <TaskStatusBar :task="currentTask" :format-duration="formatDuration" />

      <TaskTodos
        :todos="currentTaskTodos"
        :collapsed="bookDetailsStore.translationProgress.todoCollapsed"
        @toggle-collapsed="toggleTodoCollapsed"
      />

      <TaskStream
        :task="currentTask"
        :parts="currentParts"
        :auto-scroll="currentAutoScroll"
        @toggle-auto-scroll="toggleAutoScroll"
      />

      <TaskActionBar
        :task="currentTask"
        :show-only-current-chapter="showOnlyCurrentChapter"
        @stop="stopTask"
        @clear="clearCompletedTasks"
        @toggle-chapter-filter="toggleChapterFilter"
      />
    </template>

    <TaskEmptyState v-else />
  </div>
</template>

<style scoped>
.translation-progress {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* 强制所有子组件中的文本正确换行，防止溢出面板 */
.translation-progress :deep(p),
.translation-progress :deep(.todo-text),
.translation-progress :deep(.stream-text),
.translation-progress :deep(.tool-result),
.translation-progress :deep(.thinking-content) {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
