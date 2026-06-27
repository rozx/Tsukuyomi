<script setup lang="ts">
// 设置卡片别名展示：undefined 时渲染占位 spacer 保持卡片底部对齐，否则渲染别名标签列表。
defineProps<{
  aliases?: string[] | undefined;
}>();
</script>

<template>
  <div v-if="aliases !== undefined" class="mb-auto">
    <span class="text-xs text-moon-100/50 block mb-1.5">别名</span>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="(alias, index) in aliases"
        :key="index"
        class="px-2 py-0.5 rounded bg-accent/20 text-accent-200 text-xs border border-accent/10"
      >
        {{ alias }}
      </span>
      <span v-if="aliases.length === 0" class="text-moon-100/30 text-xs italic">无</span>
    </div>
  </div>
  <div v-else class="mb-auto"></div>
</template>
