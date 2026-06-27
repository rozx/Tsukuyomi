<script setup lang="ts">
import Button from 'primevue/button';
import type { Chapter, Novel } from 'src/models/novel';
import { getChapterDisplayTitle, formatWordCount } from 'src/utils';

// 默认模式章节头部：标题 + 编辑按钮 + 段落/字数统计 + 发布/编辑时间 + 原文链接。
defineProps<{
  chapter: Chapter;
  book: Novel | null;
  paragraphCount: number;
  charCount: number;
}>();

defineEmits<{
  'open-edit-chapter-dialog': [chapter: Chapter];
}>();
</script>

<template>
  <div class="chapter-header">
    <div class="flex items-center gap-2">
      <h1 class="chapter-title flex-1">
        {{ getChapterDisplayTitle(chapter, book || undefined) }}
      </h1>
      <Button
        icon="pi pi-pencil"
        class="p-button-text p-button-sm p-button-rounded"
        size="small"
        title="编辑章节标题"
        @click="$emit('open-edit-chapter-dialog', chapter)"
      />
    </div>
    <div class="chapter-stats">
      <div class="chapter-stat-item">
        <i class="pi pi-list chapter-stat-icon"></i>
        <span class="chapter-stat-value">{{ paragraphCount }}</span>
        <span class="chapter-stat-label">段落</span>
      </div>
      <span class="chapter-stat-separator">|</span>
      <div class="chapter-stat-item">
        <i class="pi pi-align-left chapter-stat-icon"></i>
        <span class="chapter-stat-value">{{ formatWordCount(charCount) }}</span>
      </div>
    </div>
    <div v-if="chapter.lastUpdated" class="chapter-meta">
      <i class="pi pi-clock chapter-meta-icon"></i>
      <span class="chapter-meta-text"
        >发布于: {{ new Date(chapter.lastUpdated).toLocaleString('zh-CN') }}</span
      >
    </div>
    <div v-if="chapter.lastEdited" class="chapter-meta">
      <i class="pi pi-clock chapter-meta-icon"></i>
      <span class="chapter-meta-text"
        >本地最后编辑: {{ new Date(chapter.lastEdited).toLocaleString('zh-CN') }}</span
      >
    </div>
    <a
      v-if="chapter.webUrl"
      :href="chapter.webUrl"
      target="_blank"
      rel="noopener noreferrer"
      class="chapter-web-url"
    >
      <i class="pi pi-external-link"></i>
      <span>查看原文</span>
    </a>
  </div>
</template>
