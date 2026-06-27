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

<!-- 预览段落内文本样式抽到共享文件，避免与 PreviewParagraphItem 重复声明 -->
<style scoped src="./preview-paragraph.css"></style>

<style scoped>
/* 翻译预览模式样式。
 * 注：这些样式从 ChapterContentPanel.vue 迁移而来 —— 该面板把预览视图抽成本组件后，
 * 其 scoped 样式无法穿透到子组件内部嵌套元素（仅子组件根元素继承父级 scope），
 * 导致 .preview-chapter-header 等丢失样式。样式应与其消费的模板同处一个组件作用域。 */
.translation-preview-container {
  width: 100%;
  min-width: 0;
  max-width: 56rem;
  margin: 0 auto;
  /* 与 .chapter-content-container 对齐，切换编辑/预览模式不产生 8px 宽度跳动。 */
  padding: 0 0.5rem;
  box-sizing: border-box;
}

.preview-chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.preview-chapter-title {
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.25;
}

.preview-chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.preview-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.preview-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.preview-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.preview-stat-label {
  color: var(--moon-opacity-70);
}

.translation-preview-paragraph {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
  /* 虚拟滚动已接管视口外段落的渲染，无需再用 content-visibility 占位 */
}

.untranslated-paragraph {
  background-color: var(--moon-opacity-5);
  border-left: 3px solid var(--orange-500);
  padding-left: calc(1.25rem - 3px);
}

@media (max-width: 768px) {
  .translation-preview-container {
    /*
     * 仅保留安全区补偿，避免右侧额外偏移导致导航与正文对齐线不一致。
     */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
</style>
