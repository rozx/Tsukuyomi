<script setup lang="ts">
import { computed } from 'vue';
import type { AIProcessingTask } from 'src/stores/ai-processing';

const props = defineProps<{
  task: AIProcessingTask;
  showOnlyCurrentChapter: boolean;
}>();

const emit = defineEmits<{
  stop: [];
  clear: [];
  toggleChapterFilter: [];
}>();

const isActive = computed(() =>
  props.task.status === 'thinking' || props.task.status === 'processing',
);
</script>

<template>
  <div class="action-bar">
    <button
      class="action-btn filter-btn"
      :class="{ enabled: showOnlyCurrentChapter }"
      @click="emit('toggleChapterFilter')"
    >
      <i class="pi" :class="showOnlyCurrentChapter ? 'pi-filter' : 'pi-filter-slash'" />
      {{ showOnlyCurrentChapter ? '仅本章' : '全部章节' }}
    </button>
    <button v-if="isActive" class="action-btn stop-btn" @click="emit('stop')">
      <i class="pi pi-stop-circle" />
      停止
    </button>
    <button v-else class="action-btn clear-btn" @click="emit('clear')">
      <i class="pi pi-trash" />
      清除已完成
    </button>
  </div>
</template>

<style scoped>
.action-bar {
  padding: 10px 16px;
  border-top: 1px solid var(--white-opacity-5);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.action-btn {
  font-family: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 6px 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(253, 253, 255, 0.5);
  cursor: pointer;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.action-btn i {
  font-size: 0.75rem;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.1);
  color: rgba(253, 253, 255, 0.7);
}

.filter-btn.enabled {
  color: #6c8cff;
  background: rgba(108, 140, 255, 0.1);
  border-color: rgba(108, 140, 255, 0.2);
}

.filter-btn.enabled:hover {
  background: rgba(108, 140, 255, 0.15);
}

.stop-btn {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.2);
}

.stop-btn:hover {
  background: rgba(239, 68, 68, 0.18);
  border-color: rgba(239, 68, 68, 0.35);
  color: #ef4444;
}

.clear-btn:hover {
  color: rgba(253, 253, 255, 0.6);
}
</style>
