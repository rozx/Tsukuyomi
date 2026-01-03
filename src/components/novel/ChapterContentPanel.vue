<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Badge from 'primevue/badge';
import ProgressSpinner from 'primevue/progressspinner';
import ParagraphCard from 'src/components/novel/ParagraphCard.vue';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import { getChapterDisplayTitle, getChapterCharCount, formatWordCount, formatTranslationForDisplay } from 'src/utils';
import type { EditMode } from 'src/composables/book-details/useEditMode';

const props = defineProps<{
  selectedChapter: Chapter | null;
  selectedChapterWithContent: Chapter | null;
  selectedChapterParagraphs: Paragraph[];
  isLoadingChapterContent: boolean;
  editMode: EditMode;
  originalTextEditValue: string;
  translatedCharCount: number;
  book: Novel | null;
  bookId?: string;
  selectedChapterId: string | null;
  translatingParagraphIds: Set<string>;
  polishingParagraphIds: Set<string>;
  proofreadingParagraphIds: Set<string>;
  searchQuery: string;
  selectedParagraphIndex: number | null;
  isKeyboardSelected: boolean;
  isClickSelected: boolean;
  paragraphCardRefs: Map<string, InstanceType<typeof ParagraphCard>>;
}>();

const emit = defineEmits<{
  (e: 'update:originalTextEditValue', value: string): void;
  (e: 'open-edit-chapter-dialog', chapter: Chapter): void;
  (e: 'cancel-original-text-edit'): void;
  (e: 'save-original-text-edit'): void;
  (e: 'update-translation', paragraphId: string, newTranslation: string): void;
  (e: 'retranslate-paragraph', paragraphId: string): void;
  (e: 'polish-paragraph', paragraphId: string): void;
  (e: 'proofread-paragraph', paragraphId: string): void;
  (e: 'select-translation', paragraphId: string, translationId: string): void;
  (e: 'paragraph-click', paragraphId: string): void;
  (e: 'paragraph-edit-start', paragraphId: string): void;
  (e: 'paragraph-edit-stop', paragraphId: string): void;
}>();

// 获取选中章节的统计信息
const selectedChapterStats = computed(() => {
  if (!props.selectedChapterWithContent) return null;

  const paragraphCount = props.selectedChapterParagraphs.length;
  const charCount = getChapterCharCount(props.selectedChapterWithContent);

  return {
    paragraphCount,
    charCount,
  };
});

// 获取段落的选中翻译文本（应用显示层格式化）
const getParagraphTranslationText = (paragraph: Paragraph): string => {
  if (!paragraph.selectedTranslationId || !paragraph.translations) {
    return '';
  }
  const selectedTranslation = paragraph.translations.find(
    (t) => t.id === paragraph.selectedTranslationId,
  );
  const translation = selectedTranslation?.translation || '';
  // 应用显示层格式化（缩进过滤/符号规范化等）
  return formatTranslationForDisplay(
    translation,
    props.book || undefined,
    props.selectedChapterWithContent || undefined,
  );
};

const handleOriginalTextInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:originalTextEditValue', target.value);
};
</script>

<template>
  <div
    v-if="selectedChapter"
    class="chapter-content-container"
    :class="{ 'chapter-content-container--full': editMode === 'original' }"
  >
    <!-- 加载中状态 -->
    <div v-if="isLoadingChapterContent" class="loading-container">
      <ProgressSpinner
        style="width: 3rem; height: 3rem"
        stroke-width="4"
        animation-duration="1s"
      />
      <p class="loading-text">正在加载章节内容...</p>
    </div>

    <!-- 原始文本编辑模式 -->
    <div v-else-if="editMode === 'original'" class="original-text-edit-container">
      <label class="block text-sm font-medium text-moon/90">原始文本</label>
      <Textarea
        :value="originalTextEditValue"
        @input="handleOriginalTextInput"
        :auto-resize="false"
        class="w-full original-text-textarea"
        placeholder="输入原始文本..."
      />
      <div class="flex gap-2 justify-end">
        <Button label="取消" class="p-button-text" @click="emit('cancel-original-text-edit')" />
        <Button label="保存" @click="emit('save-original-text-edit')" />
      </div>
    </div>

    <!-- 翻译预览模式 -->
    <div v-else-if="editMode === 'preview'" class="translation-preview-container">
      <!-- 章节标题 -->
      <div v-if="selectedChapterWithContent || selectedChapter" class="preview-chapter-header">
        <h1 class="preview-chapter-title">
          {{ getChapterDisplayTitle(selectedChapterWithContent || selectedChapter, book || undefined) }}
        </h1>
        <!-- 翻译统计 -->
        <div v-if="selectedChapterParagraphs.length > 0" class="preview-chapter-stats">
          <div class="preview-stat-item">
            <i class="pi pi-align-left preview-stat-icon"></i>
            <span class="preview-stat-value">{{ formatWordCount(translatedCharCount) }}</span>
            <span class="preview-stat-label">已翻译</span>
          </div>
        </div>
      </div>
      <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
        <div
          v-for="paragraph in selectedChapterParagraphs"
          :key="paragraph.id"
          class="translation-preview-paragraph"
          :class="{
            'untranslated-paragraph':
              !getParagraphTranslationText(paragraph) && paragraph.text.trim(),
          }"
        >
          <template v-if="getParagraphTranslationText(paragraph)">
            <p class="translation-text">
              {{ getParagraphTranslationText(paragraph) }}
            </p>
          </template>
          <template v-else-if="paragraph.text.trim()">
            <div class="untranslated-content">
              <Badge value="未翻译" severity="warning" class="untranslated-badge" />
              <p class="original-text">
                {{ paragraph.text }}
              </p>
            </div>
          </template>
        </div>
      </div>
      <div v-else class="empty-chapter-content">
        <i class="pi pi-file empty-icon"></i>
        <p class="empty-text">该章节暂无内容</p>
        <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
      </div>
    </div>

    <!-- 翻译模式（默认） -->
    <template v-else>
      <!-- 章节标题 -->
      <div class="chapter-header">
        <div class="flex items-center gap-2">
          <h1 class="chapter-title flex-1">
            {{ getChapterDisplayTitle(selectedChapterWithContent || selectedChapter, book || undefined) }}
          </h1>
          <Button
            icon="pi pi-pencil"
            class="p-button-text p-button-sm p-button-rounded"
            size="small"
            title="编辑章节标题"
            @click="emit('open-edit-chapter-dialog', selectedChapter)"
          />
        </div>
        <div v-if="selectedChapterStats" class="chapter-stats">
          <div class="chapter-stat-item">
            <i class="pi pi-list chapter-stat-icon"></i>
            <span class="chapter-stat-value">{{ selectedChapterStats.paragraphCount }}</span>
            <span class="chapter-stat-label">段落</span>
          </div>
          <span class="chapter-stat-separator">|</span>
          <div class="chapter-stat-item">
            <i class="pi pi-align-left chapter-stat-icon"></i>
            <span class="chapter-stat-value">{{ formatWordCount(selectedChapterStats.charCount) }}</span>
          </div>
        </div>
        <div v-if="selectedChapter.lastUpdated" class="chapter-meta">
          <i class="pi pi-clock chapter-meta-icon"></i>
          <span class="chapter-meta-text"
            >发布于: {{ new Date(selectedChapter.lastUpdated).toLocaleString('zh-CN') }}</span
          >
        </div>
        <div v-if="selectedChapter.lastEdited" class="chapter-meta">
          <i class="pi pi-clock chapter-meta-icon"></i>
          <span class="chapter-meta-text"
            >本地最后编辑: {{ new Date(selectedChapter.lastEdited).toLocaleString('zh-CN') }}</span
          >
        </div>
        <a
          v-if="selectedChapter.webUrl"
          :href="selectedChapter.webUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="chapter-web-url"
        >
          <i class="pi pi-external-link"></i>
          <span>查看原文</span>
        </a>
      </div>

      <!-- 章节段落列表 -->
      <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
        <div
          v-for="(paragraph, index) in selectedChapterParagraphs"
          :key="paragraph.id"
          class="paragraph-with-line-number"
        >
          <span class="line-number">{{ index + 1 }}</span>
          <ParagraphCard
            :ref="
              (el) => {
                if (el) {
                  paragraphCardRefs.set(paragraph.id, el as InstanceType<typeof ParagraphCard>);
                } else {
                  paragraphCardRefs.delete(paragraph.id);
                }
              }
            "
            :paragraph="paragraph"
            :terminologies="book?.terminologies || []"
            :character-settings="book?.characterSettings || []"
            v-bind="{
              ...(selectedChapterId ? { chapterId: selectedChapterId } : {}),
              ...(bookId ? { bookId: bookId } : {}),
            }"
            :is-translating="translatingParagraphIds.has(paragraph.id)"
            :is-polishing="polishingParagraphIds.has(paragraph.id)"
            :is-proofreading="proofreadingParagraphIds.has(paragraph.id)"
            :search-query="searchQuery"
            :id="`paragraph-${paragraph.id}`"
            :selected="selectedParagraphIndex === index && (isKeyboardSelected || isClickSelected)"
            @update-translation="
              (paragraphId: string, newTranslation: string) => emit('update-translation', paragraphId, newTranslation)
            "
            @retranslate="(paragraphId: string) => emit('retranslate-paragraph', paragraphId)"
            @polish="(paragraphId: string) => emit('polish-paragraph', paragraphId)"
            @proofread="(paragraphId: string) => emit('proofread-paragraph', paragraphId)"
            @select-translation="
              (paragraphId: string, translationId: string) => emit('select-translation', paragraphId, translationId)
            "
            @paragraph-click="(paragraphId: string) => emit('paragraph-click', paragraphId)"
            @paragraph-edit-start="(paragraphId: string) => emit('paragraph-edit-start', paragraphId)"
            @paragraph-edit-stop="(paragraphId: string) => emit('paragraph-edit-stop', paragraphId)"
          />
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-chapter-content">
        <i class="pi pi-file empty-icon"></i>
        <p class="empty-text">该章节暂无内容</p>
        <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 章节内容容器 */
.chapter-content-container {
  max-width: 56rem;
  margin: 0 auto;
}

/* 原始文本编辑模式：占满面板宽度/高度，方便编辑 */
.chapter-content-container--full {
  max-width: none;
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
}

/* 章节标题区域 */
.chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.chapter-content-container .chapter-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
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

/* 段落容器 */
.paragraphs-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 带行号的段落 */
.paragraph-with-line-number {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  position: relative;
  /* 只允许颜色/阴影类过渡，避免 margin/padding 等布局属性过渡导致“滚动抖动” */
  transition:
    color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    background-color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 选中高亮：使用伪元素绘制边框/阴影，避免改变布局尺寸导致滚动“上下跳动” */
.paragraph-with-line-number::before {
  content: '';
  position: absolute;
  inset: -0.5rem;
  border-radius: 8px;
  border: 1px solid transparent;
  box-shadow: 0 0 0 1px transparent;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    border-color 0.15s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.15s cubic-bezier(0.4, 0, 0.2, 1);
}

.paragraph-with-line-number:has(.paragraph-selected)::before {
  opacity: 1;
  border-color: var(--primary-opacity-20);
  box-shadow: 0 0 0 1px var(--primary-opacity-15);
}

.line-number {
  display: inline-block;
  flex-shrink: 0;
  width: 3rem;
  text-align: right;
  font-size: 0.8125rem;
  color: var(--moon-opacity-40);
  font-family: ui-monospace, 'Courier New', monospace;
  padding-top: 1rem;
  padding-right: 0.75rem;
  user-select: none;
  align-self: flex-start;
  line-height: 1.8;
  font-weight: 500;
  /* 确保在选中伪元素之上 */
  position: relative;
  z-index: 1;
}

.paragraph-with-line-number .paragraph-card {
  flex: 1;
  min-width: 0;
  padding-left: 0;
  position: relative;
  z-index: 1; /* 确保在选中伪元素之上 */
}

/* 隐藏 ParagraphCard 中的原始段落符号 */
.paragraph-with-line-number .paragraph-card :deep(.paragraph-icon) {
  display: none !important;
}

/* 原始文本编辑容器 */
.original-text-edit-container {
  padding: 1.5rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.original-text-textarea {
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.8;
  color: var(--moon-opacity-90);
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
}

.original-text-textarea:focus {
  border-color: var(--primary-opacity-50);
  box-shadow: 0 0 0 0.125rem var(--primary-opacity-20);
}

/* 翻译预览容器 */
.translation-preview-container {
  max-width: 56rem;
  margin: 0 auto;
}

.preview-chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.preview-chapter-title {
  font-size: 1.75rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.4;
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
}

.translation-text {
  margin: 0;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.untranslated-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.untranslated-badge {
  align-self: flex-start;
}

.original-text {
  margin: 0;
  color: var(--moon-opacity-70);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
}

.untranslated-paragraph {
  background-color: var(--moon-opacity-5);
  border-left: 3px solid var(--orange-500);
  padding-left: calc(1.25rem - 3px);
}

/* 空章节内容状态 */
.empty-chapter-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  color: var(--moon-opacity-40);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  margin: 0 0 0.5rem 0;
}

.empty-hint {
  margin: 0;
}

/* 加载中状态 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  min-height: 30rem;
  gap: 1.5rem;
}

.loading-text {
  font-size: 1rem;
  color: var(--moon-opacity-70);
  margin: 0;
}
</style>

