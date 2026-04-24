<script setup lang="ts">
import { ref, nextTick } from 'vue';
import Popover from 'primevue/popover';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { getToolCallTone } from 'src/composables/useThinkingFormatter';

const props = defineProps<{
  part: FormattedMessagePart;
  task: AIProcessingTask;
  /** 如果是 tool-result 类型的下一条，合并显示结果 */
  resultPart: FormattedMessagePart | undefined;
}>();

const popoverRef = ref<InstanceType<typeof Popover> | null>(null);
const popoverContent = ref('');

const tone = getToolCallTone(props.task, props.part);

const hasDetails = !!(props.part.toolCallArgs || props.resultPart?.toolResult);

const togglePopover = (event: Event) => {
  if (!hasDetails) return;
  const content = props.resultPart?.toolResult || props.part.toolCallArgs || '';
  popoverContent.value = content;
  nextTick(() => {
    popoverRef.value?.toggle(event);
  });
};
</script>

<template>
  <div
    class="stream-tool-call"
    :class="{ clickable: hasDetails }"
    @click="togglePopover"
  >
    <span class="tool-arrow">&#x25B8;</span>
    <span class="tool-name" :class="tone">{{ part.toolName }}</span>
    <template v-if="resultPart">
      <span class="tool-separator">&rarr;</span>
      <span class="tool-result">{{ resultPart.toolName }}</span>
    </template>
    <template v-else-if="tone === 'running'">
      <span class="tool-spinner" />
    </template>
  </div>

  <Popover ref="popoverRef" class="tool-detail-popover" :dismissable="true">
    <div class="tool-detail-content">
      <pre class="tool-detail-pre">{{ popoverContent }}</pre>
    </div>
  </Popover>
</template>

<style scoped>
.stream-tool-call {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  font-size: 0.75rem;
  overflow: hidden;
}

.stream-tool-call.clickable {
  cursor: pointer;
  border-radius: 4px;
  padding: 3px 6px;
  margin: 0 -6px;
  transition: background 0.12s;
}

.stream-tool-call.clickable:hover {
  background: var(--white-opacity-5);
}

.tool-arrow {
  color: var(--moon-opacity-40);
  font-size: 0.5625rem;
  flex-shrink: 0;
}

.tool-name {
  font-family: var(--font-mono, monospace);
  font-weight: 500;
  font-size: 0.72rem;
  flex-shrink: 0;
}

.tool-name.running {
  color: #6c8cff;
}

.tool-name.success {
  color: #4ade80;
}

.tool-name.warning {
  color: #f59e0b;
}

.tool-name.error {
  color: #ef4444;
}

.tool-name.cancelled {
  color: rgba(253, 253, 255, 0.35);
}

.tool-separator {
  color: var(--moon-opacity-30);
  font-size: 0.6875rem;
  flex-shrink: 0;
}

.tool-result {
  font-size: 0.72rem;
  color: var(--moon-opacity-50);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-spinner {
  display: inline-block;
  width: 10px;
  height: 10px;
  border: 1.5px solid rgba(108, 140, 255, 0.2);
  border-top-color: #6c8cff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
  position: relative;
  top: 1px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

:deep(.tool-detail-popover .p-popover-content) {
  padding: 0;
}

.tool-detail-content {
  max-width: min(70vw, 500px);
  max-height: min(65vh, 400px);
  overflow: auto;
  padding: 0.75rem;
}

.tool-detail-pre {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  color: var(--moon-opacity-80);
  font-family: var(--font-mono, monospace);
  font-size: 0.75rem;
  line-height: 1.45;
}
</style>
