<script setup lang="ts">
import Button from 'primevue/button';
import type { Chapter, Novel } from 'src/models/novel';
import { getChapterDisplayTitle } from 'src/utils';

// 章节导航按钮（上一章 / 章节列表 / 下一章）。预览模式与默认模式各用一次。
const props = defineProps<{
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  isSmallScreen: boolean;
  book: Novel | null;
}>();

defineEmits<{
  navigate: [chapter: Chapter];
  'navigate-list': [];
}>();

const prevLabel = (chapter: Chapter | null): string => {
  if (!chapter) return props.isSmallScreen ? '上一章' : '没有上一章';
  return props.isSmallScreen ? '上一章' : getChapterDisplayTitle(chapter, props.book || undefined);
};

const nextLabel = (chapter: Chapter | null): string => {
  if (!chapter) return props.isSmallScreen ? '下一章' : '没有下一章';
  return props.isSmallScreen ? '下一章' : getChapterDisplayTitle(chapter, props.book || undefined);
};

const prevTooltip = (chapter: Chapter | null): string =>
  chapter ? getChapterDisplayTitle(chapter, props.book || undefined) : '没有上一章';
const nextTooltip = (chapter: Chapter | null): string =>
  chapter ? getChapterDisplayTitle(chapter, props.book || undefined) : '没有下一章';
</script>

<template>
  <div class="chapter-navigation">
    <Button
      :disabled="!prevChapter"
      icon="pi pi-chevron-left"
      :label="prevLabel(prevChapter)"
      class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-prev"
      :class="{ 'p-button-disabled': !prevChapter }"
      @click="prevChapter && $emit('navigate', prevChapter)"
      v-tooltip.top="prevTooltip(prevChapter)"
    />
    <Button
      v-if="isSmallScreen"
      icon="pi pi-list"
      label="章节列表"
      class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-list"
      @click="$emit('navigate-list')"
      v-tooltip.top="'返回章节列表'"
    />
    <Button
      :disabled="!nextChapter"
      icon="pi pi-chevron-right"
      iconPos="right"
      :label="nextLabel(nextChapter)"
      class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-next"
      :class="{ 'p-button-disabled': !nextChapter }"
      @click="nextChapter && $emit('navigate', nextChapter)"
      v-tooltip.top="nextTooltip(nextChapter)"
    />
  </div>
</template>

<style scoped>
/* 章节导航按钮样式。
 * 注：这些样式从 ChapterContentPanel.vue 迁移而来 —— 该面板把导航抽成本组件后，
 * 其 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .chapter-nav-btn 等丢失布局。样式应与其消费的模板同处一个组件作用域。 */
.chapter-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--white-opacity-10);
}

.chapter-navigation :deep(.p-button) {
  width: 100%;
  min-width: 0;
}

.chapter-nav-btn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  justify-content: center;
}

.chapter-nav-btn :deep(.p-button-label) {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-nav-btn :deep(.p-button-icon) {
  flex: 0 0 auto;
}

.chapter-nav-prev {
  overflow: hidden;
}

.chapter-nav-prev :deep(.p-button-label) {
  text-align: center;
}

.chapter-nav-list {
  flex: 0 0 auto;
  max-width: none;
  min-width: auto;
}

.chapter-nav-next {
  overflow: hidden;
}

.chapter-nav-next :deep(.p-button-label) {
  text-align: center;
}

@media (max-width: 768px) {
  .chapter-navigation {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    align-items: stretch;
    padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  }

  .chapter-nav-btn {
    width: 100%;
    max-width: none;
    position: relative;
    padding-left: 1.75rem !important;
    padding-right: 1.75rem !important;
  }

  .chapter-nav-btn :deep(.p-button-label) {
    display: block;
    width: 100%;
    max-width: 100% !important;
    text-align: center;
  }

  .chapter-nav-btn :deep(.p-button-icon) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    margin: 0 !important;
  }

  .chapter-nav-prev :deep(.p-button-icon-left),
  .chapter-nav-list :deep(.p-button-icon-left) {
    left: 0.625rem;
  }

  .chapter-nav-next :deep(.p-button-icon-right) {
    right: 0.625rem;
  }
}
</style>
