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

<style scoped>
/* 章节标题区域。
 * 注：这些样式从 ChapterContentPanel.vue 迁移而来 —— 该面板把头部抽成本组件后，
 * 其 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .chapter-stats 等丢失 flex 布局。样式应与其消费的模板同处一个组件作用域。 */
.chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.chapter-title {
  /* 设计系统：章节标题用显示字体（Noto Serif JP）营造阅读仪式感 */
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.25;
}

.chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.chapter-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.chapter-stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.chapter-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.chapter-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.chapter-stat-label {
  color: var(--moon-opacity-70);
}

.chapter-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--moon-opacity-70);
  font-size: 0.875rem;
}

.chapter-meta-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.chapter-meta-text {
  color: var(--moon-opacity-70);
}

.chapter-web-url {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  width: fit-content;
  color: var(--primary-opacity-90);
  text-decoration: underline;
  text-decoration-color: var(--primary-opacity-50);
  text-underline-offset: 2px;
  background: var(--primary-opacity-10);
  border: 1px solid var(--primary-opacity-30);
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover {
  color: var(--primary-opacity-100);
  text-decoration-color: var(--primary-opacity-80);
  background: var(--primary-opacity-15);
  border-color: var(--primary-opacity-50);
  transform: translateY(-1px);
}

.chapter-web-url .pi {
  font-size: 0.75rem;
  color: var(--primary-opacity-85);
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover .pi {
  color: var(--primary-opacity-100);
}
</style>
