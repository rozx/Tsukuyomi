<script setup lang="ts">
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import { injectAIPage } from 'src/composables/ai-page/useAIPage';

const ctx = injectAIPage();
</script>

<template>
  <div class="mobile-ai w-full h-full flex flex-col">
    <header class="ma-largetitle">
      <div class="ma-eyebrow">AI MODELS</div>
      <h1 class="ma-title">AI 模型</h1>
    </header>

    <div class="ma-byok">
      <i class="pi pi-shield" aria-hidden="true" />
      <span>BYOK · 密钥仅存储在本设备。</span>
    </div>

    <div v-if="ctx.isPageLoading.value" class="ma-state">
      <ProgressSpinner
        style="width: 36px; height: 36px"
        stroke-width="4"
        animation-duration=".8s"
        aria-label="加载中"
      />
      <span>正在加载 AI 模型…</span>
    </div>

    <div v-else-if="ctx.aiModels.value.length === 0" class="ma-state">
      <i class="pi pi-sparkles ma-state-icon" aria-hidden="true" />
      <span class="ma-state-title">暂无配置的 AI 模型</span>
      <Button
        label="添加第一个 AI 模型"
        icon="pi pi-plus"
        class="p-button-primary"
        @click="ctx.addModel"
      />
    </div>

    <div v-else class="ma-scroll">
      <section class="ma-section">
        <div class="ma-section-head">
          <span class="ma-section-title">提供商</span>
          <button class="ma-add-btn" @click="ctx.addModel">
            <i class="pi pi-plus" aria-hidden="true" /> 添加
          </button>
        </div>
        <div class="ma-providers">
          <div
            v-for="group in ctx.providerGroups.value"
            :key="group.provider"
            class="ma-provider-card"
          >
            <div class="ma-provider-head">
              <div
                class="ma-provider-avatar"
                :style="{
                  background: `${group.color}22`,
                  color: group.color,
                  borderColor: `${group.color}55`,
                }"
              >
                {{ group.letter }}
              </div>
              <div class="ma-provider-body">
                <div class="ma-provider-name">{{ group.label }}</div>
                <div class="ma-provider-sub">
                  {{ group.models.length }} 个模型 · 已启用 {{ group.enabledCount }}
                </div>
              </div>
            </div>
            <div class="ma-provider-models">
              <div
                v-for="model in group.models"
                :key="model.id"
                class="ma-model-row"
                role="button"
                @click="ctx.editModel(model)"
              >
                <div class="ma-model-main">
                  <div class="ma-model-name">{{ model.name }}</div>
                  <div class="ma-model-meta">{{ model.model }}</div>
                </div>
                <span class="ma-badge" :class="model.enabled ? 'ma-badge--on' : 'ma-badge--off'">
                  {{ model.enabled ? '已启用' : '已禁用' }}
                </span>
                <i class="pi pi-chevron-right ma-chev" aria-hidden="true" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="ma-section ma-section--last">
        <div class="ma-section-head">
          <span class="ma-section-title">任务路由</span>
        </div>
        <div class="ma-routing-card">
          <div
            v-for="(row, idx) in ctx.taskRouting.value"
            :key="row.label"
            class="ma-routing-row"
            :class="{ 'ma-routing-row--last': idx === ctx.taskRouting.value.length - 1 }"
          >
            <span class="ma-routing-label">{{ row.label }}</span>
            <span
              class="ma-routing-value"
              :class="{ 'ma-routing-value--unset': row.value === '未配置' }"
            >
              <i class="pi pi-sparkles" aria-hidden="true" /> {{ row.value }}
            </span>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.mobile-ai {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.ma-largetitle {
  padding: 16px 20px 6px;
  flex-shrink: 0;
}

.ma-eyebrow {
  font-weight: 500;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.ma-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.02em;
  margin: 0;
}

.ma-byok {
  margin: 10px 20px 0;
  padding: 10px 12px;
  background: rgba(109, 136, 168, 0.08);
  border: 1px solid rgba(109, 136, 168, 0.25);
  border-radius: 10px;
  font-size: 12px;
  color: #bac9db;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ma-byok i {
  font-size: 13px;
}

.ma-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.ma-scroll::-webkit-scrollbar {
  width: 0;
}

.ma-section {
  padding: 16px 20px 0;
}

.ma-section--last {
  padding-bottom: 24px;
}

.ma-section-head {
  display: flex;
  align-items: center;
  margin-bottom: 10px;
}

.ma-section-title {
  font-size: 13px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.ma-add-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  color: #a3b7cf;
  background: rgba(109, 136, 168, 0.12);
  border: 1px solid rgba(109, 136, 168, 0.3);
  border-radius: 7px;
  cursor: pointer;
}

.ma-add-btn i {
  font-size: 10px;
}

.ma-providers {
  display: grid;
  gap: 12px;
}

.ma-provider-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  overflow: hidden;
}

.ma-provider-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ma-provider-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-weight: 700;
  font-size: 16px;
  border: 1px solid;
  flex-shrink: 0;
}

.ma-provider-body {
  flex: 1;
  min-width: 0;
}

.ma-provider-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
}

.ma-provider-sub {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
}

.ma-provider-models {
  display: flex;
  flex-direction: column;
}

.ma-model-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ma-model-row:last-child {
  border-bottom: none;
}

.ma-model-row:active {
  background: rgba(255, 255, 255, 0.03);
}

.ma-model-main {
  flex: 1;
  min-width: 0;
}

.ma-model-name {
  font-size: 13px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-model-meta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(247, 244, 236, 0.55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ma-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  border: 1px solid;
  white-space: nowrap;
}

.ma-badge--on {
  background: rgba(127, 179, 137, 0.12);
  color: #a7d1b0;
  border-color: rgba(127, 179, 137, 0.3);
}

.ma-badge--off {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
}

.ma-chev {
  color: rgba(247, 244, 236, 0.35);
  font-size: 11px;
}

.ma-routing-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 4px 14px;
}

.ma-routing-row {
  display: flex;
  align-items: center;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.ma-routing-row--last {
  border-bottom: none;
}

.ma-routing-label {
  font-size: 12px;
  color: rgba(247, 244, 236, 0.85);
  flex: 1;
}

.ma-routing-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 9999px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(109, 136, 168, 0.15);
  color: #bac9db;
  border: 1px solid rgba(109, 136, 168, 0.3);
}

.ma-routing-value--unset {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 0.55);
  border-color: rgba(255, 255, 255, 0.1);
}

.ma-routing-value i {
  font-size: 9px;
  opacity: 0.85;
}

.ma-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 20px;
  text-align: center;
  color: rgba(247, 244, 236, 0.6);
  font-size: 13px;
}

.ma-state-icon {
  font-size: 42px;
  color: rgba(247, 244, 236, 0.25);
}

.ma-state-title {
  font-size: 14px;
  color: rgba(247, 244, 236, 0.7);
}
</style>
