<script setup lang="ts">
/**
 * 代理 / 抓取方式下拉选项的通用展示（名称 + 可选描述），供代理设置与网站映射共用。
 */
defineProps<{ name: string; description?: string | undefined }>();
</script>

<template>
  <div class="flex flex-col">
    <span class="text-sm">{{ name }}</span>
    <span v-if="description" class="text-xs text-moon/60">{{ description }}</span>
  </div>
</template>
