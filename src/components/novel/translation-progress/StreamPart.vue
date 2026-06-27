<script setup lang="ts">
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import StreamToolCall from './StreamToolCall.vue';
import StreamChunkSeparator from './StreamChunkSeparator.vue';
import StreamStateTransition from './StreamStateTransition.vue';

// 单个流式片段的渲染分派：chunk-separator / state-transition / tool-call / 文本。
// 把 v-for 内部的四路 v-if 收敛到叶子组件，降低 TaskStream 模板圈复杂度。
defineProps<{
  part: FormattedMessagePart;
  resultPart: FormattedMessagePart | undefined;
  task: AIProcessingTask;
}>();
</script>

<template>
  <StreamChunkSeparator
    v-if="part.type === 'chunk-separator'"
    :chunk-info="part.chunkInfo || ''"
  />
  <StreamStateTransition
    v-else-if="part.type === 'state-transition'"
    :from-status="part.fromStatus || ''"
    :to-status="part.toStatus || ''"
  />
  <StreamToolCall
    v-else-if="part.type === 'tool-call'"
    :part="part"
    :task="task"
    :result-part="resultPart"
  />
  <p v-else class="thinking-text">{{ part.text }}</p>
</template>

<style scoped>
.thinking-text {
  font-size: 0.75rem;
  color: rgba(253, 253, 255, 0.45);
  line-height: 1.6;
  margin: 4px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-style: italic;
}
</style>
