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
