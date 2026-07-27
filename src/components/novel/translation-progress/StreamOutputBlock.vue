<script setup lang="ts">
import type { AIProcessingTask } from 'src/stores/ai-processing';
import { useStreamVisibility } from 'src/composables/translation-progress/useStreamVisibility';

// 输出内容区块：合并面板中的下半段，只负责渲染。
// 滚动容器与自动滚动统一由父级 TaskStream 的 .stream-panel 承担。
const props = defineProps<{
  task: AIProcessingTask;
}>();

const { hasOutput, isOutputActive } = useStreamVisibility(() => props.task);
</script>

<template>
  <div v-if="hasOutput" class="output-block">
    <div class="output-content">
      <pre class="output-text">{{ task.outputContent }}</pre>
      <span v-if="isOutputActive" class="stream-cursor output-cursor" />
    </div>
  </div>
</template>

<style scoped>
/* 不再包一层框：与思考过程的区分完全交给字体（正体 / 更大 / 更亮） */
.output-block {
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-top: 10px;
}

.output-content {
  overflow-wrap: break-word;
  word-break: break-word;
}

/* 与思考过程（0.75rem / 斜体 / 45% 灰）形成字体反差：正体、更大、更亮 */
.output-text {
  font-size: 0.85rem;
  line-height: 1.75;
  color: rgba(253, 253, 255, 0.92);
  font-style: normal;
  font-weight: 450;
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
