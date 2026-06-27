<script setup lang="ts">
import { computed } from 'vue';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import { APP_NAME } from 'src/constants/app';
import HelpMobileLanding from './HelpMobileLanding.vue';
import HelpMobileDrawers from './HelpMobileDrawers.vue';

const ctx = injectHelpPage();

// 把模板内的三元 / 比较 / && / 可选链收进脚本侧，降低段落认知与圈复杂度
const hasToc = computed(() => ctx.toc.value.length > 0);
const currentDocCategory = computed(() => ctx.currentDoc.value?.category);
const currentDocTitle = computed(() => ctx.currentDoc.value?.title);
const currentDocDescription = computed(() => ctx.currentDoc.value?.description);
</script>

<template>
  <div class="w-full h-full flex overflow-hidden relative">
    <main class="flex-1 h-full flex flex-col min-w-0">
      <!-- 手机端顶部工具栏 -->
      <div
        class="px-3 py-2 border-b border-white/10 flex items-center justify-between bg-night-900/30"
      >
        <button
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="ctx.showDocumentNavDrawer.value = true"
        >
          <i class="pi pi-bars mr-1" /> 文档
        </button>
        <button
          v-if="hasToc"
          class="px-3 py-1.5 rounded-lg text-sm bg-white/5 border border-white/10 text-moon/90"
          @click="ctx.showTocDrawer.value = true"
        >
          <i class="pi pi-list mr-1" /> 目录
        </button>
      </div>

      <!-- Loading State -->
      <div v-if="ctx.loading.value" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <i class="pi pi-spin pi-spinner text-3xl text-primary mb-4" />
          <p class="text-moon/60">加载文档中...</p>
        </div>
      </div>

      <!-- Error State -->
      <div v-else-if="ctx.error.value" class="flex-1 flex items-center justify-center">
        <div class="text-center p-8 bg-red-500/10 rounded-xl border border-red-500/20 max-w-md">
          <i class="pi pi-exclamation-triangle text-3xl text-red-400 mb-4" />
          <p class="text-red-300 mb-4">{{ ctx.error.value }}</p>
          <button
            class="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors"
            @click="ctx.loadDocumentIndex"
          >
            重试
          </button>
        </div>
      </div>

      <!-- 手机端 · 帮助中心落地页（未选中文档时显示，抽出到 HelpMobileLanding） -->
      <HelpMobileLanding v-else-if="!ctx.currentDoc.value" />

      <!-- Document Content -->
      <div v-else class="flex-1 h-full flex overflow-hidden">
        <div class="flex-1 h-full overflow-y-auto help-content-scroll">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <header class="mb-10">
              <div class="flex items-center gap-2 text-sm text-primary mb-3">
                <span>{{ currentDocCategory }}</span>
                <i class="pi pi-angle-right text-xs opacity-50" />
                <span>{{ currentDocTitle }}</span>
              </div>
              <h1
                class="font-display text-3xl font-semibold tracking-tight text-moon-100 leading-tight mb-4"
              >
                {{ currentDocTitle }}
              </h1>
              <p
                v-if="currentDocDescription"
                class="text-lg text-moon/70 leading-relaxed"
              >
                {{ currentDocDescription }}
              </p>
            </header>

            <article
              class="doc-content"
              v-html="ctx.content.value"
              @click="ctx.handleContentClick"
            />
          </div>
        </div>
      </div>
    </main>

    <!-- 文档抽屉 + TOC 抽屉（抽出到 HelpMobileDrawers） -->
    <HelpMobileDrawers />
  </div>
</template>

<style scoped>
/* Doc content markdown styles (same as Desktop) */
.doc-content {
  color: rgb(var(--moon-rgb) / 0.85);
  line-height: 1.75;
}

.doc-content :deep(p) {
  margin-bottom: 1.25rem;
}

.doc-content :deep(.doc-heading) {
  color: rgb(var(--moon-100-rgb));
  font-weight: 700;
  margin-top: 2.5rem;
  margin-bottom: 1rem;
  scroll-margin-top: 2rem;
}

.doc-content :deep(.doc-heading-1) {
  font-size: 2rem;
  line-height: 1.2;
  margin-top: 0;
}

.doc-content :deep(.doc-heading-2) {
  font-size: 1.5rem;
  line-height: 1.3;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid rgb(255 255 255 / 0.1);
}

.doc-content :deep(.doc-heading-3) {
  font-size: 1.25rem;
  line-height: 1.4;
}

.doc-content :deep(.doc-link) {
  color: rgb(var(--primary-rgb));
  text-decoration: none;
  font-weight: 500;
  transition: opacity 0.15s;
}

.doc-content :deep(.doc-link:hover) {
  text-decoration: underline;
  opacity: 0.85;
}

.doc-content :deep(code) {
  background: rgb(255 255 255 / 0.08);
  color: rgb(var(--primary-rgb));
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  font-size: 0.9em;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
}

.doc-content :deep(pre) {
  background: rgb(0 0 0 / 0.3);
  border: 1px solid rgb(255 255 255 / 0.1);
  border-radius: 0.5rem;
  padding: 1rem;
  overflow-x: auto;
  margin: 1.5rem 0;
}

.doc-content :deep(pre code) {
  background: none;
  padding: 0;
  color: rgb(var(--moon-rgb) / 0.9);
}

.doc-content :deep(blockquote) {
  border-left: 4px solid rgb(var(--primary-rgb));
  background: rgb(var(--primary-rgb) / 0.08);
  margin: 1.5rem 0;
  padding: 1rem 1.5rem;
  border-radius: 0 0.5rem 0.5rem 0;
}

.doc-content :deep(blockquote p:last-child) {
  margin-bottom: 0;
}

.doc-content :deep(ul),
.doc-content :deep(ol) {
  padding-left: 1.5rem;
  margin-bottom: 1.25rem;
}

.doc-content :deep(li) {
  margin-bottom: 0.5rem;
}

.doc-content :deep(ul li) {
  list-style-type: disc;
}

.doc-content :deep(ul li::marker) {
  color: rgb(var(--primary-rgb));
}

.doc-content :deep(ol li) {
  list-style-type: decimal;
}

.doc-content :deep(strong) {
  color: rgb(var(--moon-100-rgb));
  font-weight: 600;
}

.doc-content :deep(hr) {
  border: none;
  border-top: 1px solid rgb(255 255 255 / 0.1);
  margin: 2rem 0;
}

.doc-content :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 1.5rem 0;
}

.doc-content :deep(th),
.doc-content :deep(td) {
  border: 1px solid rgb(255 255 255 / 0.1);
  padding: 0.75rem 1rem;
  text-align: left;
}

.doc-content :deep(th) {
  background: rgb(255 255 255 / 0.05);
  font-weight: 600;
  color: rgb(var(--moon-100-rgb));
}

.doc-content :deep(img) {
  max-width: 100%;
  border-radius: 0.5rem;
  border: 1px solid rgb(255 255 255 / 0.1);
}

</style>
