<script setup lang="ts">
/**
 * Tablet variant — reuses the Desktop composition (TaskSwitcher / TaskStatusBar /
 * TaskTodos / TaskStream / TaskActionBar / TaskEmptyState). The mockup's
 * right-dock translation progress panel is structurally identical to this
 * composition rendered inside the `AppRightPanel` overlay; the panel's width
 * (controlled by `ui.rightPanelWidth`) already maps to the mockup's 420px dock.
 *
 * Forking the sub-components into tablet-specific siblings to add hero-meter /
 * tabs / etc. would invent features not present in the existing store — see
 * `openspec/changes/implement-tablet-view/design.md` Decision 3.
 */
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
  <div class="translation-progress-tablet">
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
.translation-progress-tablet {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  height: 100%;
  width: 100%;
  overflow: hidden;
}

/* Tablet dock can be tighter than desktop — adjust internal padding rhythm. */
.translation-progress-tablet :deep(.task-status-bar) {
  padding-inline: 16px;
}

.translation-progress-tablet :deep(p),
.translation-progress-tablet :deep(.todo-text),
.translation-progress-tablet :deep(.stream-text),
.translation-progress-tablet :deep(.tool-result),
.translation-progress-tablet :deep(.thinking-content) {
  overflow-wrap: break-word;
  word-break: break-word;
}
</style>
