<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

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
const emptyText = computed(() =>
  t.ctx.searchQuery.value ? i18nT('libraryUi.noMatches') : i18nT('libraryUi.noBooks'),
);
const sortButtonTitle = computed(() =>
  i18nT('libraryUi.sortLabel', { label: t.currentSortLabel.value }),
);
</script>

<template>
  <aside class="tl-list">
    <header class="tl-list-head">
      <div class="tl-eyebrow">{{ i18nT('libraryUi.library') }}</div>
      <h1 class="tl-title">{{ i18nT('libraryUi.library') }}</h1>
      <div class="tl-meta">
        {{ i18nT('libraryUi.bookCount', { count: t.ctx.booksStore.books.length }) }}
        <template v-if="hasStarred">
          · {{ i18nT('libraryUi.starredCount', { count: starredCount }) }}
        </template>
      </div>
      <div class="tl-toolbar">
        <div class="tl-input-wrap">
          <i class="pi pi-search" aria-hidden="true" />
          <input
            v-model="t.ctx.searchQuery.value"
            class="tl-input"
            :placeholder="i18nT('libraryUi.searchShort')"
          />
          <button
            v-if="t.ctx.searchQuery.value"
            class="tl-input-clear"
            :aria-label="i18nT('libraryUi.clearSearch')"
            @click="t.ctx.searchQuery.value = ''"
          >
            <i class="pi pi-times" />
          </button>
        </div>
        <button
          class="tl-icon-btn"
          :title="sortButtonTitle"
          aria-haspopup="true"
          @click="t.toggleSortMenu"
        >
          <i class="pi pi-sort-alt" aria-hidden="true" />
        </button>
        <button
          class="tl-icon-btn"
          :title="i18nT('libraryUi.addBook')"
          aria-haspopup="true"
          @click="t.toggleAddMenu"
        >
          <i class="pi pi-plus" aria-hidden="true" />
        </button>
        <Menu ref="addMenuRef" :model="t.addMenuItems.value" :popup="true" append-to="body" />
        <TieredMenu
          :ref="
            (el) => {
              t.ctx.sortMenuRef.value = el as unknown as typeof t.ctx.sortMenuRef.value;
            }
          "
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
        :aria-label="i18nT('libraryUi.loading')"
      />
      <span>{{ i18nT('libraryUi.loadingShort') }}</span>
    </div>

    <div v-else-if="isEmpty" class="tl-state">
      <i class="pi pi-book tl-state-icon" aria-hidden="true" />
      <span>{{ emptyText }}</span>
    </div>

    <div v-else class="tl-list-scroll">
      <BooksTabletBookRow v-for="book in t.ctx.filteredBooks.value" :key="book.id" :book="book" />
    </div>
  </aside>
</template>
