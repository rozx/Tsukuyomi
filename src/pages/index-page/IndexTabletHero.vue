<script setup lang="ts">
/**
 * 平板首页「继续阅读 / 活跃任务」Hero 卡片区。从 IndexPageTablet 抽出以降低其模板圈复杂度。
 * 自行注入 useIndexPage 与 ai-processing store。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import { injectIndexPage } from 'src/composables/index-page/useIndexPage';
import { useAIProcessingStore } from 'src/stores/ai-processing';

const ctx = injectIndexPage();
const aiProcessing = useAIProcessingStore();
const hasActiveJob = computed(() => aiProcessing.hasActiveTasks);
</script>

<template>
  <section
    v-if="ctx.continueReadingBook.value"
    class="th-hero-grid"
    :class="{ 'th-hero-grid--single': !hasActiveJob }"
  >
    <!-- 活跃任务卡 —— 仅当有任务时渲染 -->
    <article v-if="hasActiveJob" class="th-hero-card th-hero-card--active">
      <header class="th-hero-card-head">
        <i class="pi pi-spin pi-spinner th-hero-card-status-icon" aria-hidden="true" />
        <span class="th-hero-card-status">正在翻译</span>
      </header>
      <div class="th-hero-card-title">
        {{ ctx.continueReadingBook.value.title }}
      </div>
      <div v-if="ctx.continueReadingBook.value.author" class="th-hero-card-meta">
        {{ ctx.continueReadingBook.value.author }}
      </div>
      <div class="th-hero-card-actions">
        <Button
          label="查看进度"
          icon="pi pi-external-link"
          class="p-button-primary p-button-sm"
          @click="ctx.navigateToBookDetails(ctx.continueReadingBook.value!)"
        />
      </div>
    </article>

    <!-- 继续阅读卡 -->
    <article class="th-hero-card">
      <header class="th-hero-card-head">
        <span class="th-hero-card-kicker">继续阅读</span>
      </header>
      <div class="th-hero-card-title">{{ ctx.continueReadingBook.value.title }}</div>
      <div v-if="ctx.continueReadingBook.value.author" class="th-hero-card-meta">
        {{ ctx.continueReadingBook.value.author }}
      </div>
      <div class="th-hero-card-subline">
        <span>{{ ctx.getTotalChapters(ctx.continueReadingBook.value) }} 章</span>
        <span class="th-dot">·</span>
        <span>更新于 {{ ctx.formatDate(ctx.continueReadingBook.value.lastEdited) }}</span>
      </div>
      <div class="th-hero-card-actions">
        <Button
          label="继续翻译"
          icon="pi pi-play"
          class="p-button-primary p-button-sm"
          @click="ctx.navigateToBookDetails(ctx.continueReadingBook.value!)"
        />
      </div>
    </article>
  </section>
</template>

<style scoped>
.th-hero-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 16px;
}

.th-hero-grid--single {
  grid-template-columns: minmax(0, 1fr);
}

.th-hero-card {
  padding: 18px 20px;
  background: var(--white-opacity-2-5); /* token: white @ 2.5% — not tokenized */
  border: 1px solid var(--white-opacity-8);
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 160px;
}

.th-hero-card--active {
  background: linear-gradient(135deg, var(--tsukuyomi-opacity-18), var(--tsukuyomi-opacity-4));
  border-color: var(--tsukuyomi-opacity-30);
}

.th-hero-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.th-hero-card-status-icon {
  color: var(--tsukuyomi-300);
  font-size: 13px;
}

.th-hero-card-status {
  font-size: 11px;
  font-weight: 500;
  color: var(--tsukuyomi-200);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.th-hero-card-kicker {
  font-size: 11px;
  font-weight: 500;
  color: var(--moon-50-opacity-55);
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.th-hero-card-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 17px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
}

.th-hero-card-meta {
  font-size: 12px;
  color: var(--moon-50-opacity-60);
}

.th-hero-card-subline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
}

.th-hero-card-actions {
  display: flex;
  gap: 8px;
  margin-top: auto;
}

.th-dot {
  opacity: 0.5;
}
</style>
