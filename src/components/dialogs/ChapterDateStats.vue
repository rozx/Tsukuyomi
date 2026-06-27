<template>
  <div v-if="hasAnyDate" class="p-3 bg-white/5 rounded-lg border border-white/10 mt-2">
    <div class="flex flex-wrap gap-x-6 gap-y-3">
      <div v-if="lastUpdated" class="flex flex-col gap-1">
        <span
          class="text-[10px] text-moon/50 uppercase tracking-wider flex items-center gap-1 font-medium"
          ><i class="pi pi-globe text-[10px]"></i> 远程更新</span
        >
        <span class="text-xs text-moon/90 font-mono">{{
          new Date(lastUpdated).toLocaleString('zh-CN')
        }}</span>
      </div>
      <div v-if="lastEdited" class="flex flex-col gap-1">
        <span
          class="text-[10px] text-moon/50 uppercase tracking-wider flex items-center gap-1 font-medium"
          ><i class="pi pi-pencil text-[10px]"></i> 本地编辑</span
        >
        <span class="text-xs text-moon/90 font-mono">{{
          new Date(lastEdited).toLocaleString('zh-CN')
        }}</span>
      </div>
      <div v-if="createdAt" class="flex flex-col gap-1">
        <span
          class="text-[10px] text-moon/50 uppercase tracking-wider flex items-center gap-1 font-medium"
          ><i class="pi pi-calendar-plus text-[10px]"></i> 创建时间</span
        >
        <span class="text-xs text-moon/90 font-mono">{{
          new Date(createdAt).toLocaleString('zh-CN')
        }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  lastUpdated?: Date | undefined;
  lastEdited?: Date | undefined;
  createdAt?: Date | undefined;
}>();

// 至少有一个日期才渲染整块统计信息
const hasAnyDate = computed(() => !!props.lastEdited || !!props.createdAt || !!props.lastUpdated);
</script>
