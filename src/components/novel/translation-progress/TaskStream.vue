<script setup lang="ts">
import { computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';
import type { FormattedMessagePart } from 'src/composables/useThinkingFormatter';
import StreamThinkingBlock from './StreamThinkingBlock.vue';
import StreamOutputBlock from './StreamOutputBlock.vue';

const props = defineProps<{
  task: AIProcessingTask;
  parts: FormattedMessagePart[];
  autoScroll: boolean;
}>();

const emit = defineEmits<{
  toggleAutoScroll: [];
}>();

const isComplete = computed(() => props.task.status === 'end');
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

    <!-- 思考过程块（可折叠） -->
    <StreamThinkingBlock :task="task" :parts="parts" :auto-scroll="autoScroll" />

    <!-- 输出内容块（独立、始终可见） -->
    <StreamOutputBlock :task="task" :auto-scroll="autoScroll" />
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
</style>
