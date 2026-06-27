<script setup lang="ts">
import type { ComponentPublicInstance } from 'vue';
import PreviewParagraphItem from 'src/components/novel/PreviewParagraphItem.vue';
import ChapterEmptyState from 'src/components/novel/ChapterEmptyState.vue';
import ChapterNavigation from 'src/components/novel/ChapterNavigation.vue';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import { formatWordCount } from 'src/utils';

// 预览模式整段视图：标题/统计 + 虚拟列表 + 空状态 + 导航。
// 从 ChapterContentPanel 拆出以降低父模板圈复杂度；listStart / header 通过回调
// 写回父级 ref，保持 scrollMargin 测量与 header ResizeObserver 行为不变。
defineProps<{
  chapter: Chapter | null;
  title: string;
  hasParagraphs: boolean;
  translatedCharCount: number;
  paragraphs: Paragraph[];
  virtualRows: Array<{ index: number }>;
  spacerSize: number;
  blockStart: number;
  getTranslationText: (paragraph: Paragraph) => string;
  measureElement: (el: Element | ComponentPublicInstance | null) => void;
  registerListStart: (el: Element | ComponentPublicInstance | null) => void;
  registerHeader: (el: Element | ComponentPublicInstance | null) => void;
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  isSmallScreen: boolean;
  book: Novel | null;
}>();

defineEmits<{
  navigate: [chapter: Chapter];
  'navigate-list': [];
}>();

const isUntranslated = (paragraph: Paragraph, text: string) =>
  !text && paragraph.text.trim().length > 0;
const paragraphAt = (paragraphs: Paragraph[], index: number) => paragraphs[index]!;
</script>

<template>
  <div class="translation-preview-container">
    <!-- 章节标题 -->
    <div v-if="chapter" :ref="registerHeader" class="preview-chapter-header">
      <h1 class="preview-chapter-title">{{ title }}</h1>
      <!-- 翻译统计 -->
      <div v-if="hasParagraphs" class="preview-chapter-stats">
        <div class="preview-stat-item">
          <i class="pi pi-align-left preview-stat-icon"></i>
          <span class="preview-stat-value">{{ formatWordCount(translatedCharCount) }}</span>
          <span class="preview-stat-label">已翻译</span>
        </div>
      </div>
    </div>
    <div v-if="hasParagraphs" class="paragraphs-container">
      <div :ref="registerListStart" class="vlist-spacer" :style="{ height: `${spacerSize}px` }">
        <div class="vlist-window" :style="{ transform: `translateY(${blockStart}px)` }">
          <div
            v-for="row in virtualRows"
            :key="paragraphAt(paragraphs, row.index).id"
            :ref="measureElement"
            :data-index="row.index"
            class="translation-preview-paragraph"
            :class="{
              'untranslated-paragraph': isUntranslated(
                paragraphAt(paragraphs, row.index),
                getTranslationText(paragraphAt(paragraphs, row.index)),
              ),
            }"
          >
            <PreviewParagraphItem
              :paragraph="paragraphAt(paragraphs, row.index)"
              :translation-text="getTranslationText(paragraphAt(paragraphs, row.index))"
            />
          </div>
        </div>
      </div>
    </div>
    <ChapterEmptyState v-else />

    <!-- 章节导航按钮（预览模式） -->
    <ChapterNavigation
      :prev-chapter="prevChapter"
      :next-chapter="nextChapter"
      :is-small-screen="isSmallScreen"
      :book="book"
      @navigate="(chapter: Chapter) => $emit('navigate', chapter)"
      @navigate-list="$emit('navigate-list')"
    />
  </div>
</template>
