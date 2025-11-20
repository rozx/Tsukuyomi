<script setup lang="ts">
import { computed } from 'vue';
import type { Paragraph } from 'src/types/novel';

const props = defineProps<{
  paragraph: Paragraph;
}>();

const hasContent = computed(() => {
  return props.paragraph.text?.trim().length > 0;
});
</script>

<template>
  <div class="paragraph-card" :class="{ 'has-content': hasContent }">
    <span v-if="hasContent" class="paragraph-icon">¶</span>
    <div class="paragraph-content">
      <p class="paragraph-text">{{ paragraph.text }}</p>
    </div>
  </div>
</template>

<style scoped>
/* 段落卡片 */
.paragraph-card {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
}

.paragraph-icon {
  position: absolute;
  top: 0.75rem;
  left: 0.75rem;
  font-size: 1rem;
  color: var(--moon-opacity-40);
  opacity: 0;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  z-index: 1;
}

.paragraph-card.has-content:hover .paragraph-icon {
  opacity: 1;
  color: var(--primary-opacity-70);
  transform: translateY(-2px);
}

.paragraph-content {
  width: 100%;
}

.paragraph-text {
  margin: 0;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>

