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

/* 文档正文样式抽到 ./doc-content.css，见文件底部 `<style scoped src>` */

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

<!-- 文档正文共享样式，scoped src 会重新作用到本组件作用域 -->
<style scoped src="./doc-content.css"></style>
