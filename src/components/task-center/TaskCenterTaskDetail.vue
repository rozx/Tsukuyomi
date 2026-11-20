<script lang="ts">
/** 各任务流式区的滚动位置（模块级，跨行切换与断点切换保留） */
const scrollMemory = new Map<string, number>();
</script>

<script setup lang="ts">
/**
 * 展开行中的任务详细过程：状态栏、待办与流式内容（复用原翻译进度面板的子组件）。
 * 流式区限高滚动，避免撑开 popup。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import TaskStatusBar from 'src/components/novel/translation-progress/TaskStatusBar.vue';
import TaskTodos from 'src/components/novel/translation-progress/TaskTodos.vue';
import TaskStream from 'src/components/novel/translation-progress/TaskStream.vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';

const props = defineProps<{ task: AIProcessingTask; streamHeight?: string }>();

const center = injectTaskCenter();

/**
 * 跨行切换保持滚动位置：收起时记下流式区的滚动位置，再次展开时恢复
 * （自动滚动开启时流式区本来就跟随到底部，不需要恢复）。
 */
const streamRef = ref<HTMLElement | null>(null);
const panel = () => streamRef.value?.querySelector<HTMLElement>('.stream-panel') ?? null;
onMounted(async () => {
  await nextTick();
  const saved = scrollMemory.get(props.task.id);
  const el = panel();
  if (el && saved !== undefined && !center.autoScroll.value) el.scrollTop = saved;
});
onBeforeUnmount(() => {
  const el = panel();
  if (el) scrollMemory.set(props.task.id, el.scrollTop);
});
</script>

<template>
  <div class="tc-detail">
    <TaskStatusBar :task="task" :format-duration="center.formatDuration" />
    <TaskTodos
      v-if="center.currentTaskTodos.value.length > 0"
      :todos="center.currentTaskTodos.value"
      :collapsed="center.todoCollapsed.value"
      @toggle-collapsed="center.toggleTodoCollapsed"
    />
    <div ref="streamRef" class="tc-detail-stream" :style="{ height: streamHeight ?? '200px' }">
      <TaskStream
        :task="task"
        :parts="center.expandedParts.value"
        :auto-scroll="center.autoScroll.value"
        @toggle-auto-scroll="center.toggleAutoScroll"
      />
    </div>
  </div>
</template>

<style scoped>
.tc-detail {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
  border-radius: 8px;
  background: var(--white-opacity-4);
  overflow: hidden;
}

.tc-detail-stream {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tc-detail-stream > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
