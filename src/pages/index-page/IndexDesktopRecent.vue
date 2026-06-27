<script setup lang="ts">
/**
 * 桌面首页「最近编辑」书籍网格。从 IndexPageDesktop 抽出以降低其模板圈复杂度。
 * 仅渲染网格本身，外层 section / 标题头仍由父组件持有（复用共享 .section-head 样式）。
 */
import Skeleton from 'primevue/skeleton';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import type { Novel } from 'src/models/novel';

const ctx = injectIndexPage();

const onRecentCoverError = (e: Event, book: Novel) => {
  (e.target as HTMLImageElement).src = ctx.getCoverUrl(book);
};
</script>

<template>
  <div class="recent-grid">
    <button
      v-for="book in ctx.recentBooks.value"
      :key="book.id"
      type="button"
      class="recent-card"
      @click="ctx.navigateToBookDetails(book)"
    >
      <div class="recent-card-cover">
        <img
          :src="ctx.getCoverUrl(book)"
          :alt="book.title"
          class="recent-card-cover-img"
          @error="(e) => onRecentCoverError(e, book)"
        />
        <span v-if="book.starred" class="recent-card-star" aria-hidden="true">
          <i class="pi pi-star-fill" />
        </span>
      </div>
      <div class="recent-card-body">
        <h3 class="recent-card-title" :title="book.title">{{ book.title }}</h3>
        <p v-if="book.author" class="recent-card-author">{{ book.author }}</p>
        <div class="recent-card-meta">
          <span class="recent-card-meta-item">
            <i class="pi pi-list" aria-hidden="true" />
            {{ ctx.getTotalChapters(book) }}
          </span>
          <span class="recent-card-meta-item">
            <i class="pi pi-align-left" aria-hidden="true" />
            <Skeleton v-if="ctx.isLoadingCharCount(book)" width="36px" height="12px" />
            <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }}</span>
          </span>
          <span class="recent-card-meta-item recent-card-meta-item--time">
            {{ ctx.formatDate(book.lastEdited) }}
          </span>
        </div>
      </div>
    </button>
  </div>
</template>

<style scoped>
.recent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.9rem;
}

/* 表面底色/边框/过渡与基础 hover 见 tailwind.css 的 .recent-card, .quick-action 公共规则 */
.recent-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem;
}

.recent-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.32);
}

.recent-card-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 6px;
  overflow: hidden;
  background: var(--white-opacity-3);
}

.recent-card-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 260ms cubic-bezier(0.4, 0, 0.2, 1);
}

.recent-card:hover .recent-card-cover-img {
  transform: scale(1.04);
}

.recent-card-star {
  position: absolute;
  top: 0.45rem;
  right: 0.45rem;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  background: var(--shell-opacity-72); /* near-black overlay, kept as-is */
  color: var(--color-warning-200); /* token: warning-200 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
}

.recent-card-star .pi {
  font-size: 0.62rem;
}

.recent-card-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0 0.15rem 0.15rem;
}

.recent-card-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 0.86rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--moon-opacity-95);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  min-height: 2.25rem;
}

.recent-card-author {
  margin: 0;
  font-size: 0.7rem;
  color: var(--moon-opacity-55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recent-card-meta {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  flex-wrap: wrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.65rem;
  color: var(--moon-opacity-55);
  margin-top: 0.15rem;
}

.recent-card-meta-item {
  display: inline-flex;
  align-items: center;
  gap: 0.2rem;
}

.recent-card-meta-item .pi {
  font-size: 0.64rem;
  opacity: 0.7;
}

.recent-card-meta-item--time {
  margin-left: auto;
  color: var(--accent-opacity-38); /* token: accent-silver @ 38% — not tokenized */
}
</style>
