<script setup lang="ts">
import { injectSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import AIModelSettingsTab from 'src/components/settings/AIModelSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';
import ApiKeysSettingsTab from 'src/components/settings/ApiKeysSettingsTab.vue';
import SyncSettingsTab from 'src/components/settings/SyncSettingsTab.vue';
import ScraperSettingsTab from 'src/components/settings/ScraperSettingsTab.vue';
import ImportExportTab from 'src/components/settings/ImportExportTab.vue';
import EmbeddingSettingsTab from 'src/components/settings/EmbeddingSettingsTab.vue';

const ctx = injectSettingsPage();

// 将 tab value 映射到对应的面板组件。Electron 与非 Electron 顺序略有差异，
// 已由 composable 的 `tabs` 列表处理，本文件只需按 value 字符串分派。
// 非 Electron: 0=AI 模型 · 1=代理 · 2=API Keys · 3=同步 · 4=本地嵌入 · 5=爬虫 · 6=导入导出
// Electron:    0=AI 模型 · 1=API Keys · 2=同步 · 3=本地嵌入 · 4=爬虫 · 5=导入导出
function panelFor(value: string) {
  if (ctx.isElectron.value) {
    if (value === '0') return AIModelSettingsTab;
    if (value === '1') return ApiKeysSettingsTab;
    if (value === '2') return SyncSettingsTab;
    if (value === '3') return EmbeddingSettingsTab;
    if (value === '4') return ScraperSettingsTab;
    if (value === '5') return ImportExportTab;
  } else {
    if (value === '0') return AIModelSettingsTab;
    if (value === '1') return ProxySettingsTab;
    if (value === '2') return ApiKeysSettingsTab;
    if (value === '3') return SyncSettingsTab;
    if (value === '4') return EmbeddingSettingsTab;
    if (value === '5') return ScraperSettingsTab;
    if (value === '6') return ImportExportTab;
  }
  return AIModelSettingsTab;
}
</script>

<template>
  <section class="settings-tablet">
    <div class="st-scrim" aria-hidden="true" />
    <div class="settings-tablet-card">
      <header class="st-head">
        <div>
          <div class="st-eyebrow">SETTINGS</div>
          <h1 class="st-title">设置</h1>
        </div>
        <button
          type="button"
          class="st-close"
          aria-label="返回上一页"
          @click="ctx.goBack"
        >
          <i class="pi pi-times" aria-hidden="true" />
        </button>
      </header>

      <nav class="st-tabs" role="tablist">
        <button
          v-for="tab in ctx.tabs.value"
          :key="tab.value"
          role="tab"
          :aria-selected="ctx.activeTab.value === tab.value"
          class="st-tab"
          :class="{ 'st-tab-active': ctx.activeTab.value === tab.value }"
          @click="ctx.handleTabChange(tab.value)"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="st-body">
        <component :is="panelFor(ctx.activeTab.value)" :visible="true" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-tablet {
  position: relative;
  height: 100%;
  min-height: 0;
  padding: clamp(16px, 3vh, 32px) clamp(16px, 3vw, 40px);
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
}

.st-scrim {
  position: absolute;
  inset: 0;
  background: rgba(5, 7, 10, 0.6);
  pointer-events: none;
}

.settings-tablet-card {
  position: relative;
  width: 100%;
  max-width: 1080px;
  height: 100%;
  background: #14161a;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

.st-head {
  padding: 22px 32px 6px;
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.st-close {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(247, 244, 236, 0.5);
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.st-close:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e9edf5;
}

.st-close .pi {
  font-size: 14px;
}

.st-eyebrow {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(163, 183, 207, 0.75);
  margin-bottom: 4px;
}

.st-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  color: #e9edf5;
  letter-spacing: -0.01em;
  margin: 0;
}

.st-tabs {
  display: flex;
  gap: 24px;
  padding: 14px 32px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scrollbar-width: thin;
}

.st-tabs::-webkit-scrollbar {
  height: 2px;
}

.st-tab {
  padding: 10px 0;
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  color: rgba(247, 244, 236, 0.55);
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.st-tab:hover {
  color: rgba(247, 244, 236, 0.85);
}

.st-tab-active {
  color: #e9edf5;
  font-weight: 600;
  border-bottom-color: #a3b7cf;
}

.st-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px 32px 32px;
  display: flex;
  flex-direction: column;
}

.st-body > :deep(*) {
  flex: 1;
  min-height: 0;
}
</style>
