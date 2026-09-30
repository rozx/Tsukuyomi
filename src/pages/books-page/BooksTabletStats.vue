<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

/**
 * 平板书库详情统计条（卷数 / 章节 / 字数 / 上次编辑 / 标签）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import Skeleton from 'primevue/skeleton';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';

const t = injectBooksTabletPage();

const book = computed(() => t.selectedBook.value);
const volumeCount = computed(() => book.value?.volumes?.length ?? 0);
const chapterCount = computed(() => (book.value ? t.ctx.getTotalChapters(book.value) : 0));
const tagCount = computed(() => book.value?.tags?.length ?? 0);
const lastEdited = computed(() => (book.value ? t.ctx.formatDate(book.value.lastEdited) : ''));
const isLoadingCharCount = computed(() =>
  book.value ? t.ctx.isLoadingCharCount(book.value) : false,
);
const wordCount = computed(() =>
  book.value ? t.ctx.formatWordCount(t.ctx.getTotalWords(book.value)) : '',
);
</script>

<template>
  <div v-if="book" class="tl-stats">
    <div class="tl-stat">
      <div class="tl-stat-value">{{ volumeCount }}</div>
      <div class="tl-stat-label">{{ i18nT('libraryUi.volumes') }}</div>
    </div>
    <div class="tl-stat">
      <div class="tl-stat-value">{{ chapterCount }}</div>
      <div class="tl-stat-label">{{ i18nT('libraryUi.chapters') }}</div>
    </div>
    <div class="tl-stat">
      <div class="tl-stat-value">
        <template v-if="isLoadingCharCount"><Skeleton width="48px" height="16px" /></template>
        <template v-else>{{ wordCount }}</template>
      </div>
      <div class="tl-stat-label">{{ i18nT('libraryUi.characters') }}</div>
    </div>
    <div class="tl-stat">
      <div class="tl-stat-value">{{ lastEdited }}</div>
      <div class="tl-stat-label">{{ i18nT('libraryUi.lastEdited') }}</div>
    </div>
    <div class="tl-stat tl-stat--last">
      <div class="tl-stat-value">{{ tagCount }}</div>
      <div class="tl-stat-label">{{ i18nT('libraryUi.tags') }}</div>
    </div>
  </div>
</template>
