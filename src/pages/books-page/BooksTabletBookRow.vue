<script setup lang="ts">
/**
 * 平板书库列表中的单行书籍（封面 + 标题 / 作者 / 字数章数 + 收藏星）。
 * 从 BooksPageTablet 抽出以降低列表模板复杂度。样式由 BooksPageTablet.vue 提供（tl- 前缀唯一）。
 */
import { computed } from 'vue';
import Skeleton from 'primevue/skeleton';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';
import type { Novel } from 'src/models/novel';

const props = defineProps<{ book: Novel }>();
const t = injectBooksTabletPage();

const isSelected = computed(() => props.book.id === t.selectedBook.value?.id);
const wordCountText = computed(() =>
  t.ctx.isLoadingCharCount(props.book)
    ? null
    : `${t.ctx.formatWordCount(t.ctx.getTotalWords(props.book))} 字`,
);
const onClick = () => t.selectBook(props.book);
const onDblClick = () => t.ctx.navigateToBookDetails(props.book);
</script>

<template>
  <button
    type="button"
    class="tl-list-row"
    :class="{ 'tl-list-row--active': isSelected }"
    @click="onClick"
    @dblclick="onDblClick"
  >
    <div class="tl-list-cover">
      <img :src="t.ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
    </div>
    <div class="tl-list-body">
      <div class="tl-list-title">{{ book.title }}</div>
      <div class="tl-list-author">{{ book.author || '未知作者' }}</div>
      <div class="tl-list-meta">
        <span v-if="wordCountText === null"><Skeleton width="42px" height="10px" /></span>
        <span v-else>{{ wordCountText }}</span>
        <span class="tl-dot">·</span>
        <span>{{ t.ctx.getTotalChapters(book) }} 章</span>
      </div>
    </div>
    <i v-if="book.starred" class="pi pi-star-fill tl-list-star" aria-hidden="true" />
  </button>
</template>
