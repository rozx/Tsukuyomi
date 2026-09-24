<template>
  <div class="mobile-ai">
    <header class="ma-header">
      <div class="ma-heading">
        <h1>AI 模型</h1>
        <p>管理模型连接与默认任务</p>
      </div>
      <Button
        v-if="ctx.aiModels.value.length > 0"
        label="添加"
        icon="pi pi-plus"
        class="ma-header-add"
        aria-label="添加 AI 模型"
        @click="ctx.addModel"
      />
    </header>

    <div class="ma-scroll">
      <div v-if="ctx.isPageLoading.value" class="ma-loading" role="status">
        <ProgressSpinner
          class="ma-spinner"
          stroke-width="4"
          animation-duration=".8s"
          aria-label="加载中"
        />
        <span>正在加载 AI 模型…</span>
      </div>

      <div v-else-if="ctx.aiModels.value.length === 0" class="ma-welcome">
        <section class="ma-empty" aria-labelledby="ma-empty-title">
          <div class="ma-empty-icon" aria-hidden="true">
            <i class="pi pi-sparkles" />
          </div>
          <h2 id="ma-empty-title">连接你的第一个模型</h2>
          <p class="ma-empty-description">让月詠帮你翻译、校对，<br />也聊聊书里的故事。</p>
          <Button
            label="添加 AI 模型"
            icon="pi pi-plus"
            class="ma-empty-add"
            @click="ctx.addModel"
          />
          <p class="ma-supported">支持 OpenAI 兼容服务与 Google Gemini</p>
        </section>

        <section class="ma-guide" aria-labelledby="ma-guide-title">
          <h2 id="ma-guide-title">两步开始使用</h2>
          <ol>
            <li>
              <span class="ma-step" aria-hidden="true">1</span>
              <div>
                <h3>添加模型连接</h3>
                <p>准备好 API Key、模型标识和服务地址。</p>
              </div>
            </li>
            <li>
              <span class="ma-step" aria-hidden="true">2</span>
              <div>
                <h3>选择默认任务</h3>
                <p>翻译、校对与助手可以使用不同的模型。</p>
              </div>
            </li>
          </ol>
        </section>
      </div>

      <template v-else>
        <section class="ma-section" aria-labelledby="ma-models-title">
          <div class="ma-section-head">
            <h2 id="ma-models-title">我的模型</h2>
            <span class="ma-section-count">{{ ctx.aiModels.value.length }} 个</span>
          </div>
          <div class="ma-providers">
            <section
              v-for="group in ctx.providerGroups.value"
              :key="group.provider"
              class="ma-provider-card"
              :aria-label="group.label"
            >
              <div class="ma-provider-head">
                <span class="ma-provider-avatar" :style="{ color: group.color }" aria-hidden="true">
                  {{ group.letter }}
                </span>
                <div class="ma-provider-body">
                  <h3>{{ group.provider === 'openai' ? 'OpenAI 兼容' : group.label }}</h3>
                  <p>{{ group.models.length }} 个模型 · {{ group.enabledCount }} 个已启用</p>
                </div>
              </div>
              <div class="ma-provider-models">
                <button
                  v-for="model in group.models"
                  :key="model.id"
                  type="button"
                  class="ma-model-row"
                  :aria-label="`编辑模型 ${model.name}`"
                  @click="ctx.editModel(model)"
                >
                  <span class="ma-model-main">
                    <span class="ma-model-name">{{ model.name }}</span>
                    <span class="ma-model-meta" :title="model.model">{{ model.model }}</span>
                  </span>
                  <span :class="badgeClass(model)">{{ badgeText(model) }}</span>
                  <i class="pi pi-chevron-right ma-chevron" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>
        </section>

        <section class="ma-section" aria-labelledby="ma-routing-title">
          <div class="ma-section-head">
            <h2 id="ma-routing-title">任务默认模型</h2>
          </div>
          <p class="ma-section-description">为每种任务选择合适的模型。</p>
          <div class="ma-routing-card">
            <button
              v-for="row in ctx.taskRouting.value"
              :key="row.task"
              type="button"
              class="ma-routing-row"
              :aria-label="`编辑 ${row.label} 的默认模型`"
              @click="ctx.openTaskRoutingPicker(row.task)"
            >
              <span class="ma-routing-main">
                <span class="ma-routing-label">{{ row.label }}</span>
                <span class="ma-routing-value" :title="row.value">{{ row.value }}</span>
              </span>
              <i class="pi pi-chevron-right ma-chevron" aria-hidden="true" />
            </button>
          </div>
        </section>
      </template>

      <p class="ma-privacy">
        <i class="pi pi-lock" aria-hidden="true" />
        <span>使用自己的 API Key，密钥保存在本设备</span>
      </p>
    </div>

    <AIRoutingPickerSheet />
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';
import AIRoutingPickerSheet from './AIRoutingPickerSheet.vue';

const ctx = injectAIPage();

const badgeClass = (model: { enabled: boolean }) =>
  model.enabled ? 'ma-badge ma-badge--on' : 'ma-badge ma-badge--off';
const badgeText = (model: { enabled: boolean }) => (model.enabled ? '已启用' : '已禁用');
</script>

<style scoped>
.mobile-ai {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  color: var(--moon-50-opacity-100);
}

.ma-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-shrink: 0;
  padding: 24px 20px 12px;
}

.ma-heading {
  min-width: 0;
}

.ma-heading h1 {
  margin: 0;
  font-size: 27px;
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.03em;
}

.ma-heading p {
  margin: 6px 0 0;
  color: var(--moon-50-opacity-60);
  font-size: 13px;
  line-height: 1.5;
}

.ma-header-add {
  min-height: 44px;
  padding: 10px 14px;
  flex-shrink: 0;
  border-radius: 12px;
  font-size: 13px;
}

.ma-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 12px 20px 24px;
  scrollbar-width: none;
}

.ma-scroll::-webkit-scrollbar {
  display: none;
}

.ma-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 20px;
  min-height: 280px;
  font-size: 14px;
  color: var(--moon-50-opacity-65);
}

.ma-spinner {
  width: 36px;
  height: 36px;
}

.ma-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 28px 20px 20px;
  border: 1px solid var(--white-opacity-8);
  border-radius: 20px;
  background: var(--white-opacity-3);
  text-align: center;
}

.ma-empty-icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--white-opacity-10);
  border-radius: 16px;
  background: var(--white-opacity-4);
  color: var(--moon-50-opacity-90);
  font-size: 23px;
}

.ma-empty h2 {
  margin: 20px 0 8px;
  font-size: 20px;
  font-weight: 600;
  line-height: 1.4;
  letter-spacing: -0.02em;
  text-wrap: balance;
}

.ma-empty-description {
  margin: 0;
  color: var(--moon-50-opacity-65);
  font-size: 14px;
  line-height: 1.7;
}

.ma-empty-add {
  width: 100%;
  min-height: 48px;
  margin-top: 24px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

.ma-supported {
  margin: 14px 0 0;
  color: var(--moon-50-opacity-55);
  font-size: 11px;
  line-height: 1.6;
  text-wrap: balance;
}

.ma-guide {
  margin: 26px 4px 0;
}

.ma-guide h2,
.ma-section-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.ma-guide ol {
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.ma-guide li {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.ma-guide li + li {
  margin-top: 18px;
}

.ma-step {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border: 1px solid var(--white-opacity-12);
  border-radius: 50%;
  color: var(--moon-50-opacity-65);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.ma-guide h3 {
  margin: 2px 0 4px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.5;
}

.ma-guide li p {
  margin: 0;
  color: var(--moon-50-opacity-60);
  font-size: 12px;
  line-height: 1.7;
}

.ma-section + .ma-section {
  margin-top: 28px;
}

.ma-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.ma-section-count {
  font-size: 12px;
  color: var(--moon-50-opacity-60);
  font-variant-numeric: tabular-nums;
}

.ma-providers {
  display: grid;
  gap: 14px;
}

.ma-provider-card,
.ma-routing-card {
  overflow: hidden;
  border: 1px solid var(--white-opacity-8);
  border-radius: 16px;
  background: var(--white-opacity-3);
}

.ma-provider-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border-bottom: 1px solid var(--white-opacity-8);
}

.ma-provider-avatar {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: var(--white-opacity-4);
  font-size: 17px;
  font-weight: 600;
}

.ma-provider-body,
.ma-model-main,
.ma-routing-main {
  flex: 1;
  min-width: 0;
}

.ma-provider-body h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.5;
}

.ma-provider-body p {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--moon-50-opacity-60);
}

.ma-model-row,
.ma-routing-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  padding: 14px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
  transition: background-color 150ms ease;
  -webkit-tap-highlight-color: transparent;
}

.ma-model-row + .ma-model-row,
.ma-routing-row + .ma-routing-row {
  border-top: 1px solid var(--white-opacity-6);
}

.ma-model-row:active,
.ma-routing-row:active {
  background: var(--white-opacity-6);
}

.ma-model-row:focus-visible,
.ma-routing-row:focus-visible {
  outline: 2px solid var(--primary-200);
  outline-offset: -3px;
}

.ma-model-name,
.ma-model-meta,
.ma-routing-label,
.ma-routing-value {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-model-name,
.ma-routing-label {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
}

.ma-model-meta,
.ma-routing-value {
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.5;
  color: var(--moon-50-opacity-60);
}

.ma-model-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
}

.ma-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
  font-size: 11px;
  white-space: nowrap;
}

.ma-badge::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
}

.ma-badge--on {
  color: var(--color-success-300);
}

.ma-badge--off {
  color: var(--moon-50-opacity-50);
}

.ma-chevron {
  flex-shrink: 0;
  color: var(--moon-50-opacity-45);
  font-size: 11px;
}

.ma-section-description {
  margin: -4px 0 14px;
  color: var(--moon-50-opacity-60);
  font-size: 12px;
  line-height: 1.6;
}

.ma-privacy {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin: 28px 0 0;
  color: var(--moon-50-opacity-55);
  font-size: 11px;
  line-height: 1.6;
  text-wrap: balance;
}

.ma-privacy i {
  flex-shrink: 0;
  font-size: 11px;
}

@media (prefers-reduced-motion: reduce) {
  .ma-model-row,
  .ma-routing-row {
    transition: none;
  }
}
</style>
