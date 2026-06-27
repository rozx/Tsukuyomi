<script setup lang="ts">
import Button from 'primevue/button';

// Embedding 空间升级横幅：存在 stale 向量时提示并提供一键重建。
defineProps<{
  chapterStale: number;
  memoryStale: number;
  disabled: boolean;
}>();

defineEmits<{ rebuild: [] }>();
</script>

<template>
  <div
    class="flex flex-col gap-2 p-3 rounded text-xs bg-amber-500/10 border border-amber-500/30 text-amber-200"
  >
    <div class="flex items-start gap-2">
      <i class="pi pi-exclamation-triangle mt-0.5 text-amber-300 shrink-0"></i>
      <div class="flex-1 min-w-0">
        <div class="font-medium text-amber-100">Embedding 空间已升级</div>
        <p class="mt-1 leading-relaxed text-amber-200/90">
          检测到
          <span v-if="chapterStale > 0">{{ chapterStale }} 个章节</span>
          <span v-if="chapterStale > 0 && memoryStale > 0"> / </span>
          <span v-if="memoryStale > 0">{{ memoryStale }} 条记忆</span>
          使用旧版向量,检索时会自动降级(章节搜索暂不可用)。重建后即可恢复语义召回。
        </p>
      </div>
    </div>
    <Button
      label="立即重建"
      size="small"
      severity="warn"
      icon="pi pi-sync"
      class="w-full"
      :disabled="disabled"
      @click="$emit('rebuild')"
    />
  </div>
</template>
