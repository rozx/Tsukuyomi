<script setup lang="ts">
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import { APP_NAME } from 'src/constants/app';

const ctx = injectHelpPage();
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
          v-if="ctx.toc.value.length > 0"
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

      <!-- 手机端 · 帮助中心落地页（未选中文档时显示） -->
      <div
        v-else-if="!ctx.currentDoc.value"
        class="mobile-help-landing flex-1 h-full overflow-y-auto"
      >
        <section class="mhl-hero">
          <img :src="ctx.logoPath" :alt="APP_NAME.full" class="mhl-hero-logo" />
          <div class="mhl-hero-brand">TSUKUYOMI 月詠</div>
          <div class="mhl-hero-tagline">让每一次翻页，</div>
          <div class="mhl-hero-tagline mhl-hero-tagline--accent">都如月光般流畅。</div>
          <p class="mhl-hero-desc">
            专业的日本小说翻译工具，支持 AI 翻译、校对润色、术语管理等功能。
          </p>
        </section>

        <section class="mhl-section">
          <div class="mhl-section-title">快速开始</div>
          <div class="mhl-steps">
            <div v-for="step in ctx.quickStartSteps" :key="step.n" class="mhl-step">
              <div class="mhl-step-num">{{ step.n }}</div>
              <div class="mhl-step-body">
                <div class="mhl-step-title">{{ step.t }}</div>
                <div class="mhl-step-desc">{{ step.d }}</div>
              </div>
            </div>
          </div>
        </section>

        <section class="mhl-section mhl-section--last">
          <div class="mhl-section-title">主题</div>
          <div class="mhl-topics">
            <button
              v-for="topic in ctx.topicTiles.value"
              :key="topic.label"
              class="mhl-topic"
              :disabled="!topic.doc"
              @click="topic.doc && ctx.navigateToDocument(topic.doc)"
            >
              <i :class="['pi', topic.icon]" aria-hidden="true" />
              <span>{{ topic.label }}</span>
            </button>
          </div>

          <button class="mhl-all-docs" @click="ctx.showDocumentNavDrawer.value = true">
            <i class="pi pi-bars" aria-hidden="true" />
            <span>查看所有文档</span>
            <i class="pi pi-arrow-right mhl-all-docs-arrow" aria-hidden="true" />
          </button>
        </section>
      </div>

      <!-- Document Content -->
      <div v-else class="flex-1 h-full flex overflow-hidden">
        <div class="flex-1 h-full overflow-y-auto help-content-scroll">
          <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
            <header class="mb-10">
              <div class="flex items-center gap-2 text-sm text-primary mb-3">
                <span>{{ ctx.currentDoc.value?.category }}</span>
                <i class="pi pi-angle-right text-xs opacity-50" />
                <span>{{ ctx.currentDoc.value?.title }}</span>
              </div>
              <h1 class="text-3xl font-bold text-moon-100 mb-4">
                {{ ctx.currentDoc.value?.title }}
              </h1>
              <p
                v-if="ctx.currentDoc.value?.description"
                class="text-lg text-moon/70 leading-relaxed"
              >
                {{ ctx.currentDoc.value?.description }}
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

    <!-- 文档抽屉 -->
    <div
      v-if="ctx.showDocumentNavDrawer.value"
      class="absolute inset-0 z-40 bg-black/45"
      @click="ctx.showDocumentNavDrawer.value = false"
    />
    <aside
      class="absolute top-0 left-0 bottom-0 z-50 w-[82vw] max-w-[20rem] border-r border-white/10 flex flex-col bg-night-900/95 transition-transform duration-200"
      :class="ctx.showDocumentNavDrawer.value ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="p-4 border-b border-white/10 flex-shrink-0 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="pi pi-book text-primary" />
          <span class="text-sm font-semibold text-moon-100">帮助文档</span>
        </div>
        <button class="text-moon/70" @click="ctx.showDocumentNavDrawer.value = false">
          <i class="pi pi-times" />
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto p-3 space-y-1">
        <div v-for="(docs, category) in ctx.groupedDocuments.value" :key="category" class="mb-3">
          <button
            class="w-full flex items-center justify-between px-2 py-1.5 transition-colors group"
            @click="ctx.toggleCategory(category as string)"
          >
            <h3
              class="text-[10px] font-bold text-moon/40 uppercase tracking-widest group-hover:text-moon/60 transition-colors"
            >
              {{ category }}
            </h3>
            <i
              class="pi text-moon/30 text-[10px] transition-transform duration-200"
              :class="
                ctx.expandedCategories.value.has(category as string)
                  ? 'pi-chevron-down'
                  : 'pi-chevron-right'
              "
            />
          </button>
          <ul
            v-show="ctx.expandedCategories.value.has(category as string)"
            class="space-y-0.5 mt-1.5"
          >
            <li v-for="doc in docs" :key="doc.id">
              <button
                class="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200 border-l-2"
                :class="
                  ctx.currentDoc.value?.id === doc.id
                    ? 'bg-primary/20 text-primary font-medium border-primary shadow-sm'
                    : 'text-moon/80 hover:bg-white/5 hover:text-moon-100 border-transparent hover:border-moon/20'
                "
                @click="ctx.navigateToDocument(doc)"
              >
                {{ doc.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

    <!-- TOC 抽屉 -->
    <div
      v-if="ctx.showTocDrawer.value && ctx.toc.value.length > 0"
      class="absolute inset-0 z-40 bg-black/45"
      @click="ctx.showTocDrawer.value = false"
    />
    <aside
      v-if="ctx.toc.value.length > 0"
      class="absolute top-0 right-0 bottom-0 z-50 w-[80vw] max-w-[20rem] border-l border-white/10 bg-night-900/95 flex flex-col transition-transform duration-200"
      :class="ctx.showTocDrawer.value ? 'translate-x-0' : 'translate-x-full'"
    >
      <div class="p-4 border-b border-white/10 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <i class="pi pi-list text-primary" />
          <span class="text-sm font-semibold text-moon-100">目录</span>
        </div>
        <button class="text-moon/70" @click="ctx.showTocDrawer.value = false">
          <i class="pi pi-times" />
        </button>
      </div>
      <nav class="flex-1 overflow-y-auto p-4 space-y-1">
        <a
          v-for="item in ctx.toc.value"
          :key="item.id"
          :href="`#${item.id}`"
          class="block py-2 px-3 rounded-lg transition-all duration-200 border-l-2"
          :class="[
            ctx.activeHeading.value === item.id
              ? 'text-primary border-primary bg-primary/10 font-medium'
              : 'text-moon/60 border-transparent hover:text-moon-100 hover:bg-white/5 hover:border-moon/20',
            item.level === 1 ? 'text-base font-semibold' : '',
            item.level === 2 ? 'text-sm font-medium ml-2' : '',
            item.level === 3 ? 'text-xs ml-6 opacity-90' : '',
            item.level === 4 ? 'text-xs ml-8 opacity-75' : '',
          ]"
          @click.prevent="ctx.scrollToHeading(item.id)"
        >
          {{ item.text }}
        </a>
      </nav>
    </aside>
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

/* ───────────────── 手机端 · 帮助中心落地页 ───────────────── */
.mobile-help-landing {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  padding: 4px 0 32px;
}

.mhl-hero {
  margin: 12px 16px 20px;
  padding: 22px 18px 20px;
  background: linear-gradient(135deg, rgba(109, 136, 168, 0.18), rgba(109, 136, 168, 0.04));
  border: 1px solid rgba(109, 136, 168, 0.3);
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 2px 12px rgba(109, 136, 168, 0.2);
}

.mhl-hero-logo {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
}

.mhl-hero-brand {
  font-weight: 300;
  font-size: 10px;
  letter-spacing: 0.3em;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
}

.mhl-hero-tagline {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  line-height: 1.35;
  margin-top: 6px;
}

.mhl-hero-tagline--accent {
  color: #a3b7cf;
}

.mhl-hero-desc {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.7);
  line-height: 1.65;
  margin: 10px auto 0;
  max-width: 300px;
}

.mhl-section {
  padding: 0 20px;
  margin-top: 18px;
}

.mhl-section--last {
  margin-top: 22px;
}

.mhl-section-title {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 500;
  margin-bottom: 10px;
}

.mhl-steps {
  display: flex;
  flex-direction: column;
}

.mhl-step {
  display: flex;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.mhl-step:last-child {
  border-bottom: none;
}

.mhl-step-num {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: rgba(109, 136, 168, 0.12);
  border: 1px solid rgba(109, 136, 168, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: #a3b7cf;
  font-weight: 600;
  flex-shrink: 0;
}

.mhl-step-body {
  flex: 1;
  min-width: 0;
}

.mhl-step-title {
  font-size: 13px;
  font-weight: 500;
  color: rgba(247, 244, 236, 1);
}

.mhl-step-desc {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.6);
  margin-top: 2px;
  line-height: 1.55;
}

.mhl-topics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mhl-topic {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: rgba(247, 244, 236, 1);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.mhl-topic:active {
  transform: scale(0.98);
}

.mhl-topic:disabled {
  opacity: 0.45;
  cursor: default;
}

.mhl-topic:not(:disabled):hover {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(109, 136, 168, 0.3);
}

.mhl-topic i {
  color: rgba(247, 244, 236, 0.55);
  font-size: 16px;
}

.mhl-all-docs {
  margin-top: 14px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  color: rgba(247, 244, 236, 0.9);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.mhl-all-docs i {
  color: rgba(247, 244, 236, 0.55);
  font-size: 13px;
}

.mhl-all-docs-arrow {
  margin-left: auto;
  font-size: 11px;
  color: #a3b7cf;
}
</style>
