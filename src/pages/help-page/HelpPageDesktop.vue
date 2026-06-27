<script setup lang="ts">
import { computed } from 'vue';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import HelpDesktopNav from './HelpDesktopNav.vue';
import HelpDesktopLanding from './HelpDesktopLanding.vue';

const ctx = injectHelpPage();

// 把 currentDoc 的可选链收进脚本侧，降低模板圈复杂度
const currentDocCategory = computed(() => ctx.currentDoc.value?.category);
const currentDocTitle = computed(() => ctx.currentDoc.value?.title);
const currentDocDescription = computed(() => ctx.currentDoc.value?.description);
</script>

<template>
  <div class="help-desktop">
    <!-- 左侧：文档导航（抽出到 HelpDesktopNav） -->
    <HelpDesktopNav />

    <!-- 右侧主内容 -->
    <main class="help-main">
      <!-- Loading -->
      <div v-if="ctx.loading.value" class="help-state">
        <i class="pi pi-spin pi-spinner help-state-icon" aria-hidden="true" />
        <p class="help-state-text">加载文档中...</p>
      </div>

      <!-- Error -->
      <div v-else-if="ctx.error.value" class="help-state">
        <div class="help-state-card">
          <i class="pi pi-exclamation-triangle help-state-card-icon" aria-hidden="true" />
          <p class="help-state-card-msg">{{ ctx.error.value }}</p>
          <button type="button" class="help-state-card-retry" @click="ctx.loadDocumentIndex">
            重试
          </button>
        </div>
      </div>

      <!-- 桌面落地态：未选中文档时的品牌化入口（抽出到 HelpDesktopLanding） -->
      <HelpDesktopLanding v-else-if="!ctx.currentDoc.value" />

      <!-- 文档阅读态：TOC + 正文 -->
      <div v-else class="help-reader">
        <aside v-if="ctx.toc.value.length > 0" class="help-toc">
          <header class="help-toc-head">
            <span class="help-toc-eyebrow">TABLE OF CONTENTS</span>
            <h3 class="help-toc-title">目录</h3>
          </header>
          <nav class="help-toc-body">
            <a
              v-for="item in ctx.toc.value"
              :key="item.id"
              :href="`#${item.id}`"
              class="help-toc-item"
              :class="[
                `help-toc-item--l${item.level}`,
                {
                  'help-toc-item--active': ctx.activeHeading.value === item.id,
                },
              ]"
              @click.prevent="ctx.scrollToHeading(item.id)"
            >
              <span class="help-toc-item-dot" aria-hidden="true" />
              <span class="help-toc-item-label">{{ item.text }}</span>
            </a>
          </nav>
        </aside>

        <div class="help-article-scroll help-content-scroll">
          <article class="help-article">
            <header class="help-article-head">
              <div class="help-article-crumbs">
                <span class="help-article-crumb-eyebrow">HELP</span>
                <span class="help-article-crumb-sep" aria-hidden="true" />
                <span class="help-article-crumb-category">
                  {{ currentDocCategory }}
                </span>
              </div>
              <h1 class="help-article-title">{{ currentDocTitle }}</h1>
              <p v-if="currentDocDescription" class="help-article-desc">
                {{ currentDocDescription }}
              </p>
            </header>

            <div class="doc-content" v-html="ctx.content.value" @click="ctx.handleContentClick" />
          </article>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
.help-desktop {
  width: 100%;
  height: 100%;
  display: flex;
  overflow: hidden;
  position: relative;
}

/* ──────── 主内容 ──────── */
.help-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(10, 12, 16, 0.35); /* token: night-500 @ 35% */
}

.help-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  color: var(--moon-opacity-60);
}

.help-state-icon {
  font-size: 2rem;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.help-state-text {
  font-size: 0.85rem;
}

.help-state-card {
  padding: 1.5rem 2rem;
  border: 1px solid var(--red-500-opacity-28); /* token: red-500 @ 28% */
  background: var(--red-500-opacity-8); /* token: red-500 @ 8% */
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  max-width: 22rem;
}

.help-state-card-icon {
  font-size: 1.85rem;
  color: var(--color-danger-300); /* token: danger-300 */
}

.help-state-card-msg {
  color: var(--color-danger-200); /* token: danger-200 */
  font-size: 0.85rem;
  text-align: center;
}

.help-state-card-retry {
  padding: 0.4rem 1rem;
  border-radius: 6px;
  background: var(--red-500-opacity-18); /* token: red-500 @ 18% */
  border: 1px solid var(--red-500-opacity-30); /* token: red-500 @ 30% */
  color: var(--color-danger-200); /* token: danger-200 */
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.help-state-card-retry:hover {
  background: var(--red-500-opacity-28); /* token: red-500 @ 28% */
}

/* ──────── 阅读态 ──────── */
.help-reader {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.help-toc {
  width: 15rem;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-6);
  background: rgba(8, 10, 13, 0.35); /* token: night-500 @ 35% */
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.help-toc-head {
  padding: 0.95rem 1rem 0.75rem;
  border-bottom: 1px solid var(--white-opacity-6);
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.help-toc-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.help-toc-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.help-toc-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.6rem 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.help-toc-item {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.4rem 0.55rem;
  border-radius: 6px;
  font-size: 0.8rem;
  color: var(--moon-opacity-55);
  text-decoration: none;
  line-height: 1.4;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 2px solid transparent;
}

.help-toc-item:hover {
  background: var(--white-opacity-4);
  color: var(--moon-opacity-95);
}

.help-toc-item--active {
  background: var(--tsukuyomi-200-opacity-8); /* token: tsukuyomi-200 @ 8% */
  color: var(--moon-opacity-100);
  border-left-color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.help-toc-item-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.5;
  flex-shrink: 0;
}

.help-toc-item--active .help-toc-item-dot {
  opacity: 1;
  background: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.help-toc-item--l1 {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--moon-opacity-75);
}

.help-toc-item--l2 {
  padding-left: 1rem;
}

.help-toc-item--l3 {
  padding-left: 1.5rem;
  font-size: 0.75rem;
}

.help-toc-item--l4 {
  padding-left: 2rem;
  font-size: 0.72rem;
  opacity: 0.85;
}

.help-toc-item--l2 .help-toc-item-dot,
.help-toc-item--l3 .help-toc-item-dot,
.help-toc-item--l4 .help-toc-item-dot {
  display: none;
}

.help-article-scroll {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
}

.help-article {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2rem 2.25rem 3rem;
}

.help-article-head {
  margin-bottom: 2.25rem;
  padding-bottom: 1.25rem;
  border-bottom: 1px solid var(--white-opacity-6);
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}

.help-article-crumbs {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.help-article-crumb-eyebrow {
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

.help-article-crumb-sep {
  width: 1px;
  height: 0.7rem;
  background: var(--white-opacity-12);
}

.help-article-crumb-category {
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--moon-opacity-60);
  letter-spacing: 0.02em;
}

.help-article-title {
  margin: 0;
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: clamp(1.6rem, 1vw + 1.35rem, 2.15rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--moon-opacity-100);
}

.help-article-desc {
  margin: 0;
  font-size: 0.95rem;
  line-height: 1.65;
  color: var(--moon-opacity-70);
  max-width: 44rem;
}

/* ──────── 文档正文样式（保持与之前一致） ──────── */
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

@media (max-width: 1180px) {
  .help-toc {
    width: 13rem;
  }
}

@media (max-width: 1040px) {
  .help-toc {
    display: none;
  }
}
</style>
