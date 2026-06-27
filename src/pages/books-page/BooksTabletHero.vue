<script setup lang="ts">
/**
 * 平板书库右侧详情 Hero（封面 + 标题 / 别名 / 标签 / 简介 / 操作按钮）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';

const t = injectBooksTabletPage();

const book = computed(() => t.selectedBook.value);
const eyebrow = computed(
  () => `${book.value?.author || '未知作者'} · ${t.ctx.getTotalChapters(book.value!)} 章`,
);
const altTitle = computed(() => book.value?.alternateTitles?.[0] ?? null);
const firstTag = computed(() => book.value?.tags?.[0] || '小说');
const extraTags = computed(() => (book.value?.tags ?? []).slice(1, 6));
const starIcon = computed(() => (book.value?.starred ? 'pi pi-star-fill' : 'pi pi-star'));
const starButtonClass = computed(() => [
  'p-button-outlined',
  book.value?.starred ? '!text-warning' : '',
]);
const starTitle = computed(() => (book.value?.starred ? '取消收藏' : '收藏'));
const continueReading = () => book.value && t.ctx.navigateToBookDetails(book.value);
const editBook = () => book.value && t.ctx.editBook(book.value);
const toggleStar = () => book.value && t.ctx.toggleStar(book.value);
const deleteBook = () => book.value && t.ctx.deleteBook(book.value);
</script>

<template>
  <header v-if="book" class="tl-hero">
    <div class="tl-hero-cover">
      <img :src="t.ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
      <i v-if="book.starred" class="pi pi-star-fill tl-hero-star" aria-hidden="true" />
    </div>
    <div class="tl-hero-body">
      <div class="tl-hero-eyebrow">{{ eyebrow }}</div>
      <h2 class="tl-hero-title">{{ book.title }}</h2>
      <div v-if="altTitle" class="tl-hero-alt">《{{ altTitle }}》</div>

      <div class="tl-hero-badges">
        <span class="tl-badge tl-badge--blue">
          <i class="pi pi-sparkles" /> {{ firstTag }}
        </span>
        <span v-for="tag in extraTags" :key="tag" class="tl-badge">{{ tag }}</span>
        <span v-if="book.starred" class="tl-badge tl-badge--star">
          <i class="pi pi-star-fill" /> 收藏
        </span>
      </div>

      <p v-if="book.description" class="tl-desc">{{ book.description }}</p>

      <div class="tl-hero-actions">
        <Button label="继续翻译" icon="pi pi-play" class="p-button-primary" @click="continueReading" />
        <Button label="编辑元数据" icon="pi pi-pencil" class="p-button-outlined" @click="editBook" />
        <Button :icon="starIcon" :class="starButtonClass" :title="starTitle" @click="toggleStar" />
        <Button
          icon="pi pi-trash"
          class="p-button-outlined p-button-danger"
          title="删除"
          @click="deleteBook"
        />
      </div>
    </div>
  </header>
</template>
