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
import { computed, type Component } from 'vue';
import { injectSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import AIModelSettingsTab from 'src/components/settings/AIModelSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';
import ApiKeysSettingsTab from 'src/components/settings/ApiKeysSettingsTab.vue';
import SyncSettingsTab from 'src/components/settings/SyncSettingsTab.vue';
import ScraperSettingsTab from 'src/components/settings/ScraperSettingsTab.vue';
import ImportExportTab from 'src/components/settings/ImportExportTab.vue';
import EmbeddingSettingsTab from 'src/components/settings/EmbeddingSettingsTab.vue';
import AboutSection from 'src/components/settings/AboutSection.vue';

const ctx = injectSettingsPage();

// 各 tab 值 → 组件的静态映射（electron / web 两套）。本地嵌入 tab（'3'/'4'）单独处理。
const ELECTRON_TAB_MAP: Record<string, Component> = {
  '0': AIModelSettingsTab,
  '1': ApiKeysSettingsTab,
  '2': SyncSettingsTab,
  '4': ScraperSettingsTab,
  '5': ImportExportTab,
  '6': AboutSection,
};
const WEB_TAB_MAP: Record<string, Component> = {
  '0': AIModelSettingsTab,
  '1': ProxySettingsTab,
  '2': ApiKeysSettingsTab,
  '3': SyncSettingsTab,
  '5': ScraperSettingsTab,
  '6': ImportExportTab,
  '7': AboutSection,
};

// 把原先 7 路 v-if/v-else-if 折叠成单次 map 查表，消除模板与脚本双重分支
const settingsTabComponent = computed<Component | null>(() => {
  const tab = ctx.activeTab.value;
  if (tab === ctx.embeddingSettingsTabValue.value) return EmbeddingSettingsTab;
  const map = ctx.isElectron.value ? ELECTRON_TAB_MAP : WEB_TAB_MAP;
  return map[tab] ?? null;
});

// SyncSettingsTab 需要额外传 :visible="true"，其余 tab 不传任何额外属性
const settingsTabBindings = computed(() =>
  settingsTabComponent.value === SyncSettingsTab ? { visible: true } : {},
);
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

    <!-- 内容区（一次只渲染激活 tab）。顺序对应 public/help/settings-guide.md：
         AI 模型 → (代理) → API Keys → 同步 → 本地嵌入 → 爬虫 → 导入/导出 -->
    <div class="tsm-settings-scroll">
      <component :is="settingsTabComponent" v-bind="settingsTabBindings" />
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
  color: var(--tsukuyomi-300-opacity-85); /* token: tsukuyomi-300 @ 85% */
  text-transform: uppercase;
  letter-spacing: 0.22em;
  margin-bottom: 4px;
}

.tsm-largetitle h1 {
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-weight: 600;
  font-size: 28px;
  line-height: 1.15;
  color: var(--primary-200); /* token: primary */
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
  border-bottom: 1px solid var(--white-opacity-6);
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
  color: rgba(138, 147, 160, 0.9); /* neutral grey, untokenized */
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
  color: rgba(220, 226, 236, 0.95); /* near tsukuyomi-100, untokenized */
}

.tsm-settings-tabs .stab.active {
  color: var(--primary-200); /* token: primary */
  font-weight: 600;
}

.tsm-settings-tabs .stab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
