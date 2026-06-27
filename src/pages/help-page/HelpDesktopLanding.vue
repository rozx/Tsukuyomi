<script setup lang="ts">
/**
 * 桌面帮助页落地态（未选中文档时的品牌化入口）。从 HelpPageDesktop 抽出以降低其模板圈复杂度。
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
  <div class="help-landing">
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
            @click="onTopicClick(topic)"
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
</template>

<style scoped>
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
  border-bottom: 1px solid var(--white-opacity-6);
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
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
  background: var(--shell-opacity-50); /* token: night-500 @ 50% */
  transition: border-color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.hld-step:hover {
  border-color: var(--tsukuyomi-300-opacity-22);
}

.hld-step-num {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
  border: 1px solid var(--white-opacity-8);
  border-radius: 10px;
  background: var(--shell-opacity-50); /* token: night-500 @ 50% */
  color: inherit;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.hld-topic:hover:not(:disabled) {
  border-color: var(--tsukuyomi-200-opacity-30); /* token: tsukuyomi-200 @ 30% */
  background: var(--tsukuyomi-200-opacity-5); /* token: tsukuyomi-200 @ 5% */
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
  background: var(--tsukuyomi-opacity-10);
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
  color: var(--accent-opacity-30); /* token: accent-silver @ 30% */
  font-style: italic;
}
</style>
