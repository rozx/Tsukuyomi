<script setup lang="ts">
/**
 * 平板帮助页——横屏三栏（文档导航 + TOC + 正文），竖屏两个 overlay 抽屉。
 *
 * 参考 `BooksPageTablet` 的 dock 模式：横屏下 nav / TOC 参与 flex 布局；竖屏
 * 下它们变成绝对定位的抽屉，由顶部工具栏的「文档」/「目录」按钮切换。
 * 正文始终铺满剩余空间，避免在竖屏窄宽度下被三栏挤成一条。
 */
import { ref, watch } from 'vue';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import { isPortrait } from 'src/utils/device-orientation';

const ctx = injectHelpPage();

// 横屏默认 nav 展开、toc 展开即可（参与 flex）；竖屏默认都收起，让正文铺满。
const isNavOpen = ref(!isPortrait());
const isTocOpen = ref(false);

function toggleNav(): void {
  isNavOpen.value = !isNavOpen.value;
  if (isNavOpen.value && isPortrait()) isTocOpen.value = false;
}
function toggleToc(): void {
  isTocOpen.value = !isTocOpen.value;
  if (isTocOpen.value && isPortrait()) isNavOpen.value = false;
}

function selectDocument(doc: Parameters<typeof ctx.navigateToDocument>[0]): void {
  ctx.navigateToDocument(doc);
  if (isPortrait()) isNavOpen.value = false;
}

function selectHeading(id: string): void {
  ctx.scrollToHeading(id);
  if (isPortrait()) isTocOpen.value = false;
}

// 切换到没有 TOC 的文档时，自动关掉 TOC 抽屉
watch(
  () => ctx.toc.value.length,
  (len) => {
    if (len === 0) isTocOpen.value = false;
  },
);
</script>

<template>
  <div
    class="help-tablet w-full h-full flex min-h-0"
    :class="{ 'help-tablet--nav-open': isNavOpen, 'help-tablet--toc-open': isTocOpen }"
  >
    <!-- 竖屏 overlay 用的遮罩 -->
    <div
      v-if="isNavOpen"
      class="ht-scrim ht-scrim--nav"
      aria-hidden="true"
      @click="toggleNav"
    />
    <div
      v-if="isTocOpen"
      class="ht-scrim ht-scrim--toc"
      aria-hidden="true"
      @click="toggleToc"
    />

    <!-- 左：文档导航 -->
    <aside class="ht-nav">
      <header class="ht-nav-head">
        <div class="ht-nav-icon"><i class="pi pi-book" aria-hidden="true" /></div>
        <div>
          <h2 class="ht-nav-title">帮助中心</h2>
          <p class="ht-nav-sub">Documentation</p>
        </div>
      </header>
      <nav class="ht-nav-list">
        <div
          v-for="(docs, category) in ctx.groupedDocuments.value"
          :key="category"
          class="ht-nav-group"
        >
          <button
            class="ht-nav-category"
            @click="ctx.toggleCategory(category as string)"
          >
            <span>{{ category }}</span>
            <i
              class="pi"
              :class="
                ctx.expandedCategories.value.has(category as string)
                  ? 'pi-chevron-down'
                  : 'pi-chevron-right'
              "
              aria-hidden="true"
            />
          </button>
          <ul
            v-show="ctx.expandedCategories.value.has(category as string)"
            class="ht-nav-items"
          >
            <li v-for="doc in docs" :key="doc.id">
              <button
                class="ht-nav-item"
                :class="{ 'ht-nav-item--active': ctx.currentDoc.value?.id === doc.id }"
                @click="selectDocument(doc)"
              >
                {{ doc.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

    <!-- 中：正文 -->
    <main class="ht-main">
      <!-- 顶部工具栏：竖屏显示「文档 / 目录」切换按钮 + 面包屑；横屏隐藏 -->
      <div class="ht-toolbar">
        <button
          type="button"
          class="ht-toolbar-btn"
          :class="{ 'ht-toolbar-btn--active': isNavOpen }"
          :aria-pressed="isNavOpen"
          @click="toggleNav"
        >
          <i class="pi pi-bars" aria-hidden="true" />
          <span>文档</span>
        </button>
        <div v-if="ctx.currentDoc.value" class="ht-breadcrumb">
          <span>{{ ctx.currentDoc.value.category }}</span>
          <i class="pi pi-angle-right" aria-hidden="true" />
          <span class="ht-breadcrumb-title">{{ ctx.currentDoc.value.title }}</span>
        </div>
        <button
          v-if="ctx.toc.value.length > 0"
          type="button"
          class="ht-toolbar-btn"
          :class="{ 'ht-toolbar-btn--active': isTocOpen }"
          :aria-pressed="isTocOpen"
          @click="toggleToc"
        >
          <i class="pi pi-list" aria-hidden="true" />
          <span>目录</span>
        </button>
      </div>

      <!-- Loading / error / content -->
      <div v-if="ctx.loading.value" class="ht-state">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" />
        <p>加载文档中...</p>
      </div>

      <div v-else-if="ctx.error.value" class="ht-state ht-state--error">
        <i class="pi pi-exclamation-triangle" aria-hidden="true" />
        <p>{{ ctx.error.value }}</p>
        <button class="ht-state-retry" @click="ctx.loadDocumentIndex">重试</button>
      </div>

      <div v-else class="ht-content-scroll help-content-scroll">
        <div class="ht-content-inner">
          <header v-if="ctx.currentDoc.value" class="ht-doc-head">
            <div class="ht-doc-crumb">
              <span>{{ ctx.currentDoc.value.category }}</span>
              <i class="pi pi-angle-right" aria-hidden="true" />
              <span>{{ ctx.currentDoc.value.title }}</span>
            </div>
            <h1 class="ht-doc-title">{{ ctx.currentDoc.value.title }}</h1>
            <p v-if="ctx.currentDoc.value.description" class="ht-doc-desc">
              {{ ctx.currentDoc.value.description }}
            </p>
          </header>
          <article
            class="doc-content"
            v-html="ctx.content.value"
            @click="ctx.handleContentClick"
          />
        </div>
      </div>
    </main>

    <!-- 右：目录（TOC） -->
    <aside v-if="ctx.toc.value.length > 0" class="ht-toc">
      <header class="ht-toc-head">
        <i class="pi pi-list" aria-hidden="true" />
        <span>目录</span>
      </header>
      <nav class="ht-toc-list">
        <a
          v-for="item in ctx.toc.value"
          :key="item.id"
          :href="`#${item.id}`"
          class="ht-toc-item"
          :class="[
            ctx.activeHeading.value === item.id ? 'ht-toc-item--active' : '',
            item.level === 1 ? 'ht-toc-item--l1' : '',
            item.level === 2 ? 'ht-toc-item--l2' : '',
            item.level === 3 ? 'ht-toc-item--l3' : '',
            item.level === 4 ? 'ht-toc-item--l4' : '',
          ]"
          @click.prevent="selectHeading(item.id)"
        >
          {{ item.text }}
        </a>
      </nav>
    </aside>
  </div>
</template>

<style scoped>
.help-tablet {
  position: relative;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

/* ───────────── 通用遮罩（仅竖屏 overlay 时显示） ───────────── */
.ht-scrim {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  z-index: 15;
}

/* ───────────── 左侧导航 ───────────── */
.ht-nav {
  width: 260px;
  flex-shrink: 0;
  height: 100%;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(12, 14, 18, 0.65);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-right-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 横屏下 nav 始终常驻；竖屏再由下方 media query 接管开合逻辑 */

.ht-nav-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.ht-nav-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(109, 136, 168, 0.2);
  color: #a3b7cf;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.ht-nav-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 16px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  margin: 0;
}

.ht-nav-sub {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin: 2px 0 0;
  letter-spacing: 0.08em;
}

.ht-nav-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 18px;
}

.ht-nav-group {
  margin-bottom: 10px;
}

.ht-nav-category {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: transparent;
  border: none;
  color: rgba(247, 244, 236, 0.45);
  font-family: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-nav-category:hover {
  color: rgba(247, 244, 236, 0.75);
}

.ht-nav-category i {
  font-size: 10px;
  color: rgba(247, 244, 236, 0.3);
}

.ht-nav-items {
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ht-nav-item {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: none;
  border-left: 2px solid transparent;
  background: transparent;
  color: rgba(247, 244, 236, 0.8);
  font-family: inherit;
  font-size: 13px;
  border-radius: 8px;
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
}

.ht-nav-item--active {
  background: rgba(109, 136, 168, 0.2);
  border-left-color: #a3b7cf;
  color: #a3b7cf;
  font-weight: 500;
}

/* ───────────── 中间主区 ───────────── */
.ht-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ht-toolbar {
  display: none; /* 横屏隐藏；竖屏 media query 里 revive */
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  background: rgba(10, 12, 15, 0.4);
}

.ht-toolbar-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  color: rgba(247, 244, 236, 0.85);
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-toolbar-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgba(247, 244, 236, 1);
}

.ht-toolbar-btn--active {
  background: rgba(109, 136, 168, 0.18);
  border-color: rgba(109, 136, 168, 0.32);
  color: #a3b7cf;
}

.ht-toolbar-btn i {
  font-size: 11px;
}

.ht-breadcrumb {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  overflow: hidden;
}

.ht-breadcrumb i {
  font-size: 9px;
  opacity: 0.6;
}

.ht-breadcrumb-title {
  color: rgba(247, 244, 236, 0.9);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ht-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: rgba(247, 244, 236, 0.6);
}

.ht-state i {
  font-size: 28px;
  color: #a3b7cf;
}

.ht-state--error {
  padding: 20px;
}

.ht-state--error i {
  color: #f87171;
}

.ht-state-retry {
  padding: 8px 16px;
  background: rgba(248, 113, 113, 0.15);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}

.ht-content-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.ht-content-inner {
  max-width: 880px;
  margin: 0 auto;
  padding: 32px 36px 40px;
}

.ht-doc-head {
  margin-bottom: 28px;
}

.ht-doc-crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: rgba(163, 183, 207, 0.9);
  margin-bottom: 10px;
}

.ht-doc-crumb i {
  font-size: 9px;
  opacity: 0.6;
}

.ht-doc-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 28px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.01em;
  margin: 0 0 10px;
  line-height: 1.2;
}

.ht-doc-desc {
  font-size: 14px;
  color: rgba(247, 244, 236, 0.7);
  line-height: 1.65;
  margin: 0;
}

/* ───────────── 右侧 TOC ───────────── */
.ht-toc {
  width: 240px;
  flex-shrink: 0;
  height: 100%;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(10, 12, 15, 0.45);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-left-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* 横屏下 toc 始终常驻；竖屏再由下方 media query 接管开合逻辑 */

.ht-toc-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.5);
  flex-shrink: 0;
}

.ht-toc-head i {
  color: #a3b7cf;
  font-size: 12px;
}

.ht-toc-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.ht-toc-item {
  display: block;
  padding: 7px 10px;
  margin-bottom: 2px;
  border-radius: 8px;
  border-left: 2px solid transparent;
  color: rgba(247, 244, 236, 0.6);
  font-size: 12px;
  line-height: 1.4;
  text-decoration: none;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ht-toc-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 1);
  border-left-color: rgba(247, 244, 236, 0.2);
}

.ht-toc-item--active {
  color: #a3b7cf;
  background: rgba(109, 136, 168, 0.15);
  border-left-color: #a3b7cf;
  font-weight: 500;
}

.ht-toc-item--l1 {
  font-size: 13px;
  font-weight: 600;
}

.ht-toc-item--l2 {
  font-size: 12px;
  font-weight: 500;
  margin-left: 8px;
}

.ht-toc-item--l3 {
  font-size: 11px;
  margin-left: 20px;
  opacity: 0.9;
}

.ht-toc-item--l4 {
  font-size: 11px;
  margin-left: 28px;
  opacity: 0.75;
}

/* ───────────── 竖屏：nav / toc 变成 overlay 抽屉 ───────────── */
@media (orientation: portrait) {
  .ht-scrim {
    display: block;
  }

  /* 顶部工具栏仅在竖屏显示 */
  .ht-toolbar {
    display: flex;
  }

  /* nav：从左侧滑入 */
  .ht-nav {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 300px;
    max-width: 84%;
    z-index: 20;
    background: rgba(14, 16, 20, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
  }

  .help-tablet:not(.help-tablet--nav-open) .ht-nav {
    width: 300px;
    border-right-color: rgba(255, 255, 255, 0.08);
    transform: translateX(-100%);
  }

  .help-tablet:not(.help-tablet--nav-open) .ht-nav > * {
    opacity: 1;
    pointer-events: none;
  }

  /* toc：从右侧滑入 */
  .ht-toc {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 280px;
    max-width: 80%;
    z-index: 20;
    background: rgba(14, 16, 20, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: -12px 0 36px rgba(0, 0, 0, 0.55);
  }

  .help-tablet:not(.help-tablet--toc-open) .ht-toc {
    width: 280px;
    border-left-color: rgba(255, 255, 255, 0.08);
    transform: translateX(100%);
  }

  .help-tablet:not(.help-tablet--toc-open) .ht-toc > * {
    opacity: 1;
    pointer-events: none;
  }

  .ht-content-inner {
    padding: 24px 24px 36px;
  }

  .ht-doc-title {
    font-size: 24px;
  }
}

/* ───────────── 正文 Markdown 样式（与 Desktop / Mobile 保持一致） ───────────── */
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
