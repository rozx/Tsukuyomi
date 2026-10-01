<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

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
  hasActiveJob.value ? i18nT('libraryUi.running') : i18nT('libraryUi.welcome'),
);
const headerDescription = computed(() => {
  const greeting = ctx.greeting.value;
  const book = ctx.continueReadingBook.value;
  if (hasActiveJob.value && book) {
    return i18nT('libraryUi.activeDescription', { greeting, title: book.title });
  }
  if (book) {
    return i18nT('libraryUi.recentDescription', { greeting, title: book.title });
  }
  return i18nT('libraryUi.emptyDescription', { greeting });
});

const workbenchMetrics = computed(() => [
  { label: i18nT('libraryUi.books'), value: ctx.totalBooks.value },
  { label: i18nT('libraryUi.chapters'), value: ctx.totalChapters.value },
  { label: i18nT('libraryUi.characters'), value: ctx.formatWordCount(ctx.totalWords.value) },
  { label: i18nT('libraryUi.terms'), value: ctx.totalTerms.value },
  { label: i18nT('libraryUi.favorites'), value: ctx.starredBooks.value },
]);
const quickActions = computed(() => [
  {
    key: 'add',
    icon: 'pi pi-plus',
    label: i18nT('libraryUi.addBook'),
    hint: i18nT('libraryUi.manualHint'),
    handler: () => ctx.addBook(),
    primary: true,
  },
  {
    key: 'import',
    icon: 'pi pi-globe',
    label: i18nT('libraryUi.importWeb'),
    hint: 'Syosetu / Kakuyomu',
    handler: () => ctx.importBookFromWeb(),
  },
  {
    key: 'library',
    icon: 'pi pi-book',
    label: i18nT('libraryUi.openLibrary'),
    hint: i18nT('libraryUi.browseBooks'),
    handler: () => ctx.navigateToBooks(),
  },
  {
    key: 'ai',
    icon: 'pi pi-cog',
    label: i18nT('libraryUi.aiSettings'),
    hint: i18nT('libraryUi.manageKeys'),
    handler: () => ctx.navigateToAI(),
  },
]);
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
        <span class="section-eyebrow">{{ i18nT('libraryUi.quickActions') }}</span>
        <h2 class="section-title">{{ i18nT('libraryUi.quickActions') }}</h2>
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
    <section v-if="ctx.hasRecent.value" class="recent-books">
      <header class="section-head section-head--with-action">
        <div class="section-head-copy">
          <span class="section-eyebrow">{{ i18nT('libraryUi.recent') }}</span>
          <h2 class="section-title">{{ i18nT('libraryUi.recentlyEdited') }}</h2>
        </div>
        <button type="button" class="section-head-action" @click="ctx.navigateToBooks">
          <span>{{ i18nT('libraryUi.viewAll') }}</span>
          <i class="pi pi-arrow-right" aria-hidden="true" />
        </button>
      </header>
      <IndexDesktopRecent />
    </section>

    <!-- 加载 / 空状态 -->
    <section v-else-if="ctx.isLoadingState.value" class="state-surface">
      <ProgressSpinner
        style="width: 42px; height: 42px"
        stroke-width="3"
        animation-duration=".8s"
        :aria-label="i18nT('libraryUi.loading')"
      />
      <p class="state-surface-text">{{ i18nT('libraryUi.loadingData') }}</p>
    </section>

    <section v-else-if="ctx.isEmptyState.value" class="state-surface">
      <div class="state-empty-art">
        <img :src="ctx.logoPath" :alt="APP_NAME.full" class="state-empty-logo" />
      </div>
      <div class="state-empty-copy">
        <span class="section-eyebrow">{{ i18nT('libraryUi.getStarted') }}</span>
        <h2 class="state-empty-title">{{ i18nT('libraryUi.firstBook') }}</h2>
        <p class="state-empty-desc">
          {{ i18nT('libraryUi.firstBookDescription') }}
        </p>
      </div>
      <div class="state-empty-actions">
        <button type="button" class="quick-action quick-action--primary" @click="ctx.addBook">
          <span class="quick-action-icon">
            <i class="pi pi-plus" aria-hidden="true" />
          </span>
          <span class="quick-action-label">{{ i18nT('libraryUi.addBook') }}</span>
          <span class="quick-action-hint">{{ i18nT('libraryUi.manualHint') }}</span>
        </button>
        <button type="button" class="quick-action" @click="ctx.importBookFromWeb">
          <span class="quick-action-icon">
            <i class="pi pi-globe" aria-hidden="true" />
          </span>
          <span class="quick-action-label">{{ i18nT('libraryUi.importWeb') }}</span>
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

/* 表面底色/边框/过渡与基础 hover 见 tailwind.css 的 .recent-card, .quick-action 公共规则 */
.quick-action {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  column-gap: 0.85rem;
  row-gap: 0.15rem;
  padding: 0.95rem 1.05rem;
}

.quick-action:hover {
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
