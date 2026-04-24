<script setup lang="ts">
import { ref, watch, nextTick, onUnmounted, computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import StreamToolCall from './StreamToolCall.vue';
import StreamChunkSeparator from './StreamChunkSeparator.vue';
import StreamStateTransition from './StreamStateTransition.vue';
import { throttle } from 'src/utils/throttle';

const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
  autoScroll: boolean;
}>();

const emit = defineEmits<{
  toggleAutoScroll: [];
}>();

const thinkingRef = ref<HTMLElement | null>(null);
const outputRef = ref<HTMLElement | null>(null);
const thinkingExpanded = ref(true);

const isActive = computed(
  () => props.task.status === 'thinking' || props.task.status === 'processing',
);

const isComplete = computed(() => props.task.status === 'end');

const hasThinking = computed(() => (props.task.thinkingMessage?.trim().length ?? 0) > 0);
const hasOutput = computed(() => (props.task.outputContent?.trim().length ?? 0) > 0);

const isThinkingActive = computed(() => {
  if (!isActive.value) return false;
  return (props.task.thinkingMessage?.length ?? 0) > 0;
});

const isOutputActive = computed(() => {
  if (!isActive.value) return false;
  return hasOutput.value;
});

/**
 * 将连续的 tool-call + tool-result 合并为一对
 */
const mergedParts = computed(() => {
  const result: Array<{
    part: FormattedMessagePart;
    resultPart: FormattedMessagePart | undefined;
  }> = [];
  const src = props.parts;
  for (let i = 0; i < src.length; i++) {
    const current = src[i]!;
    if (current.type === 'tool-result') continue;
    if (current.type === 'tool-call') {
      const next = src[i + 1];
      if (next?.type === 'tool-result') {
        result.push({ part: current, resultPart: next });
        i++;
      } else {
        result.push({ part: current, resultPart: undefined });
      }
    } else {
      result.push({ part: current, resultPart: undefined });
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
  () => [props.parts, props.task.thinkingMessage?.length ?? 0] as const,
  () => {
    nextTick(() => thinkingScrollHandler.fn());
  },
  { flush: 'post' },
);

watch(
  () => props.task.outputContent?.length ?? 0,
  () => {
    outputScrollHandler.fn();
  },
  { flush: 'post' },
);

onUnmounted(() => {
  thinkingScrollHandler.cleanup();
  outputScrollHandler.cleanup();
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

    <!-- 思考过程（可折叠，类似聊天助手的思考区域） -->
    <div
      v-if="hasThinking || isActive"
      class="thinking-block"
      :class="{ 'is-expanded': thinkingExpanded }"
    >
      <button class="thinking-toggle" @click="thinkingExpanded = !thinkingExpanded">
        <i class="pi" :class="thinkingExpanded ? 'pi-chevron-down' : 'pi-chevron-right'" />
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
            item.resultPart?.text,
            item.resultPart?.toolResultTone,
            task.status,
          ]"
          class="stream-part-wrapper"
        >
          <StreamChunkSeparator
            v-if="item.part.type === 'chunk-separator'"
            :chunk-info="item.part.chunkInfo || ''"
          />
          <StreamStateTransition
            v-else-if="item.part.type === 'state-transition'"
            :from-status="item.part.fromStatus || ''"
            :to-status="item.part.toStatus || ''"
          />
          <StreamToolCall
            v-else-if="item.part.type === 'tool-call'"
            :part="item.part"
            :task="task"
            :result-part="item.resultPart"
          />
          <p v-else class="thinking-text">{{ item.part.text }}</p>
        </div>
        <span v-if="isThinkingActive" class="stream-cursor" />
      </div>

      <!-- 折叠：预览 -->
      <p v-else class="thinking-preview">
        {{ task.thinkingMessage?.slice(-120)?.trim() || '' }}
      </p>
    </div>

    <!-- 输出内容（独立区域，始终可见） -->
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

/* ── 思考过程块（类似聊天助手） ── */
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

.thinking-text {
  font-size: 0.75rem;
  color: rgba(253, 253, 255, 0.45);
  line-height: 1.6;
  margin: 4px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-style: italic;
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

/* ── 输出内容块（独立、始终可见） ── */
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

/* ── 光标 ── */
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
    opacity: 0;
  }
}
</style>
