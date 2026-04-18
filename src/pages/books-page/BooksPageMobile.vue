<script setup lang="ts">
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectBooksPage } from 'src/composables/books-page/useBooksPage';

const ctx = injectBooksPage();
</script>

<template>
  <div class="mobile-library w-full h-full flex flex-col">
    <!-- 大标题区 -->
    <header class="ml-largetitle">
      <div class="ml-eyebrow">LIBRARY</div>
      <h1 class="ml-title">书库</h1>
      <div class="ml-meta">
        共 {{ ctx.booksStore.books.length }} 本
        <template v-if="ctx.booksStore.books.filter((b) => b.starred).length > 0">
          · {{ ctx.booksStore.books.filter((b) => b.starred).length }} 本收藏
        </template>
      </div>
    </header>

    <!-- 搜索 + 添加 -->
    <div class="ml-toolbar">
      <div class="ml-input-wrap">
        <i class="pi pi-search" aria-hidden="true" />
        <input v-model="ctx.searchQuery.value" class="ml-input" placeholder="搜索书名、作者…" />
        <button
          v-if="ctx.searchQuery.value"
          class="ml-input-clear"
          aria-label="清除搜索"
          @click="ctx.searchQuery.value = ''"
        >
          <i class="pi pi-times" />
        </button>
      </div>
      <button class="ml-icon-btn" title="添加书籍" @click="ctx.addBook">
        <i class="pi pi-plus" aria-hidden="true" />
      </button>
    </div>

    <!-- 加载 -->
    <div v-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded" class="ml-state">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载书籍列表…</span>
    </div>

    <!-- 空状态 -->
    <div v-else-if="ctx.filteredBooks.value.length === 0" class="ml-state">
      <i class="pi pi-book ml-state-icon" aria-hidden="true" />
      <span class="ml-state-title">
        {{ ctx.searchQuery.value ? '未找到匹配的书籍' : '暂无书籍' }}
      </span>
      <Button
        v-if="!ctx.searchQuery.value"
        label="添加第一本书籍"
        icon="pi pi-plus"
        class="p-button-primary"
        @click="ctx.addBook"
      />
    </div>

    <!-- 书籍网格 -->
    <div v-else class="ml-scroll">
      <div class="ml-grid">
        <div
          v-for="book in ctx.filteredBooks.value"
          :key="book.id"
          class="ml-card"
          role="button"
          @click="ctx.navigateToBookDetails(book)"
        >
          <div class="ml-cover">
            <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
            <i v-if="book.starred" class="pi pi-star-fill ml-cover-star" aria-hidden="true" />
          </div>
          <div class="ml-card-title">{{ book.title }}</div>
          <div v-if="book.author" class="ml-card-author">{{ book.author }}</div>
          <div class="ml-card-footer">
            <span v-if="ctx.isLoadingCharCount(book)">
              <Skeleton width="36px" height="10px" />
            </span>
            <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字</span>
            <span class="ml-dot">·</span>
            <span>{{ ctx.getTotalChapters(book) }} 章</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mobile-library {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ml-largetitle {
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.ml-eyebrow {
  font-weight: 500;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.ml-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  margin: 0;
}

.ml-meta {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 6px;
}

.ml-toolbar {
  padding: 4px 20px 12px;
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ml-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.ml-input-wrap > i {
  position: absolute;
  left: 12px;
  color: rgba(247, 244, 236, 0.55);
  font-size: 13px;
  pointer-events: none;
}

.ml-input {
  width: 100%;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 10px 34px 10px 34px;
  color: rgba(247, 244, 236, 1);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.ml-input::placeholder {
  color: rgba(247, 244, 236, 0.45);
}

.ml-input:focus {
  border-color: #e9edf5;
  box-shadow: 0 0 0 2px rgba(233, 237, 245, 0.2);
}

.ml-input-clear {
  position: absolute;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(247, 244, 236, 0.55);
  cursor: pointer;
  border-radius: 6px;
}

.ml-input-clear:hover {
  background: rgba(255, 255, 255, 0.06);
  color: rgba(247, 244, 236, 0.85);
}

.ml-input-clear i {
  font-size: 11px;
}

.ml-icon-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(247, 244, 236, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ml-icon-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(247, 244, 236, 1);
}

.ml-icon-btn i {
  font-size: 14px;
}

.ml-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ml-scroll::-webkit-scrollbar {
  width: 0;
}

.ml-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  padding: 4px 20px 24px;
}

.ml-card {
  cursor: pointer;
  min-width: 0;
}

.ml-cover {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: #14161a;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.ml-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ml-cover-star {
  position: absolute;
  top: 8px;
  right: 8px;
  color: #f2c037;
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.ml-card-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin-top: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-card-author {
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ml-card-footer {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
}

.ml-dot {
  opacity: 0.5;
}

.ml-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.6);
  font-size: 13px;
}

.ml-state-icon {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.25);
}

.ml-state-title {
  font-size: 14px;
  color: rgba(247, 244, 236, 0.7);
}
</style>
