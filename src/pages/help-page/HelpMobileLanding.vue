<script setup lang="ts">
/**
 * 手机帮助页落地态（未选中文档时的品牌入口）。从 HelpPageMobile 抽出以降低其模板圈复杂度。
 */
import { APP_NAME } from 'src/constants/app';
import { injectHelpPage } from 'src/composables/help-page/useHelpPage';
import type { HelpDocument } from 'src/composables/help-page/useHelpPage';

const ctx = injectHelpPage();

const onTopicClick = (topic: { doc: HelpDocument | undefined }) => {
  if (topic.doc) ctx.navigateToDocument(topic.doc);
};
</script>

<template>
  <div class="mobile-help-landing flex-1 h-full overflow-y-auto">
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
          @click="onTopicClick(topic)"
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
</template>

<style scoped>
.mobile-help-landing {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  padding: 4px 0 32px;
}

.mhl-hero {
  margin: 12px 16px 20px;
  padding: 22px 18px 20px;
  background: linear-gradient(
    135deg,
    var(--tsukuyomi-opacity-18),
    var(--tsukuyomi-opacity-4) /* token: tsukuyomi-500 @ 4% */
  );
  border: 1px solid var(--tsukuyomi-opacity-30);
  border-radius: 16px;
  text-align: center;
  box-shadow: 0 2px 12px var(--tsukuyomi-opacity-20);
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
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
}

.mhl-hero-tagline {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  line-height: 1.35;
  margin-top: 6px;
}

.mhl-hero-tagline--accent {
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.mhl-hero-desc {
  font-size: 12px;
  color: var(--moon-50-opacity-70);
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
  color: var(--moon-50-opacity-55);
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
  border-bottom: 1px solid var(--white-opacity-6);
}

.mhl-step:last-child {
  border-bottom: none;
}

.mhl-step-num {
  width: 28px;
  height: 28px;
  border-radius: 9999px;
  background: var(--tsukuyomi-opacity-12);
  border: 1px solid var(--tsukuyomi-opacity-30);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
  color: var(--moon-50-opacity-100);
}

.mhl-step-desc {
  font-size: 12px;
  color: var(--moon-50-opacity-60);
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
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  color: var(--moon-50-opacity-100);
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
  background: var(--white-opacity-6);
  border-color: var(--tsukuyomi-opacity-30);
}

.mhl-topic i {
  color: var(--moon-50-opacity-55);
  font-size: 16px;
}

.mhl-all-docs {
  margin-top: 14px;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  color: var(--moon-50-opacity-90);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}

.mhl-all-docs i {
  color: var(--moon-50-opacity-55);
  font-size: 13px;
}

.mhl-all-docs-arrow {
  margin-left: auto;
  font-size: 11px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}
</style>
