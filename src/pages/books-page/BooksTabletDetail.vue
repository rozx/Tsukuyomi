<script setup lang="ts">
/**
 * 平板书库详情右侧（空态 + Hero + 统计条 + 章节树）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';
import BooksTabletHero from './BooksTabletHero.vue';
import BooksTabletStats from './BooksTabletStats.vue';
import BooksTabletChapterTree from './BooksTabletChapterTree.vue';

const t = injectBooksTabletPage();
const hasBook = computed(() => t.selectedBook.value !== null);
</script>

<template>
  <section class="tl-detail">
    <div v-if="!hasBook" class="tl-detail-empty">
      <i class="pi pi-book" aria-hidden="true" />
      <div class="tl-detail-empty-title">选择一本书查看详情</div>
      <div class="tl-detail-empty-sub">或从左上角添加新书</div>
    </div>
    <div v-else class="tl-detail-scroll">
      <BooksTabletHero />
      <BooksTabletStats />
      <BooksTabletChapterTree />
    </div>
  </section>
</template>
