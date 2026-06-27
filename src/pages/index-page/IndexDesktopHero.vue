<script setup lang="ts">
/**
 * 桌面首页「继续阅读」Hero 卡。从 IndexPageDesktop 抽出以降低其模板圈复杂度。
 * 自行注入 useIndexPage 与 ai-processing store。
 */
import { computed } from 'vue';
import Skeleton from 'primevue/skeleton';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { useAIProcessingStore } from 'src/stores/ai-processing';

const ctx = injectIndexPage();
const aiProcessing = useAIProcessingStore();

const hasActiveJob = computed(() => aiProcessing.hasActiveTasks);
const heroEyebrow = computed(() => (hasActiveJob.value ? 'ACTIVE JOB' : 'CONTINUE READING'));
const heroUpdatedAt = computed(() =>
  ctx.continueReadingBook.value
    ? ctx.formatDate(ctx.continueReadingBook.value.lastEdited)
    : '',
);
const onHeroCoverError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (ctx.continueReadingBook.value) target.src = ctx.getCoverUrl(ctx.continueReadingBook.value);
};
</script>

<template>
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
          @error="onHeroCoverError"
        />
      </div>

      <div class="continue-hero-body">
        <div class="continue-hero-eyebrow-row">
          <span class="continue-hero-eyebrow">{{ heroEyebrow }}</span>
          <span
            v-if="hasActiveJob"
            class="continue-hero-status continue-hero-status--active"
          >
            <i class="pi pi-spin pi-spinner" aria-hidden="true" />
            AI 正在处理
          </span>
          <span v-else class="continue-hero-status">更新于 {{ heroUpdatedAt }}</span>
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
</template>

<style scoped>
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
  border-color: var(--tsukuyomi-300-opacity-32);
  background: var(--tsukuyomi-opacity-12);
  color: var(--tsukuyomi-100);
}

.continue-hero-status--active .pi {
  color: var(--tsukuyomi-300);
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
  color: var(--color-warning-200);
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
  border: 1px solid var(--tsukuyomi-300-opacity-40);
  background: var(--tsukuyomi-opacity-18);
  color: var(--tsukuyomi-100);
  font-family: inherit;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.continue-hero-cta:hover {
  background: var(--tsukuyomi-opacity-28);
  border-color: var(--tsukuyomi-300-opacity-55);
  color: var(--tsukuyomi-50);
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
  .continue-hero-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .continue-hero-cover-wrap {
    width: min(9rem, 40%);
  }
}
</style>
