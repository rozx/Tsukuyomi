<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { APP_NAME } from 'src/constants/app';

const ctx = injectIndexPage();

// 列表状态显隐：吸收模板内的 && / || / 比较
const hasRecent = computed(() => ctx.recentBooks.value.length > 0);
const isEmptyState = computed(
  () => ctx.booksStore.isLoaded && ctx.booksStore.books.length === 0,
);
const isLoadingState = computed(() => ctx.booksStore.isLoading || !ctx.booksStore.isLoaded);
const greetingSub = computed(() =>
  ctx.continueReadingBook.value
    ? `上次停在《${ctx.continueReadingBook.value.title}》。`
    : '开启今晚的翻译旅程吧。',
);
</script>

<template>
  <div class="mobile-home w-full h-full overflow-y-auto">
    <!-- 顶部品牌条 -->
    <div class="mh-brandbar">
      <img :src="ctx.logoPath" :alt="APP_NAME.full" class="mh-brandbar-logo" />
      <div class="mh-brandbar-text">
        <div class="mh-eyebrow">{{ APP_NAME.en }} {{ APP_NAME.zh }}</div>
        <div class="mh-wordmark">{{ APP_NAME.description.en }}</div>
      </div>
    </div>

    <!-- 问候语 -->
    <section class="mh-greeting">
      <h1 class="mh-greeting-title">
        {{ ctx.greeting.value }}，<br />
        <span class="mh-greeting-name">欢迎回来</span>。
      </h1>
      <p class="mh-greeting-sub">
        {{ greetingSub }}
      </p>
    </section>

    <!-- 继续翻译 Hero -->
    <section v-if="ctx.continueReadingBook.value" class="mh-section">
      <div
        class="mh-cta"
        role="button"
        @click="ctx.navigateToBookDetails(ctx.continueReadingBook.value)"
      >
        <div class="mh-cta-cover">
          <img
            :src="ctx.getCoverUrl(ctx.continueReadingBook.value)"
            :alt="ctx.continueReadingBook.value.title"
            loading="lazy"
          />
          <div class="mh-cta-cover-overlay" />
        </div>
        <div class="mh-cta-body">
          <div class="mh-cta-kicker">继续翻译</div>
          <div class="mh-cta-title">{{ ctx.continueReadingBook.value.title }}</div>
          <div v-if="ctx.continueReadingBook.value.author" class="mh-cta-author">
            {{ ctx.continueReadingBook.value.author }}
          </div>
          <div class="mh-cta-meta">
            <span>{{ ctx.getTotalChapters(ctx.continueReadingBook.value) }} 章</span>
            <span class="mh-dot">·</span>
            <span>更新于 {{ ctx.formatDate(ctx.continueReadingBook.value.lastEdited) }}</span>
          </div>
        </div>
        <i class="pi pi-arrow-right mh-cta-arrow" aria-hidden="true" />
      </div>
    </section>

    <!-- 统计网格 2x2 -->
    <section class="mh-section">
      <div class="mh-stats-grid">
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">书籍</span>
            <i class="pi pi-book mh-stat-icon mh-stat-icon--tsukuyomi" />
          </div>
          <div class="mh-stat-value">{{ ctx.totalBooks.value }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">章节</span>
            <i class="pi pi-list mh-stat-icon mh-stat-icon--green" />
          </div>
          <div class="mh-stat-value">{{ ctx.totalChapters.value }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">字数</span>
            <i class="pi pi-file-edit mh-stat-icon mh-stat-icon--moon" />
          </div>
          <div class="mh-stat-value">{{ ctx.formatWordCount(ctx.totalWords.value) }}</div>
        </div>
        <div class="mh-stat-card">
          <div class="mh-stat-head">
            <span class="mh-stat-label">收藏</span>
            <i class="pi pi-star-fill mh-stat-icon mh-stat-icon--warning" />
          </div>
          <div class="mh-stat-value">{{ ctx.starredBooks.value }}</div>
        </div>
      </div>
    </section>

    <!-- 最近编辑 -->
    <section v-if="hasRecent" class="mh-section">
      <header class="mh-section-head">
        <span class="mh-section-title">最近编辑</span>
        <button class="mh-section-link" @click="ctx.navigateToBooks">
          查看全部 <i class="pi pi-arrow-right" aria-hidden="true" />
        </button>
      </header>
      <div class="mh-recent-grid">
        <div
          v-for="book in ctx.recentBooks.value.slice(0, 3)"
          :key="book.id"
          class="mh-recent-card"
          role="button"
          @click="ctx.navigateToBookDetails(book)"
        >
          <div class="mh-recent-cover">
            <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
            <i v-if="book.starred" class="pi pi-star-fill mh-recent-star" aria-hidden="true" />
          </div>
          <div class="mh-recent-title">{{ book.title }}</div>
          <div v-if="ctx.isLoadingCharCount(book)" class="mh-recent-meta">
            <Skeleton width="36px" height="10px" />
          </div>
          <div v-else class="mh-recent-meta">
            {{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字
          </div>
        </div>
      </div>
    </section>

    <!-- 快速操作 -->
    <section class="mh-section mh-section--last">
      <header class="mh-section-head">
        <span class="mh-section-title">快速操作</span>
      </header>
      <div class="mh-actions-grid">
        <Button
          label="添加书籍"
          icon="pi pi-plus"
          class="p-button-primary mh-action-btn"
          @click="ctx.addBook"
        />
        <Button
          label="从网站导入"
          icon="pi pi-globe"
          class="p-button-outlined mh-action-btn"
          @click="ctx.importBookFromWeb"
        />
      </div>
    </section>

    <!-- 空状态 -->
    <div
      v-if="isEmptyState"
      class="mh-empty"
    >
      <i class="pi pi-book mh-empty-icon" aria-hidden="true" />
      <div class="mh-empty-title">还没有书籍</div>
      <div class="mh-empty-sub">开始添加您的第一本书籍吧</div>
    </div>

    <!-- 加载状态 -->
    <div
      v-else-if="isLoadingState"
      class="mh-loading"
    >
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载数据…</span>
    </div>
  </div>
</template>

<style scoped>
.mobile-home {
  padding: 12px 0 32px;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.mh-brandbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 20px 16px;
}

.mh-brandbar-logo {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-brandbar-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.mh-eyebrow {
  font-weight: 300;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--moon-50-opacity-55);
}

.mh-wordmark {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  margin-top: 2px;
  letter-spacing: -0.01em;
}

.mh-greeting {
  padding: 4px 20px 4px;
}

.mh-greeting-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
  line-height: 1.3;
  margin: 0;
}

.mh-greeting-name {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.mh-greeting-sub {
  font-size: 13px;
  color: var(--moon-50-opacity-70);
  margin-top: 8px;
  line-height: 1.6;
}

.mh-section {
  padding: 16px 20px 0;
}

.mh-section--last {
  padding-bottom: 8px;
}

.mh-section-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.mh-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
}

.mh-section-link {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  background: transparent;
  border: none;
  cursor: pointer;
}

.mh-section-link i {
  font-size: 10px;
}

.mh-cta {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 14px;
  background: linear-gradient(135deg, var(--tsukuyomi-opacity-18), var(--tsukuyomi-opacity-4));
  /* gradient stop 2: tsukuyomi-500 @ 4% — not tokenized */
  border: 1px solid var(--tsukuyomi-opacity-35); /* token: tsukuyomi-500 @ 35% — not tokenized */
  border-radius: 14px;
  box-shadow: 0 2px 8px var(--tsukuyomi-opacity-30);
  cursor: pointer;
  transition: transform 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mh-cta:active {
  transform: scale(0.99);
}

.mh-cta-cover {
  position: relative;
  width: 44px;
  height: 58px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--night-300); /* token: night-300 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-cta-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-cta-cover-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.45) 100%);
}

.mh-cta-body {
  flex: 1;
  min-width: 0;
}

.mh-cta-kicker {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
}

.mh-cta-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 15px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  margin-top: 3px;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-cta-author {
  font-size: 11px;
  color: var(--moon-50-opacity-60);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-cta-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
}

.mh-dot {
  opacity: 0.5;
}

.mh-cta-arrow {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 14px;
  flex-shrink: 0;
}

.mh-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mh-stat-card {
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  padding: 12px 14px;
}

.mh-stat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.mh-stat-label {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--moon-50-opacity-60);
}

.mh-stat-icon {
  font-size: 12px;
  opacity: 0.85;
}

.mh-stat-icon--tsukuyomi {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.mh-stat-icon--green {
  color: var(--color-success-300);
}

.mh-stat-icon--moon {
  color: var(--primary-200);
}

.mh-stat-icon--warning {
  color: var(--color-warning);
}

.mh-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 700;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.02em;
  line-height: 1;
}

.mh-recent-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.mh-recent-card {
  cursor: pointer;
  min-width: 0;
}

.mh-recent-cover {
  position: relative;
  aspect-ratio: 2 / 3;
  border-radius: 8px;
  overflow: hidden;
  background: var(--night-300); /* token: night-300 */
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
}

.mh-recent-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.mh-recent-star {
  position: absolute;
  top: 6px;
  right: 6px;
  color: var(--color-warning);
  font-size: 11px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.mh-recent-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-50-opacity-90);
  margin-top: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mh-recent-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
}

.mh-actions-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mh-action-btn {
  width: 100%;
  height: 44px;
}

.mh-empty,
.mh-loading {
  padding: 32px 20px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.mh-empty-icon {
  font-size: 42px;
  color: var(--moon-50-opacity-25); /* token: moon-50 @ 25% — not tokenized */
}

.mh-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--moon-50-opacity-85);
}

.mh-empty-sub {
  font-size: 13px;
  color: var(--moon-50-opacity-55);
}
</style>
