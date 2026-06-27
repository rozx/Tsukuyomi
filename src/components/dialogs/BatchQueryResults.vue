<script setup lang="ts">
import type { TestResultItem, TestTarget } from './batch-query-types';

defineProps<{
  results: TestResultItem[];
  targetLabel: string;
  lastTarget: TestTarget | null;
}>();

const emit = defineEmits<{
  select: [item: TestResultItem];
}>();
</script>

<template>
  <div class="flex items-center justify-between text-xs text-moon/60">
    <span>
      {{ targetLabel }}查询结果
      <span class="opacity-70">({{ results.length }})</span>
    </span>
    <span class="opacity-70">点击条目{{ lastTarget === 'chapter' ? '跳转章节' : '查看详情' }}</span>
  </div>

  <div
    v-if="results.length === 0"
    class="text-sm text-moon/60 italic py-4 text-center border border-white/5 rounded"
  >
    无匹配结果
  </div>

  <ul v-else class="flex flex-col gap-2 m-0 p-0 list-none min-w-0">
    <li
      v-for="(item, idx) in results"
      :key="idx"
      role="button"
      tabindex="0"
      class="flex flex-col gap-1 p-3 bg-white/5 rounded border border-white/5 result-row cursor-pointer transition-colors min-w-0 overflow-hidden"
      @click="emit('select', item)"
      @keydown.enter.prevent="emit('select', item)"
      @keydown.space.prevent="emit('select', item)"
    >
      <div class="flex items-center justify-between gap-3 min-w-0">
        <span class="font-medium text-moon-100 truncate min-w-0 flex-1">
          {{ idx + 1 }}. {{ item.title }}
        </span>
        <span class="font-mono text-xs text-primary-400 shrink-0">
          {{ item.score.toFixed(3) }}
        </span>
      </div>
      <div v-if="item.preview" class="text-sm text-moon/70 line-clamp-3 preview-text">
        {{ item.preview }}
      </div>
    </li>
  </ul>
</template>

<style scoped>
.result-row:hover {
  background-color: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.15);
}
.result-row:focus-visible {
  outline: 2px solid var(--primary-400, #a5b4fc);
  outline-offset: 2px;
}
.preview-text {
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>
