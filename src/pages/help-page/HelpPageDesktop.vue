<script setup lang="ts">
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import { APP_NAME } from 'src/constants/app';

const ctx = injectHelpPage();
</script>

<template>
  <div class="help-desktop">
    <!-- 左侧：文档导航 -->
    <aside class="help-nav">
      <header class="help-nav-brand">
        <div class="help-nav-brand-icon">
          <i class="pi pi-book" aria-hidden="true" />
        </div>
        <div class="help-nav-brand-text">
          <span class="help-nav-brand-eyebrow">HELP CENTER</span>
          <span class="help-nav-brand-title">帮助中心</span>
        </div>
      </header>

      <nav class="help-nav-tree">
        <div
          v-for="(docs, category) in ctx.groupedDocuments.value"
          :key="category"
          class="help-nav-group"
        >
          <button
            type="button"
            class="help-nav-group-head"
            @click="ctx.toggleCategory(category as string)"
          >
            <span class="help-nav-group-label">{{ category }}</span>
            <i
              class="pi help-nav-group-chev"
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
            class="help-nav-group-list"
          >
            <li v-for="doc in docs" :key="doc.id">
              <button
                type="button"
                class="help-nav-item"
                :class="{
                  'help-nav-item--active': ctx.currentDoc.value?.id === doc.id,
                }"
                @click="ctx.navigateToDocument(doc)"
              >
                {{ doc.title }}
              </button>
            </li>
          </ul>
        </div>
      </nav>
    </aside>

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

      <!-- 桌面落地态：未选中文档时的品牌化入口 -->
      <div v-else-if="!ctx.currentDoc.value" class="help-landing">
        <div class="help-landing-scroll">
          <section class="hld-hero">
            <img :src="ctx.logoPath" :alt="APP_NAME.full" class="hld-hero-logo" />
            <div class="hld-hero-copy">
              <span class="hld-hero-eyebrow">{{ APP_NAME.en }} · {{ APP_NAME.zh }}</span>
              <h1 class="hld-hero-title">让每一次翻页，<span>都如月光般流畅。</span></h1>
              <p class="hld-hero-desc">
                专业的日本轻小说翻译工作台，面向 AI 协作翻译、校对润色、术语 /
                角色 / 记忆管理等连续工作场景设计。
              </p>
            </div>
          </section>

          <section class="hld-section">
            <div class="hld-section-head">
              <span class="hld-section-eyebrow">QUICK START</span>
              <h2 class="hld-section-title">快速开始</h2>
            </div>
            <ol class="hld-steps">
              <li v-for="step in ctx.quickStartSteps" :key="step.n" class="hld-step">
                <span class="hld-step-num">{{ step.n }}</span>
                <div class="hld-step-body">
                  <span class="hld-step-title">{{ step.t }}</span>
                  <span class="hld-step-desc">{{ step.d }}</span>
                </div>
              </li>
            </ol>
          </section>

          <section class="hld-section">
            <div class="hld-section-head">
              <span class="hld-section-eyebrow">TOPICS</span>
              <h2 class="hld-section-title">主题入口</h2>
            </div>
            <div class="hld-topics">
              <button
                v-for="topic in ctx.topicTiles.value"
                :key="topic.label"
                type="button"
                class="hld-topic"
                :disabled="!topic.doc"
                @click="topic.doc && ctx.navigateToDocument(topic.doc)"
              >
                <span class="hld-topic-icon">
                  <i :class="['pi', topic.icon]" aria-hidden="true" />
                </span>
                <span class="hld-topic-label">{{ topic.label }}</span>
                <span v-if="topic.doc" class="hld-topic-hint">
                  {{ topic.doc.title }}
                </span>
                <span v-else class="hld-topic-hint hld-topic-hint--muted">暂未收录</span>
              </button>
            </div>
          </section>
        </div>
      </div>

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
                  {{ ctx.currentDoc.value?.category }}
                </span>
              </div>
              <h1 class="help-article-title">{{ ctx.currentDoc.value?.title }}</h1>
              <p v-if="ctx.currentDoc.value?.description" class="help-article-desc">
                {{ ctx.currentDoc.value?.description }}
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

/* ──────── 左侧导航 ──────── */
.help-nav {
  width: 17rem;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
  background: rgba(10, 12, 15, 0.45);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.help-nav-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.95rem 1rem 0.85rem;
  border-bottom: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
  flex-shrink: 0;
}

.help-nav-brand-icon {
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 7px;
  background: rgba(109, 136, 168, 0.14);
  border: 1px solid rgba(109, 136, 168, 0.22);
  color: #a3b7cf;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.help-nav-brand-icon .pi {
  font-size: 1rem;
}

.help-nav-brand-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  min-width: 0;
}

.help-nav-brand-eyebrow {
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

.help-nav-brand-title {
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.help-nav-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.75rem 0.6rem 1rem;
}

.help-nav-group {
  margin-bottom: 0.5rem;
}

.help-nav-group-head {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 0.55rem;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--accent-silver);
  transition: color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.help-nav-group-head:hover {
  color: var(--moon-opacity-100);
}

.help-nav-group-label {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
}

.help-nav-group-chev {
  font-size: 0.55rem;
  opacity: 0.55;
}

.help-nav-group-list {
  list-style: none;
  margin: 0.2rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.help-nav-item {
  width: 100%;
  text-align: left;
  padding: 0.5rem 0.7rem;
  border-radius: 6px;
  border: 1px solid transparent;
  background: transparent;
  color: rgba(247, 244, 236, 0.72);
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
  line-height: 1.35;
}

.help-nav-item:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--moon-opacity-100);
}

.help-nav-item--active {
  background: rgba(186, 201, 219, 0.08);
  border-color: rgba(186, 201, 219, 0.22);
  color: var(--moon-opacity-100);
}

/* ──────── 主内容 ──────── */
.help-main {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: rgba(10, 12, 16, 0.35);
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
  color: #a3b7cf;
}

.help-state-text {
  font-size: 0.85rem;
}

.help-state-card {
  padding: 1.5rem 2rem;
  border: 1px solid rgba(239, 68, 68, 0.28);
  background: rgba(239, 68, 68, 0.08);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.85rem;
  max-width: 22rem;
}

.help-state-card-icon {
  font-size: 1.85rem;
  color: #fca5a5;
}

.help-state-card-msg {
  color: #fecaca;
  font-size: 0.85rem;
  text-align: center;
}

.help-state-card-retry {
  padding: 0.4rem 1rem;
  border-radius: 6px;
  background: rgba(239, 68, 68, 0.18);
  border: 1px solid rgba(239, 68, 68, 0.3);
  color: #fecaca;
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  transition: background 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.help-state-card-retry:hover {
  background: rgba(239, 68, 68, 0.28);
}

/* ──────── 落地态 ──────── */
.help-landing {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.help-landing-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2rem 2.25rem 3rem;
  max-width: 68rem;
  width: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 2.25rem;
}

.hld-hero {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 1.25rem;
  align-items: center;
  padding: 2.25rem 0 1.5rem;
  border-bottom: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
}

.hld-hero-logo {
  width: 4.25rem;
  height: 4.25rem;
  border-radius: 12px;
  opacity: 0.95;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}

.hld-hero-copy {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.hld-hero-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.66rem;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.hld-hero-title {
  margin: 0;
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: clamp(1.55rem, 1vw + 1.3rem, 2rem);
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.2;
  color: var(--moon-opacity-100);
}

.hld-hero-title span {
  color: #a3b7cf;
}

.hld-hero-desc {
  margin: 0.35rem 0 0;
  font-size: 0.88rem;
  line-height: 1.6;
  color: var(--moon-opacity-70);
  max-width: 42rem;
}

.hld-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.hld-section-head {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.hld-section-eyebrow {
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

.hld-section-title {
  margin: 0;
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: 1.1rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.hld-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 0.85rem;
}

.hld-step {
  display: flex;
  gap: 0.85rem;
  padding: 1rem 1.1rem;
  border: 1px solid var(--white-opacity-8, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: rgba(8, 10, 13, 0.5);
  transition: border-color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.hld-step:hover {
  border-color: rgba(186, 201, 219, 0.22);
}

.hld-step-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88rem;
  font-weight: 700;
  color: #a3b7cf;
  letter-spacing: 0.04em;
  flex-shrink: 0;
  width: 1.5rem;
}

.hld-step-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.hld-step-title {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.hld-step-desc {
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--moon-opacity-60);
}

.hld-topics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
  gap: 0.75rem;
}

.hld-topic {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 0.85rem;
  row-gap: 0.15rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--white-opacity-8, rgba(255, 255, 255, 0.08));
  border-radius: 10px;
  background: rgba(8, 10, 13, 0.5);
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.hld-topic:hover:not(:disabled) {
  border-color: rgba(186, 201, 219, 0.3);
  background: rgba(186, 201, 219, 0.05);
  transform: translateY(-1px);
}

.hld-topic:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.hld-topic-icon {
  grid-row: 1 / span 2;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 7px;
  background: rgba(109, 136, 168, 0.1);
  color: #a3b7cf;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.hld-topic-icon .pi {
  font-size: 0.95rem;
}

.hld-topic-label {
  grid-column: 2;
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
}

.hld-topic-hint {
  grid-column: 2;
  font-size: 0.72rem;
  color: var(--moon-opacity-55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hld-topic-hint--muted {
  color: rgba(174, 183, 198, 0.3);
  font-style: italic;
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
  border-right: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
  background: rgba(8, 10, 13, 0.35);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.help-toc-head {
  padding: 0.95rem 1rem 0.75rem;
  border-bottom: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
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
  background: rgba(255, 255, 255, 0.04);
  color: var(--moon-opacity-95);
}

.help-toc-item--active {
  background: rgba(186, 201, 219, 0.08);
  color: var(--moon-opacity-100);
  border-left-color: #a3b7cf;
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
  background: #a3b7cf;
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
  border-bottom: 1px solid var(--white-opacity-6, rgba(255, 255, 255, 0.06));
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
  background: var(--white-opacity-12, rgba(255, 255, 255, 0.12));
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
