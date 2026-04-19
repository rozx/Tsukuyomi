<script setup lang="ts">
/**
 * Mobile variant — follows the Tsukuyomi Mobile design:
 *   large iOS-style title (SETTINGS eyebrow + 设置 h1)
 *   → horizontal-scroll segmented tab strip (underline-active)
 *   → single-panel scrolling content (one tab mounted at a time).
 *
 * The MobileSysBar and MobileTabBar are provided by MainLayoutMobile,
 * so this variant renders only the settings body.
 */
import { injectSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import AIModelSettingsTab from 'src/components/settings/AIModelSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';
import ApiKeysSettingsTab from 'src/components/settings/ApiKeysSettingsTab.vue';
import SyncSettingsTab from 'src/components/settings/SyncSettingsTab.vue';
import ScraperSettingsTab from 'src/components/settings/ScraperSettingsTab.vue';
import ImportExportTab from 'src/components/settings/ImportExportTab.vue';
import EmbeddingSettingsTab from 'src/components/settings/EmbeddingSettingsTab.vue';

const ctx = injectSettingsPage();
</script>

<template>
  <section class="tsm-settings-shell">
    <!-- 大标题区 -->
    <div class="tsm-largetitle">
      <div class="eyebrow">SETTINGS</div>
      <h1>设置</h1>
    </div>

    <!-- 横向滚动分段 tab 栏 -->
    <div class="tsm-settings-tabs" role="tablist">
      <button
        v-for="t in ctx.tabs.value"
        :key="t.value"
        type="button"
        class="stab"
        :class="{ active: ctx.activeTab.value === t.value }"
        role="tab"
        :aria-selected="ctx.activeTab.value === t.value"
        @click="ctx.handleTabChange(t.value)"
      >
        {{ t.label }}
      </button>
    </div>

    <!-- 内容区（一次只渲染激活 tab） -->
    <div class="tsm-settings-scroll">
      <AIModelSettingsTab v-if="ctx.activeTab.value === '0'" />
      <ProxySettingsTab
        v-else-if="!ctx.isElectron.value && ctx.activeTab.value === '1'"
      />
      <ApiKeysSettingsTab
        v-else-if="ctx.activeTab.value === (ctx.isElectron.value ? '1' : '2')"
      />
      <SyncSettingsTab
        v-else-if="ctx.activeTab.value === (ctx.isElectron.value ? '2' : '3')"
        :visible="true"
      />
      <ScraperSettingsTab
        v-else-if="ctx.activeTab.value === (ctx.isElectron.value ? '3' : '4')"
      />
      <ImportExportTab
        v-else-if="ctx.activeTab.value === (ctx.isElectron.value ? '4' : '5')"
      />
      <EmbeddingSettingsTab
        v-else-if="ctx.activeTab.value === ctx.embeddingSettingsTabValue.value"
      />
    </div>
  </section>
</template>

<style scoped>
.tsm-settings-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: transparent;
}

/* 大标题 */
.tsm-largetitle {
  padding: 16px 20px 8px;
  flex-shrink: 0;
}

.tsm-largetitle .eyebrow {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-weight: 500;
  font-size: 10px;
  color: rgba(163, 183, 207, 0.85);
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.tsm-largetitle h1 {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: #e9edf5;
  letter-spacing: -0.02em;
  margin: 0;
}

/* 横向 tab 栏 */
.tsm-settings-tabs {
  display: flex;
  gap: 0;
  padding: 6px 16px 10px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  scrollbar-width: none;
}

.tsm-settings-tabs::-webkit-scrollbar {
  display: none;
}

.tsm-settings-tabs .stab {
  flex-shrink: 0;
  padding: 8px 2px;
  margin-right: 18px;
  background: none;
  border: none;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 13px;
  font-weight: 500;
  color: rgba(138, 147, 160, 0.9);
  cursor: pointer;
  position: relative;
  scroll-snap-align: start;
  white-space: nowrap;
  transition: color 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tsm-settings-tabs .stab:last-child {
  margin-right: 16px;
}

.tsm-settings-tabs .stab:hover {
  color: rgba(220, 226, 236, 0.95);
}

.tsm-settings-tabs .stab.active {
  color: #e9edf5;
  font-weight: 600;
}

.tsm-settings-tabs .stab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: #a3b7cf;
  border-radius: 2px 2px 0 0;
}

/* 滚动内容 */
.tsm-settings-scroll {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 18px 16px calc(env(safe-area-inset-bottom, 0px) + 24px);
  min-height: 0;
}
</style>
