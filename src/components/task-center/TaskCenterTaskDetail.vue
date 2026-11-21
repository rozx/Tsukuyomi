<script lang="ts">
/** 各任务流式区的滚动位置（模块级，跨行切换与断点切换保留） */
const scrollMemory = new Map<string, number>();
</script>

<script setup lang="ts">
/**
 * 任务详情里的详细过程：状态栏、待办与实时日志（复用原翻译进度面板的子组件）。
 * 日志区填满父级给出的高度（父级用 flex 布局并设置最小高度）。
 */
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import TaskStatusBar from 'src/components/novel/translation-progress/TaskStatusBar.vue';
import TaskTodos from 'src/components/novel/translation-progress/TaskTodos.vue';
import TaskStream from 'src/components/novel/translation-progress/TaskStream.vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { injectTaskCenter } from 'src/composables/task-center/useTaskCenter';

const props = defineProps<{ task: AIProcessingTask }>();

const center = injectTaskCenter();

/**
 * 跨任务切换保持滚动位置：离开详情时记下日志区的滚动位置，再次打开时恢复
 * （自动滚动开启时日志区本来就跟随到底部，不需要恢复）。
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
    <div ref="streamRef" class="tc-detail-stream">
      <TaskStream
        :task="task"
        :parts="center.detailParts.value"
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
  min-height: 0;
}

.tc-detail-stream {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tc-detail-stream > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
