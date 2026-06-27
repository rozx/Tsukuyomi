<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { APP_NAME } from 'src/constants/app';
import IndexTabletHero from './IndexTabletHero.vue';

const ctx = injectIndexPage();

// 把模板内的三元 / 比较收进脚本侧，降低段落认知与圈复杂度
const greetingSub = computed(() =>
  ctx.continueReadingBook.value
    ? `上次停在《${ctx.continueReadingBook.value.title}》。`
    : '今晚是翻译的好夜色。',
);
</script>

<template>
  <div class="tablet-home w-full h-full overflow-y-auto">
    <div class="th-inner">
      <!-- 问候语 -->
      <section class="th-greeting">
        <img :src="ctx.logoPath" :alt="APP_NAME.full" class="th-logo" />
        <div class="th-greeting-body">
          <div class="th-eyebrow">
            {{ ctx.greeting.value }} · {{ APP_NAME.en }} {{ APP_NAME.zh }}
          </div>
          <h1 class="th-greeting-title">
            {{ ctx.greeting.value }}，<span class="th-accent">欢迎回来</span>。
          </h1>
          <p class="th-greeting-sub">
            {{ greetingSub }}
          </p>
        </div>
      </section>

      <!-- Hero 卡片：活跃任务 + 继续阅读（抽出到 IndexTabletHero） -->
      <IndexTabletHero />

      <!-- 统计条 —— 5 列（书籍 · 章节 · 字数 · 收藏 · AI 模型） -->
      <section class="th-stats">
        <div class="th-stat-cell">
          <i class="pi pi-book th-stat-icon th-stat-icon--tsukuyomi" aria-hidden="true" />
          <div class="th-stat-value">{{ ctx.totalBooks.value }}</div>
          <div class="th-stat-label">总书籍</div>
        </div>
        <div class="th-stat-cell">
          <i class="pi pi-list th-stat-icon th-stat-icon--green" aria-hidden="true" />
          <div class="th-stat-value">{{ ctx.totalChapters.value }}</div>
          <div class="th-stat-label">总章节</div>
        </div>
        <div class="th-stat-cell">
          <i class="pi pi-file-edit th-stat-icon th-stat-icon--moon" aria-hidden="true" />
          <div class="th-stat-value">{{ ctx.formatWordCount(ctx.totalWords.value) }}</div>
          <div class="th-stat-label">总字数</div>
        </div>
        <div class="th-stat-cell">
          <i class="pi pi-star-fill th-stat-icon th-stat-icon--warning" aria-hidden="true" />
          <div class="th-stat-value">{{ ctx.starredBooks.value }}</div>
          <div class="th-stat-label">收藏</div>
        </div>
        <div class="th-stat-cell th-stat-cell--last">
          <i class="pi pi-tags th-stat-icon th-stat-icon--sage" aria-hidden="true" />
          <div class="th-stat-value">{{ ctx.totalTerms.value }}</div>
          <div class="th-stat-label">术语</div>
        </div>
      </section>

      <!-- 快速操作 —— 4 列 -->
      <section class="th-section">
        <header class="th-section-head">
          <span class="th-section-title">
            <i class="pi pi-bolt" aria-hidden="true" /> 快速操作
          </span>
        </header>
        <div class="th-quick-grid">
          <button class="th-quick-btn th-quick-btn--primary" @click="ctx.addBook">
            <i class="pi pi-plus" aria-hidden="true" />
            <div class="th-quick-title">添加书籍</div>
            <div class="th-quick-sub">主操作</div>
          </button>
          <button class="th-quick-btn" @click="ctx.importBookFromWeb">
            <i class="pi pi-globe" aria-hidden="true" />
            <div class="th-quick-title">从网站导入</div>
            <div class="th-quick-sub">syosetu · kakuyomu</div>
          </button>
          <button class="th-quick-btn" @click="ctx.navigateToBooks">
            <i class="pi pi-book" aria-hidden="true" />
            <div class="th-quick-title">查看所有书籍</div>
            <div class="th-quick-sub">{{ ctx.totalBooks.value }} 本已导入</div>
          </button>
          <button class="th-quick-btn" @click="ctx.navigateToAI">
            <i class="pi pi-cog" aria-hidden="true" />
            <div class="th-quick-title">AI 设置</div>
            <div class="th-quick-sub">管理模型</div>
          </button>
        </div>
      </section>

      <!-- 最近阅读 —— 3 列 -->
      <section v-if="ctx.hasRecent.value" class="th-section">
        <header class="th-section-head">
          <span class="th-section-title">最近阅读</span>
          <button class="th-section-link" @click="ctx.navigateToBooks">
            查看书库 <i class="pi pi-arrow-right" aria-hidden="true" />
          </button>
        </header>
        <div class="th-recent-grid">
          <div
            v-for="book in ctx.recentBooks.value.slice(0, 6)"
            :key="book.id"
            class="th-recent-card"
            role="button"
            tabindex="0"
            @click="ctx.navigateToBookDetails(book)"
            @keydown.enter="ctx.navigateToBookDetails(book)"
          >
            <div class="th-recent-cover">
              <img :src="ctx.getCoverUrl(book)" :alt="book.title" loading="lazy" />
              <i v-if="book.starred" class="pi pi-star-fill th-recent-star" aria-hidden="true" />
            </div>
            <div class="th-recent-body">
              <div class="th-recent-title">{{ book.title }}</div>
              <div class="th-recent-author">
                {{ book.author || '未知作者' }} · {{ ctx.formatDate(book.lastEdited) }}
              </div>
              <div class="th-recent-meta">
                <span v-if="ctx.isLoadingCharCount(book)">
                  <Skeleton width="48px" height="10px" />
                </span>
                <span v-else>{{ ctx.formatWordCount(ctx.getTotalWords(book)) }} 字</span>
                <span class="th-dot">·</span>
                <span>{{ ctx.getTotalChapters(book) }} 章</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 空 / 加载状态 -->
      <div
        v-if="ctx.isEmptyState.value"
        class="th-empty"
      >
        <i class="pi pi-book th-empty-icon" aria-hidden="true" />
        <div class="th-empty-title">还没有书籍</div>
        <div class="th-empty-sub">开始添加您的第一本书籍吧</div>
        <Button
          label="添加书籍"
          icon="pi pi-plus"
          class="p-button-primary mt-4"
          @click="ctx.addBook"
        />
      </div>

      <div
        v-else-if="ctx.isLoadingState.value"
        class="th-loading"
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
  </div>
</template>

<style scoped>
.tablet-home {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.th-inner {
  max-width: 1200px;
  margin: 0 auto;
  padding: 32px 40px 48px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.th-greeting {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}

.th-logo {
  width: 68px;
  height: 68px;
  border-radius: 16px;
  flex-shrink: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
}

.th-greeting-body {
  flex: 1;
  min-width: 0;
}

.th-eyebrow {
  font-size: 11px;
  letter-spacing: 0.22em;
  color: var(--accent-opacity-85); /* token: accent-silver @ 85% — not tokenized */
  text-transform: uppercase;
  font-weight: 500;
}

.th-greeting-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 30px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  line-height: 1.15;
  margin: 8px 0 0;
}

.th-accent {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.th-greeting-sub {
  font-size: 13px;
  color: var(--moon-50-opacity-70);
  margin: 6px 0 0;
  line-height: 1.5;
}

/* Hero grid 样式随 IndexTabletHero 组件迁出 */

/* Stats strip */
.th-stats {
  padding: 18px 24px;
  background: var(--white-opacity-2-5); /* token: white @ 2.5% — not tokenized */
  border: 1px solid var(--white-opacity-8);
  border-radius: 14px;
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.th-stat-cell {
  text-align: center;
  border-right: 1px solid var(--white-opacity-6);
  padding: 0 12px;
}

.th-stat-cell--last {
  border-right: none;
}

.th-stat-icon {
  font-size: 14px;
  display: block;
  margin-bottom: 8px;
}

.th-stat-icon--tsukuyomi {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.th-stat-icon--green {
  color: var(--color-success-300);
}

.th-stat-icon--moon {
  color: var(--primary-200);
}

.th-stat-icon--warning {
  color: var(--color-warning);
}

.th-stat-icon--sage {
  color: var(--color-success);
}

.th-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
}

.th-stat-label {
  font-size: 10px;
  color: var(--moon-50-opacity-60);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* Sections */
.th-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.th-section-head {
  display: flex;
  align-items: center;
}

.th-section-title {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.th-section-title i {
  color: var(--color-warning);
}

.th-section-link {
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

.th-section-link i {
  font-size: 10px;
}

/* Quick actions grid */
.th-quick-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.th-quick-btn {
  padding: 14px 16px;
  background: var(--white-opacity-2-5); /* token: white @ 2.5% — not tokenized */
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  text-align: left;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--moon-50-opacity-90);
}

.th-quick-btn:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-12);
}

.th-quick-btn > i {
  font-size: 14px;
  color: var(--moon-50-opacity-65); /* token: moon-50 @ 65% — not tokenized */
}

.th-quick-btn--primary {
  background: var(--tsukuyomi-opacity-15);
  border-color: var(--tsukuyomi-opacity-30);
}

.th-quick-btn--primary > i {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.th-quick-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 13px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  margin-top: 2px;
}

.th-quick-sub {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
}

/* Recent books grid */
.th-recent-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.th-recent-card {
  padding: 12px;
  background: var(--white-opacity-2-5); /* token: white @ 2.5% — not tokenized */
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  display: flex;
  gap: 12px;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.th-recent-card:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-12);
  transform: translateY(-1px);
}

.th-recent-cover {
  position: relative;
  width: 48px;
  height: 72px;
  flex-shrink: 0;
  border-radius: 6px;
  overflow: hidden;
  background: var(--night-300); /* token: night-300 */
}

.th-recent-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.th-recent-star {
  position: absolute;
  top: 4px;
  right: 4px;
  color: var(--color-warning);
  font-size: 9px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.th-recent-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.th-recent-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-recent-author {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.th-recent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  margin-top: 4px;
}

.th-dot {
  opacity: 0.5;
}

/* Empty / loading */
.th-empty,
.th-loading {
  padding: 48px 20px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.th-empty-icon {
  font-size: 42px;
  color: var(--moon-50-opacity-25); /* token: moon-50 @ 25% — not tokenized */
}

.th-empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--moon-50-opacity-85);
}

.th-empty-sub {
  font-size: 13px;
  color: var(--moon-50-opacity-55);
}
</style>
