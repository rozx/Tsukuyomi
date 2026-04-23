<script setup lang="ts">
import { computed } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import Skeleton from 'primevue/skeleton';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { APP_NAME } from 'src/constants/app';

const ctx = injectIndexPage();
const aiProcessing = useAIProcessingStore();

const hasActiveJob = computed(() => aiProcessing.hasActiveTasks);

const headerDescription = computed(() => {
  const greeting = ctx.greeting.value;
  const book = ctx.continueReadingBook.value;
  if (hasActiveJob.value && book) {
    return `${greeting}。AI 正在处理《${book.title}》的翻译，这里是你最近的工作上下文。`;
  }
  if (book) {
    return `${greeting}。上次停在《${book.title}》，从下方卡片继续，或进入书库挑选新的章节。`;
  }
  return `${greeting}。先添加一本书或从日站导入，然后我们就可以开始今晚的翻译。`;
});

const workbenchMetrics = computed(() => [
  { label: '书籍', value: ctx.totalBooks.value },
  { label: '章节', value: ctx.totalChapters.value },
  { label: '字数', value: ctx.formatWordCount(ctx.totalWords.value) },
  { label: '术语', value: ctx.totalTerms.value },
  { label: '收藏', value: ctx.starredBooks.value },
]);

const quickActions = [
  {
    key: 'add',
    icon: 'pi pi-plus',
    label: '添加书籍',
    hint: '手动新建一本',
    handler: () => ctx.addBook(),
    primary: true,
  },
  {
    key: 'import',
    icon: 'pi pi-globe',
    label: '从网站导入',
    hint: 'Syosetu / Kakuyomu',
    handler: () => ctx.importBookFromWeb(),
  },
  {
    key: 'library',
    icon: 'pi pi-book',
    label: '打开书库',
    hint: '浏览全部书籍',
    handler: () => ctx.navigateToBooks(),
  },
  {
    key: 'ai',
    icon: 'pi pi-cog',
    label: 'AI 设置',
    hint: '管理模型与密钥',
    handler: () => ctx.navigateToAI(),
  },
];
</script>

<template>
  <div class="desktop-index">
    <DesktopWorkbenchHeader
      :eyebrow="`${ctx.greeting.value} · ${APP_NAME.en} ${APP_NAME.zh}`"
      :title="hasActiveJob ? '工作台正在运行' : '欢迎回来'"
      :description="headerDescription"
    >
      <template #metrics>
        <DesktopWorkbenchMetrics :items="workbenchMetrics" />
      </template>
    </DesktopWorkbenchHeader>

    <!-- 继续阅读 Hero -->
    <DesktopWorkbenchSurface
      v-if="ctx.continueReadingBook.value"
      class="continue-hero"
      :padded="false"
    >
      <div class="continue-hero-grid">
        <div class="continue-hero-cover-wrap">
          <img
            :src="ctx.getCoverUrl(ctx.continueReadingBook.value)"
            :alt="ctx.continueReadingBook.value.title"
            class="continue-hero-cover"
            @error="
              (e) => {
                const target = e.target as HTMLImageElement;
                if (ctx.continueReadingBook.value) {
                  target.src = ctx.getCoverUrl(ctx.continueReadingBook.value);
                }
              }
            "
          />
        </div>

        <div class="continue-hero-body">
          <div class="continue-hero-eyebrow-row">
            <span class="continue-hero-eyebrow">
              {{ hasActiveJob ? 'ACTIVE JOB' : 'CONTINUE READING' }}
            </span>
            <span
              v-if="hasActiveJob"
              class="continue-hero-status continue-hero-status--active"
            >
              <i class="pi pi-spin pi-spinner" aria-hidden="true" />
              AI 正在处理
            </span>
            <span v-else class="continue-hero-status">
              更新于 {{ ctx.formatDate(ctx.continueReadingBook.value.lastEdited) }}
            </span>
          </div>

          <h2 class="continue-hero-title">
            {{ ctx.continueReadingBook.value.title }}
          </h2>
          <p v-if="ctx.continueReadingBook.value.author" class="continue-hero-author">
            {{ ctx.continueReadingBook.value.author }}
          </p>

          <dl class="continue-hero-stats">
            <div class="continue-hero-stat">
              <dt>章节</dt>
              <dd>{{ ctx.getTotalChapters(ctx.continueReadingBook.value) }}</dd>
            </div>
            <div class="continue-hero-stat">
              <dt>字数</dt>
              <dd v-if="ctx.isLoadingCharCount(ctx.continueReadingBook.value)">
                <Skeleton width="48px" height="14px" />
              </dd>
              <dd v-else>
                {{ ctx.formatWordCount(ctx.getTotalWords(ctx.continueReadingBook.value)) }}
              </dd>
            </div>
            <div v-if="ctx.continueReadingBook.value.starred" class="continue-hero-stat">
              <dt>状态</dt>
              <dd class="continue-hero-stat--star">
                <i class="pi pi-star-fill" aria-hidden="true" />
                已收藏
              </dd>
            </div>
          </dl>

          <div class="continue-hero-actions">
            <button
              type="button"
              class="continue-hero-cta"
              @click="ctx.navigateToBookDetails(ctx.continueReadingBook.value)"
            >
              <i class="pi pi-arrow-right" aria-hidden="true" />
              <span>继续阅读</span>
            </button>
            <button type="button" class="continue-hero-cta continue-hero-cta--ghost" @click="ctx.navigateToBooks">
              查看全部书籍
            </button>
          </div>
        </div>
      </div>
    </DesktopWorkbenchSurface>

    <!-- 快速操作 -->
    <section class="quick-actions">
      <header class="section-head">
        <span class="section-eyebrow">QUICK ACTIONS</span>
        <h2 class="section-title">快速操作</h2>
      </header>
      <div class="quick-actions-grid">
        <button
          v-for="action in quickActions"
          :key="action.key"
          type="button"
          class="quick-action"
          :class="{ 'quick-action--primary': action.primary }"
          @click="action.handler"
        >
          <span class="quick-action-icon">
            <i :class="action.icon" aria-hidden="true" />
          </span>
          <span class="quick-action-label">{{ action.label }}</span>
          <span class="quick-action-hint">{{ action.hint }}</span>
        </button>
      </div>
    </section>

    <!-- 最近编辑 -->
    <section v-if="ctx.recentBooks.value.length > 0" class="recent-books">
      <header class="section-head section-head--with-action">
        <div class="section-head-copy">
          <span class="section-eyebrow">RECENT</span>
          <h2 class="section-title">最近编辑</h2>
        </div>
        <button type="button" class="section-head-action" @click="ctx.navigateToBooks">
          <span>查看全部</span>
          <i class="pi pi-arrow-right" aria-hidden="true" />
        </button>
      </header>
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
              @error="
                (e) => {
                  const target = e.target as HTMLImageElement;
                  target.src = ctx.getCoverUrl(book);
                }
              "
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
    </section>

    <!-- 加载 / 空状态 -->
    <section
      v-else-if="ctx.booksStore.isLoading || !ctx.booksStore.isLoaded"
      class="state-surface"
    >
      <ProgressSpinner
        style="width: 42px; height: 42px"
        stroke-width="3"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <p class="state-surface-text">正在加载数据...</p>
    </section>

    <section
      v-else-if="ctx.booksStore.isLoaded && ctx.booksStore.books.length === 0"
      class="state-surface"
    >
      <div class="state-empty-art">
        <img :src="ctx.logoPath" :alt="APP_NAME.full" class="state-empty-logo" />
      </div>
      <div class="state-empty-copy">
        <span class="section-eyebrow">GET STARTED</span>
        <h2 class="state-empty-title">开始你的第一本书</h2>
        <p class="state-empty-desc">
          添加一本自有文本，或从 Syosetu / Kakuyomu 抓取一本新作品进入工作台。
        </p>
      </div>
      <div class="state-empty-actions">
        <button type="button" class="quick-action quick-action--primary" @click="ctx.addBook">
          <span class="quick-action-icon">
            <i class="pi pi-plus" aria-hidden="true" />
          </span>
          <span class="quick-action-label">添加书籍</span>
          <span class="quick-action-hint">手动新建一本</span>
        </button>
        <button type="button" class="quick-action" @click="ctx.importBookFromWeb">
          <span class="quick-action-icon">
            <i class="pi pi-globe" aria-hidden="true" />
          </span>
          <span class="quick-action-label">从网站导入</span>
          <span class="quick-action-hint">Syosetu / Kakuyomu</span>
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.desktop-index {
  height: 100%;
  overflow-y: auto;
  padding: 1rem 1.5rem 2.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  max-width: 80rem;
  margin: 0 auto;
  width: 100%;
}

/* ──────── 继续阅读 Hero ──────── */
.continue-hero {
  flex-shrink: 0;
}

.continue-hero-grid {
  display: grid;
  grid-template-columns: 10rem minmax(0, 1fr);
  gap: 1.5rem;
  padding: 1.4rem 1.6rem;
  align-items: center;
}

.continue-hero-cover-wrap {
  width: 10rem;
  aspect-ratio: 2 / 3;
  border-radius: 10px;
  overflow: hidden;
  background: var(--white-opacity-3);
  box-shadow:
    0 12px 32px rgba(0, 0, 0, 0.35),
    0 2px 6px rgba(0, 0, 0, 0.25);
  flex-shrink: 0;
}

.continue-hero-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.continue-hero-body {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
}

.continue-hero-eyebrow-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.continue-hero-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.continue-hero-status {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  border: 1px solid var(--white-opacity-8, var(--white-opacity-8));
  background: var(--white-opacity-4);
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.64rem;
  color: var(--moon-opacity-60);
  letter-spacing: 0.02em;
}

.continue-hero-status--active {
  border-color: var(--tsukuyomi-300-opacity-32); /* token: tsukuyomi-300 @ 32% */
  background: var(--tsukuyomi-opacity-12);
  color: var(--tsukuyomi-100); /* token: tsukuyomi-100 */
}

.continue-hero-status--active .pi {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  font-size: 0.7rem;
}

.continue-hero-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: clamp(1.5rem, 1.2vw + 1.2rem, 2rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--moon-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.continue-hero-author {
  margin: 0;
  font-size: 0.85rem;
  color: var(--moon-opacity-60);
  font-weight: 500;
}

.continue-hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 1.1rem;
  margin: 0.4rem 0 0.5rem;
  padding: 0;
}

.continue-hero-stat {
  display: inline-flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0;
}

.continue-hero-stat dt {
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.continue-hero-stat dd {
  margin: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--moon-opacity-100);
}

.continue-hero-stat--star {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--color-warning-200); /* token: warning-200 */
}

.continue-hero-stat--star .pi {
  font-size: 0.8rem;
}

.continue-hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-top: 0.5rem;
}

.continue-hero-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.95rem;
  border-radius: 8px;
  border: 1px solid var(--tsukuyomi-300-opacity-40); /* token: tsukuyomi-300 @ 40% */
  background: var(--tsukuyomi-opacity-18);
  color: var(--tsukuyomi-100); /* token: tsukuyomi-100 */
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.continue-hero-cta:hover {
  background: var(--tsukuyomi-opacity-28); /* token: tsukuyomi-500 @ 28% */
  border-color: var(--tsukuyomi-300-opacity-55);
  color: var(--tsukuyomi-50); /* token: tsukuyomi-50 */
}

.continue-hero-cta .pi {
  font-size: 0.82rem;
}

.continue-hero-cta--ghost {
  background: transparent;
  border-color: var(--white-opacity-12, var(--white-opacity-12));
  color: var(--moon-opacity-75);
}

.continue-hero-cta--ghost:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-20);
  color: var(--moon-opacity-100);
}

/* ──────── 通用 section 头 ──────── */
.section-head {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.7rem;
}

.section-head--with-action {
  flex-direction: row;
  align-items: flex-end;
  justify-content: space-between;
}

.section-head-copy {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.section-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.section-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.section-head-action {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.35rem 0.65rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--accent-silver);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 500;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.section-head-action:hover {
  background: var(--white-opacity-4);
  border-color: var(--white-opacity-8, var(--white-opacity-8));
  color: var(--moon-opacity-100);
}

/* ──────── 快速操作 ──────── */
.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.7rem;
}

.quick-action {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.85rem;
  row-gap: 0.15rem;
  padding: 0.95rem 1.05rem;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-8, var(--white-opacity-8));
  background: var(--shell-opacity-50); /* near-black overlay, kept as-is */
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.quick-action:hover {
  border-color: var(--tsukuyomi-200-opacity-30); /* token: tsukuyomi-200 @ 30% */
  background: var(--tsukuyomi-200-opacity-6); /* token: tsukuyomi-200 @ 6% */
  transform: translateY(-1px);
}

.quick-action--primary {
  border-color: var(--tsukuyomi-300-opacity-32); /* token: tsukuyomi-300 @ 32% */
  background: var(--tsukuyomi-opacity-12);
}

.quick-action--primary:hover {
  border-color: var(--tsukuyomi-300-opacity-50); /* token: tsukuyomi-300 @ 50% */
  background: var(--tsukuyomi-opacity-20);
}

.quick-action-icon {
  grid-row: 1 / span 2;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 7px;
  background: var(--tsukuyomi-opacity-12);
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.quick-action-icon .pi {
  font-size: 1rem;
}

.quick-action--primary .quick-action-icon {
  background: var(--tsukuyomi-300-opacity-22);
  color: var(--tsukuyomi-100); /* token: tsukuyomi-100 */
}

.quick-action-label {
  grid-column: 2;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.quick-action-hint {
  grid-column: 2;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.68rem;
  color: var(--accent-opacity-50); /* token: accent-silver @ 50% — not tokenized */
  letter-spacing: 0.02em;
}

/* ──────── 最近编辑 ──────── */
.recent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
  gap: 0.9rem;
}

.recent-card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--white-opacity-8, var(--white-opacity-8));
  background: var(--shell-opacity-50); /* near-black overlay, kept as-is */
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.recent-card:hover {
  border-color: var(--tsukuyomi-200-opacity-30); /* token: tsukuyomi-200 @ 30% */
  background: var(--tsukuyomi-200-opacity-6); /* token: tsukuyomi-200 @ 6% */
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

/* ──────── 状态 surface（loading / empty） ──────── */
.state-surface {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  padding: 3rem 1.5rem;
  border-radius: 16px;
  border: 1px solid var(--white-opacity-8, var(--white-opacity-8));
  background: rgba(8, 10, 13, 0.45); /* near-black overlay, kept as-is */
  text-align: center;
}

.state-surface-text {
  margin: 0;
  color: var(--moon-opacity-70);
  font-size: 0.88rem;
}

.state-empty-art {
  width: 4rem;
  height: 4rem;
  border-radius: 12px;
  background: var(--tsukuyomi-200-opacity-8); /* token: tsukuyomi-200 @ 8% */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem;
}

.state-empty-logo {
  width: 100%;
  height: 100%;
  border-radius: 8px;
  opacity: 0.9;
}

.state-empty-copy {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
  max-width: 30rem;
}

.state-empty-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1.3rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.state-empty-desc {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.55;
  color: var(--moon-opacity-65);
}

.state-empty-actions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.7rem;
  width: 100%;
  max-width: 36rem;
  margin-top: 0.5rem;
}

/* ──────── 响应式 ──────── */
@media (max-width: 900px) {
  .continue-hero-grid {
    grid-template-columns: 7rem minmax(0, 1fr);
    gap: 1.1rem;
    padding: 1.1rem 1.25rem;
  }

  .continue-hero-cover-wrap {
    width: 7rem;
  }
}

@media (max-width: 720px) {
  .desktop-index {
    padding: 0.9rem 1rem 2rem;
  }

  .continue-hero-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .continue-hero-cover-wrap {
    width: min(9rem, 40%);
  }
}
</style>
