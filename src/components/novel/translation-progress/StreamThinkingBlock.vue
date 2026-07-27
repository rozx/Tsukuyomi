<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import { useStreamVisibility } from 'src/composables/translation-progress/useStreamVisibility';
import StreamPart from './StreamPart.vue';

// 思考过程区块（可折叠）：合并面板中的上半段，只负责渲染。
// 滚动容器与自动滚动统一由父级 TaskStream 的 .stream-panel 承担。
const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
}>();

const thinkingExpanded = ref(true);

const { showThinking, isThinkingActive } = useStreamVisibility(() => props.task);

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
        result.push({
          part: current,
          resultPart: undefined,
          resultText: undefined,
          resultTone: undefined,
        });
      }
    } else {
      result.push({
        part: current,
        resultPart: undefined,
        resultText: undefined,
        resultTone: undefined,
      });
    }
  }
  return result;
});
</script>

<template>
  <div v-if="showThinking" class="thinking-block" :class="{ 'is-expanded': thinkingExpanded }">
    <button class="thinking-toggle" @click="thinkingExpanded = !thinkingExpanded">
      <i class="pi" :class="thinkingChevron" />
      <span class="thinking-toggle-label">思考过程</span>
      <i v-if="isThinkingActive" class="pi pi-spin pi-spinner thinking-spinner" />
    </button>

    <!-- 展开：完整内容 -->
    <!-- v-memo 必须和 v-for 在同一元素上，因此用一个 display:contents 包裹层做 memo 容器，
         避免历史片段在流式追加时反复 diff，仅最后一个 content 片段会因 text 变化而刷新 -->
    <div v-if="thinkingExpanded" class="thinking-content">
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
