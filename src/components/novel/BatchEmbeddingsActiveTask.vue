<script setup lang="ts">
import type { EmbeddingQueueCurrentTask } from 'src/services/embedding-queue';

// 队列当前任务提示：跨书处理时高亮并显示书名。
defineProps<{
  activeTask: EmbeddingQueueCurrentTask;
  isProcessingOtherBook: boolean;
  kindLabel: string;
  bookTitle: string;
}>();
</script>

<template>
  <div
    :class="[
      'flex items-start gap-2 p-2 rounded text-xs min-w-0',
      isProcessingOtherBook
        ? 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
        : 'bg-primary-500/10 border border-primary-500/20 text-primary-300',
    ]"
  >
    <i class="pi pi-spin pi-spinner shrink-0 mt-0.5"></i>
    <div class="flex-1 min-w-0">
      <div v-if="isProcessingOtherBook">
        <div class="truncate">其它书籍 · {{ kindLabel }} ×{{ activeTask.itemCount }}</div>
        <div class="truncate font-medium mt-0.5">{{ bookTitle }}</div>
      </div>
      <div v-else class="truncate">
        本书 {{ kindLabel }} ×{{ activeTask.itemCount }}
      </div>
    </div>
  </div>
</template>
