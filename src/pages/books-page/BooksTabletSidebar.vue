<script setup lang="ts">
/**
 * 平板书库左侧列表（标题 / 搜索 / 排序 / 添加 + 加载·空态 + 书籍行列表）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import Menu from 'primevue/menu';
import TieredMenu from 'primevue/tieredmenu';
import ProgressSpinner from 'primevue/progressspinner';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';
import BooksTabletBookRow from './BooksTabletBookRow.vue';

const t = injectBooksTabletPage();

const starredCount = computed(() => t.ctx.booksStore.books.filter((b) => b.starred).length);
const hasStarred = computed(() => starredCount.value > 0);
const isLoading = computed(() => t.ctx.booksStore.isLoading || !t.ctx.booksStore.isLoaded);
const isEmpty = computed(() => t.ctx.filteredBooks.value.length === 0);
const emptyText = computed(() => (t.ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍'));
const sortButtonTitle = computed(() => `排序：${t.currentSortLabel.value}`);
</script>

<template>
  <aside class="tl-list">
    <header class="tl-list-head">
      <div class="tl-eyebrow">LIBRARY</div>
      <h1 class="tl-title">书库</h1>
      <div class="tl-meta">
        {{ t.ctx.booksStore.books.length }} 本
        <template v-if="hasStarred"> · {{ starredCount }} 本收藏 </template>
      </div>
      <div class="tl-toolbar">
        <div class="tl-input-wrap">
          <i class="pi pi-search" aria-hidden="true" />
          <input v-model="t.ctx.searchQuery.value" class="tl-input" placeholder="搜索书名、作者…" />
          <button
            v-if="t.ctx.searchQuery.value"
            class="tl-input-clear"
            aria-label="清除搜索"
            @click="t.ctx.searchQuery.value = ''"
          >
            <i class="pi pi-times" />
          </button>
        </div>
        <button class="tl-icon-btn" :title="sortButtonTitle" aria-haspopup="true" @click="t.toggleSortMenu">
          <i class="pi pi-sort-alt" aria-hidden="true" />
        </button>
        <button class="tl-icon-btn" title="添加书籍" aria-haspopup="true" @click="t.toggleAddMenu">
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
        <Menu ref="addMenuRef" :model="t.addMenuItems.value" :popup="true" append-to="body" />
        <TieredMenu
          :ref="(el) => { t.ctx.sortMenuRef.value = el as unknown as typeof t.ctx.sortMenuRef.value; }"
          :model="t.ctx.sortMenuItems.value"
          popup
          append-to="body"
        />
      </div>
    </header>

    <div v-if="isLoading" class="tl-state">
      <ProgressSpinner
        style="width: 28px; height: 28px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载…</span>
    </div>

    <div v-else-if="isEmpty" class="tl-state">
      <i class="pi pi-book tl-state-icon" aria-hidden="true" />
      <span>{{ emptyText }}</span>
    </div>

    <div v-else class="tl-list-scroll">
      <BooksTabletBookRow
        v-for="book in t.ctx.filteredBooks.value"
        :key="book.id"
        :book="book"
      />
    </div>
  </aside>
</template>
