<script setup lang="ts">
import { computed } from 'vue';
import ProgressSpinner from 'primevue/progressspinner';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { APP_NAME } from 'src/constants/app';
import IndexDesktopHero from './IndexDesktopHero.vue';
import IndexDesktopRecent from './IndexDesktopRecent.vue';

const ctx = injectIndexPage();
const aiProcessing = useAIProcessingStore();

const hasActiveJob = computed(() => aiProcessing.hasActiveTasks);

const headerTitle = computed(() =>
  hasActiveJob.value ? '工作台正在运行' : '欢迎回来',
);
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
const hasRecent = computed(() => ctx.recentBooks.value.length > 0);
const isLoadingState = computed(() => ctx.booksStore.isLoading || !ctx.booksStore.isLoaded);
const isEmptyState = computed(
  () => ctx.booksStore.isLoaded && ctx.booksStore.books.length === 0,
);

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
      :title="headerTitle"
      :description="headerDescription"
    >
      <template #metrics>
        <DesktopWorkbenchMetrics :items="workbenchMetrics" />
      </template>
    </DesktopWorkbenchHeader>

    <!-- 继续阅读 Hero（抽出到 IndexDesktopHero） -->
    <IndexDesktopHero />

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
    <section v-if="hasRecent" class="recent-books">
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
      <IndexDesktopRecent />
    </section>

    <!-- 加载 / 空状态 -->
    <section v-else-if="isLoadingState" class="state-surface">
      <ProgressSpinner
        style="width: 42px; height: 42px"
        stroke-width="3"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <p class="state-surface-text">正在加载数据...</p>
    </section>

    <section v-else-if="isEmptyState" class="state-surface">
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
