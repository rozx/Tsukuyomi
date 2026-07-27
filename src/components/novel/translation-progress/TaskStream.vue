<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import { useStreamVisibility } from 'src/composables/translation-progress/useStreamVisibility';
import StreamThinkingBlock from './StreamThinkingBlock.vue';
import StreamOutputBlock from './StreamOutputBlock.vue';
import { throttle } from 'src/utils/throttle';

const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
  autoScroll: boolean;
}>();

const emit = defineEmits<{
  toggleAutoScroll: [];
}>();

const isComplete = computed(() => props.task.status === 'end');

const { showPanel } = useStreamVisibility(() => props.task);

// 思考过程与输出内容合并为同一个面板：共用一个滚动容器，
// 因此自动滚动也只需一份逻辑，滚到底部即是最新的输出内容。
const scrollRef = ref<HTMLElement | null>(null);

// 双重 nextTick：第一次等 v-if / v-for 结构渲染，第二次等文本节点更新完成
const scrollHandler = throttle(() => {
  if (!props.autoScroll) return;
  nextTick(() => {
    nextTick(() => {
      if (scrollRef.value) {
        scrollRef.value.scrollTop = scrollRef.value.scrollHeight;
      }
    });
  });
}, 100);

// 父组件常在同一数组上原地 push 流式片段，props.parts 引用不变，
// 因此额外依赖长度与最后一项文本，确保原地追加也能触发自动滚动。
watch(
  () =>
    [
      props.autoScroll,
      props.parts.length,
      props.parts[props.parts.length - 1]?.text ?? '',
      props.task.thinkingMessage?.length ?? 0,
      props.task.outputContent?.length ?? 0,
    ] as const,
  () => {
    scrollHandler.fn();
  },
  { flush: 'post' },
);

onUnmounted(() => {
  scrollHandler.cleanup();
});
</script>

<template>
  <div class="stream-section">
    <div class="stream-header">
      <span class="stream-title">实时日志</span>
      <button
        class="auto-scroll-btn"
        :class="{ enabled: autoScroll }"
        @click="emit('toggleAutoScroll')"
      >
        <i class="pi pi-arrow-down text-[0.625rem]" />
        自动滚动
      </button>
    </div>

    <!-- 完成提示 -->
    <div v-if="isComplete" class="completed-banner">
      <span class="completed-icon">&#x2713;</span>
      任务已完成
      <template v-if="task.progress"> · 共处理 {{ task.progress.total }} 个翻译块 </template>
    </div>

    <!-- 合并面板：思考过程 + 输出内容共用一个滚动容器 -->
    <div v-if="showPanel" ref="scrollRef" class="stream-panel">
      <StreamThinkingBlock :task="task" :parts="parts" />
      <StreamOutputBlock :task="task" />
    </div>
  </div>
</template>

<style scoped>
.stream-section {
  flex: 4 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 16px 16px;
}

.stream-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  flex-shrink: 0;
}

.stream-title {
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--moon-opacity-50);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.auto-scroll-btn {
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(253, 253, 255, 0.35);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid transparent;
  padding: 3px 8px;
  border-radius: 5px;
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 4px;
}

.auto-scroll-btn.enabled {
  color: #6c8cff;
  background: rgba(108, 140, 255, 0.1);
  border-color: rgba(108, 140, 255, 0.2);
}

.auto-scroll-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

/* ── 合并后的日志面板：唯一的滚动容器 ── */
.stream-panel {
  /* 子区块的吸顶标签需要不透明底色遮住滚动内容，统一在这里定义便于覆盖 */
  --stream-label-bg: rgba(22, 22, 27, 0.92);
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 0 10px 8px;
}

.stream-panel::-webkit-scrollbar {
  width: 3px;
}
.stream-panel::-webkit-scrollbar-track {
  background: transparent;
}
.stream-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

/* ── 完成提示 ── */
.completed-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 12px;
  background: rgba(74, 222, 128, 0.08);
  border: 1px solid rgba(74, 222, 128, 0.15);
  border-radius: 8px;
  font-size: 0.75rem;
  color: #4ade80;
  font-weight: 500;
  flex-shrink: 0;
}

.completed-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(74, 222, 128, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.625rem;
  flex-shrink: 0;
}
</style>
