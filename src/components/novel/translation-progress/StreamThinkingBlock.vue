<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import StreamPart from './StreamPart.vue';
import { throttle } from 'src/utils/throttle';

// 思考过程块（可折叠）：含展开/折叠、流式片段渲染与自动滚动。
// 从 TaskStream 拆出以降低父模板圈复杂度；滚动逻辑随块内联。
const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
  autoScroll: boolean;
}>();

const thinkingRef = ref<HTMLElement | null>(null);
const thinkingExpanded = ref(true);

const isActive = computed(
  () => props.task.status === 'thinking' || props.task.status === 'processing',
);
const hasThinking = computed(() => (props.task.thinkingMessage?.trim().length ?? 0) > 0);
const isThinkingActive = computed(
  () => isActive.value && (props.task.thinkingMessage?.length ?? 0) > 0,
);
const showThinkingBlock = computed(() => hasThinking.value || isActive.value);

const thinkingChevron = computed(() =>
  thinkingExpanded.value ? 'pi-chevron-down' : 'pi-chevron-right',
);
const thinkingPreview = computed(() => props.task.thinkingMessage?.slice(-120)?.trim() || '');

/**
 * 将连续的 tool-call + tool-result 合并为一对
 */
const mergedParts = computed(() => {
  const result: Array<{
    part: FormattedMessagePart;
    resultPart: FormattedMessagePart | undefined;
    resultText: string | undefined;
    resultTone: string | undefined;
  }> = [];
  const src = props.parts;
  for (let i = 0; i < src.length; i++) {
    const current = src[i]!;
    if (current.type === 'tool-result') continue;
    if (current.type === 'tool-call') {
      const next = src[i + 1];
      if (next?.type === 'tool-result') {
        result.push({
          part: current,
          resultPart: next,
          resultText: next.text,
          resultTone: next.toolResultTone,
        });
        i++;
      } else {
        result.push({ part: current, resultPart: undefined, resultText: undefined, resultTone: undefined });
      }
    } else {
      result.push({ part: current, resultPart: undefined, resultText: undefined, resultTone: undefined });
    }
  }
  return result;
});

// 思考区域自动滚动
const thinkingScrollHandler = throttle(() => {
  if (props.autoScroll && thinkingExpanded.value && thinkingRef.value) {
    thinkingRef.value.scrollTop = thinkingRef.value.scrollHeight;
  }
}, 100);

// 父组件常在同一数组上原地 push 流式片段，props.parts 引用不变。
// 依赖 mergedParts.length + 最后一项文本变化，确保原地追加也能触发自动滚动。
watch(
  () =>
    [
      mergedParts.value.length,
      mergedParts.value[mergedParts.value.length - 1]?.part.text ?? '',
      mergedParts.value[mergedParts.value.length - 1]?.resultText ?? '',
      props.task.thinkingMessage?.length ?? 0,
    ] as const,
  () => {
    nextTick(() => thinkingScrollHandler.fn());
  },
  { flush: 'post' },
);

onUnmounted(() => {
  thinkingScrollHandler.cleanup();
});
</script>

<template>
  <div
    v-if="showThinkingBlock"
    class="thinking-block"
    :class="{ 'is-expanded': thinkingExpanded }"
  >
    <button class="thinking-toggle" @click="thinkingExpanded = !thinkingExpanded">
      <i class="pi" :class="thinkingChevron" />
      <span class="thinking-toggle-label">思考过程</span>
      <i v-if="isThinkingActive" class="pi pi-spin pi-spinner thinking-spinner" />
    </button>

    <!-- 展开：完整内容 -->
    <!-- v-memo 必须和 v-for 在同一元素上，因此用一个 display:contents 包裹层做 memo 容器，
         避免历史片段在流式追加时反复 diff，仅最后一个 content 片段会因 text 变化而刷新 -->
    <div v-if="thinkingExpanded" ref="thinkingRef" class="thinking-content">
      <div
        v-for="(item, idx) in mergedParts"
        :key="idx"
          v-memo="[
            item.part.type,
            item.part.text,
            item.part.chunkInfo,
            item.part.fromStatus,
            item.part.toStatus,
            item.part.toolName,
            item.part.toolCallTone,
            item.part.toolCallArgs,
            item.resultText,
            item.resultTone,
            task.status,
          ]"
        class="stream-part-wrapper"
      >
        <StreamPart :part="item.part" :result-part="item.resultPart" :task="task" />
      </div>
      <span v-if="isThinkingActive" class="stream-cursor" />
    </div>

    <!-- 折叠：预览 -->
    <p v-else class="thinking-preview">
      {{ thinkingPreview }}
    </p>
  </div>
</template>

<style scoped>
.thinking-block {
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 10px;
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.thinking-block.is-expanded {
  flex: 1 1 0;
  min-height: 0;
}

.thinking-toggle {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  color: var(--moon-opacity-60);
  font-size: 0.6875rem;
  padding: 2px 0;
  transition: color 0.15s;
}

.thinking-toggle:hover {
  color: var(--moon-opacity-80);
}

.thinking-toggle i:first-child {
  font-size: 0.625rem;
  transition: transform 0.2s;
}

.thinking-toggle-label {
  font-weight: 600;
}

.thinking-spinner {
  font-size: 0.625rem;
  color: #6c8cff;
  margin-left: auto;
}

.thinking-content {
  margin-top: 8px;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scroll-behavior: smooth;
}

.thinking-content::-webkit-scrollbar {
  width: 3px;
}
.thinking-content::-webkit-scrollbar-track {
  background: transparent;
}
.thinking-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 2px;
}

/* v-memo 包裹层仅用于片段级记忆化，不参与布局 */
.stream-part-wrapper {
  display: contents;
}

.thinking-preview {
  margin-top: 6px;
  font-size: 0.72rem;
  color: rgba(253, 253, 255, 0.35);
  line-height: 1.5;
  font-style: italic;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow-wrap: break-word;
  word-break: break-word;
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
