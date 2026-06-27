<script setup lang="ts">
/**
 * 平板首页 Hero 卡片的标题 + 作者行。
 * 活跃任务卡与继续阅读卡共用此片段，避免在 IndexTabletHero 内重复同一段标记与样式。
 */
defineProps<{
  title: string;
  author?: string | undefined;
}>();
</script>

<template>
  <div class="th-hero-card-title">{{ title }}</div>
  <div v-if="author" class="th-hero-card-meta">{{ author }}</div>
</template>

<style scoped>
.th-hero-card-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.th-hero-card-meta {
  font-size: 12px;
  color: var(--moon-50-opacity-60);
}
</style>
