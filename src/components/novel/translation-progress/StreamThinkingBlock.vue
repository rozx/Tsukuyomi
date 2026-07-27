<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import { useStreamVisibility } from 'src/composables/translation-progress/useStreamVisibility';
import StreamPart from './StreamPart.vue';

// 实时日志正文：思考、工具调用、输出内容按真实先后顺序渲染在同一条时间线上。
// 滚动容器与自动滚动统一由父级 TaskStream 的 .stream-panel 承担。
const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
}>();

const thinkingExpanded = ref(true);

const { showPanel, isActive, hasOutput } = useStreamVisibility(() => props.task);

const thinkingChevron = computed(() =>
  thinkingExpanded.value ? 'pi-chevron-down' : 'pi-chevron-right',
);
const thinkingPreview = computed(() => props.task.thinkingMessage?.slice(-120)?.trim() || '');

/**
 * 时间线片段：合并连续的 tool-call + tool-result；
 * 历史任务（模式标记出现之前产生的数据）没有输出片段，把 outputContent 补在末尾。
 */
const mergedParts = computed(() => {
  const result: Array<{
    part: FormattedMessagePart;
    resultPart: FormattedMessagePart | undefined;
    resultText: string | undefined;
    resultTone: string | undefined;
  }> = [];
  const push = (part: FormattedMessagePart, resultPart?: FormattedMessagePart) => {
    result.push({
      part,
      resultPart,
      resultText: resultPart?.text,
      resultTone: resultPart?.toolResultTone,
    });
  };

  const src = props.parts;
  for (let i = 0; i < src.length; i++) {
    const current = src[i]!;
    if (current.type === 'tool-result') continue;
    if (current.type === 'tool-call' && src[i + 1]?.type === 'tool-result') {
      push(current, src[i + 1]);
      i++;
      continue;
    }
    push(current);
  }

  const outputContent = props.task.outputContent?.trim();
  if (outputContent && !src.some((p) => p.mode === 'output')) {
    push({ type: 'content', text: outputContent, mode: 'output' });
  }
  return result;
});

// 折叠时只保留输出内容（相当于「只看译文」）
const visibleParts = computed(() =>
  thinkingExpanded.value ? mergedParts.value : mergedParts.value.filter((i) => i.part.mode === 'output'),
);

// 折叠且尚无输出时，用思考尾巴给个两行预览，避免整块空白
const showPreview = computed(() => !thinkingExpanded.value && !hasOutput.value);

// 光标跟随当前正在流式输出的内容类型变色
const cursorIsOutput = computed(
  () => mergedParts.value[mergedParts.value.length - 1]?.part.mode === 'output',
);
</script>

<template>
  <div v-if="showPanel" class="thinking-block" :class="{ 'is-expanded': thinkingExpanded }">
    <button class="thinking-toggle" @click="thinkingExpanded = !thinkingExpanded">
      <i class="pi" :class="thinkingChevron" />
      <span class="thinking-toggle-label">思考过程</span>
      <i v-if="isActive" class="pi pi-spin pi-spinner thinking-spinner" />
    </button>

    <!-- v-memo 必须和 v-for 在同一元素上，因此用一个 display:contents 包裹层做 memo 容器，
         避免历史片段在流式追加时反复 diff，仅最后一个片段会因 text 变化而刷新 -->
    <div class="thinking-content">
      <div
        v-for="(item, idx) in visibleParts"
        :key="idx"
        v-memo="[
          item.part.type,
          item.part.mode,
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
        :class="{ 'is-output': item.part.mode === 'output' }"
      >
        <StreamPart :part="item.part" :result-part="item.resultPart" :task="task" />
      </div>

      <p v-if="showPreview" class="thinking-preview">{{ thinkingPreview }}</p>

      <span v-if="isActive" class="stream-cursor" :class="{ 'is-output': cursorIsOutput }" />
    </div>
  </div>
</template>

<style scoped>
.thinking-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 标签吸顶：面板滚动时仍能看出当前在读哪一段 */
.thinking-toggle {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  border: none;
  background: var(--stream-label-bg, rgba(22, 22, 27, 0.92));
  backdrop-filter: blur(6px);
  cursor: pointer;
  font-family: inherit;
  color: var(--moon-opacity-60);
  font-size: 0.6875rem;
  padding: 8px 0 6px;
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
  margin-top: 2px;
  overflow-wrap: break-word;
  word-break: break-word;
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

.stream-cursor.is-output {
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
