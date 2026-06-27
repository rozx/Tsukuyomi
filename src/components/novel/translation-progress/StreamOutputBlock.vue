<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { throttle } from 'src/utils/throttle';

// 输出内容块（独立、始终可见）：含流式光标与自动滚动。从 TaskStream 拆出。
const props = defineProps<{
  task: AIProcessingTask;
  autoScroll: boolean;
}>();

const outputRef = ref<HTMLElement | null>(null);

const isActive = computed(
  () => props.task.status === 'thinking' || props.task.status === 'processing',
);
const hasOutput = computed(() => (props.task.outputContent?.trim().length ?? 0) > 0);
const isOutputActive = computed(() => isActive.value && hasOutput.value);

// 输出区域自动滚动（双重 nextTick：第一次等 v-if 渲染，第二次等内容更新）
const outputScrollHandler = throttle(() => {
  if (props.autoScroll) {
    nextTick(() => {
      nextTick(() => {
        if (outputRef.value) {
          outputRef.value.scrollTop = outputRef.value.scrollHeight;
        }
      });
    });
  }
}, 100);

watch(
  () => props.task.outputContent?.length ?? 0,
  () => {
    outputScrollHandler.fn();
  },
  { flush: 'post' },
);

onUnmounted(() => {
  outputScrollHandler.cleanup();
});
</script>

<template>
  <div v-if="hasOutput" class="output-block">
    <div class="output-label">
      <i class="pi pi-file-edit" />
      <span>输出内容</span>
      <i v-if="isOutputActive" class="pi pi-spin pi-spinner output-spinner" />
    </div>
    <div ref="outputRef" class="output-content">
      <pre class="output-text">{{ task.outputContent }}</pre>
      <span v-if="isOutputActive" class="stream-cursor output-cursor" />
    </div>
  </div>
</template>

<style scoped>
.output-block {
  background: rgba(74, 222, 128, 0.03);
  border: 1px solid rgba(74, 222, 128, 0.1);
  border-left: 3px solid rgba(74, 222, 128, 0.35);
  border-radius: 8px;
  padding: 10px 12px;
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.output-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.625rem;
  font-weight: 600;
  color: rgba(74, 222, 128, 0.7);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.output-label i:first-child {
  font-size: 0.625rem;
}

.output-spinner {
  font-size: 0.625rem;
  color: #4ade80;
  margin-left: auto;
}

.output-content {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.output-content::-webkit-scrollbar {
  width: 3px;
}
.output-content::-webkit-scrollbar-track {
  background: transparent;
}
.output-content::-webkit-scrollbar-thumb {
  background: rgba(74, 222, 128, 0.15);
  border-radius: 2px;
}

.output-text {
  font-size: 0.78rem;
  line-height: 1.7;
  color: rgba(253, 253, 255, 0.8);
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: inherit;
}

.stream-cursor {
  display: inline-block;
  width: 2px;
  height: 14px;
  background: #6c8cff;
  border-radius: 1px;
  animation: blink 1s step-end infinite;
  margin-left: 2px;
  vertical-align: text-bottom;
}

.output-cursor {
  background: #4ade80;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
