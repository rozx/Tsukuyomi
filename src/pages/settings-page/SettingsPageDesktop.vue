<script setup lang="ts">
import { computed } from 'vue';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
import DesktopWorkbenchMetrics from 'src/components/desktop/DesktopWorkbenchMetrics.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import { injectSettingsPage } from 'src/composables/settings-page/useSettingsPage';
import AIModelSettingsTab from 'src/components/settings/AIModelSettingsTab.vue';
import ProxySettingsTab from 'src/components/settings/ProxySettingsTab.vue';
import ApiKeysSettingsTab from 'src/components/settings/ApiKeysSettingsTab.vue';
import SyncSettingsTab from 'src/components/settings/SyncSettingsTab.vue';
import ScraperSettingsTab from 'src/components/settings/ScraperSettingsTab.vue';
import ImportExportTab from 'src/components/settings/ImportExportTab.vue';
import EmbeddingSettingsTab from 'src/components/settings/EmbeddingSettingsTab.vue';

const ctx = injectSettingsPage();

const currentTabLabel = computed(
  () => ctx.tabs.value.find((tab) => tab.value === ctx.activeTab.value)?.label ?? 'AI 模型',
);

const pageSummary = computed(
  () => `当前位于“${currentTabLabel.value}”分区，可在桌面工具页中连续浏览与调整设置。`,
);

const settingsMetrics = computed(() => [
  { label: '设置分区', value: ctx.tabs.value.length },
  { label: '当前分区', value: currentTabLabel.value, wide: true },
  { label: '运行环境', value: ctx.isElectron.value ? 'Electron' : 'Web', wide: true },
]);

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
  <div class="desktop-settings-page">
    <nav class="desktop-settings-crumbs" aria-label="返回">
      <button
        type="button"
        class="settings-back-chip"
        aria-label="返回"
        @click="ctx.goBack"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
        <span>返回</span>
      </button>
    </nav>

    <DesktopWorkbenchHeader eyebrow="Settings" title="设置工作台" :description="pageSummary">
      <template #metrics>
        <DesktopWorkbenchMetrics :items="settingsMetrics" />
      </template>
    </DesktopWorkbenchHeader>

    <DesktopWorkbenchSurface class="settings-workbench" tone="muted" :padded="false">
      <aside class="settings-nav">
        <button
          v-for="tab in ctx.tabs.value"
          :key="tab.value"
          type="button"
          class="settings-nav-item"
          :class="{ 'settings-nav-item--active': ctx.activeTab.value === tab.value }"
          @click="ctx.handleTabChange(tab.value)"
        >
          <span class="settings-nav-item-eyebrow">{{ Number(tab.value) + 1 }}</span>
          <span class="settings-nav-item-label">{{ tab.label }}</span>
        </button>
      </aside>

      <div class="settings-panel-area">
        <component :is="panelFor(ctx.activeTab.value)" :visible="true" />
      </div>
    </DesktopWorkbenchSurface>
  </div>
</template>

<style scoped>
.desktop-settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 0.85rem 1.1rem 1.25rem;
}

.desktop-settings-crumbs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}

.settings-back-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  height: 22px;
  padding: 0 0.55rem 0 0.45rem;
  border-radius: 6px;
  background: transparent;
  border: 1px solid var(--white-opacity-8, var(--white-opacity-8));
  color: var(--accent-silver);
  cursor: pointer;
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.6rem;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  line-height: 1;
  transition: all 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-back-chip:hover {
  background: var(--white-opacity-4);
  border-color: var(--tsukuyomi-200-opacity-22); /* token: tsukuyomi-200 @ 22% */
  color: var(--moon-opacity-100);
}

.settings-back-chip:active {
  background: var(--white-opacity-6);
}

.settings-back-chip .pi {
  font-size: 0.68rem;
  line-height: 1;
}

.settings-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
  align-items: stretch;
  overflow: hidden;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  min-height: 0;
  overflow-y: auto;
  padding: 1rem;
  border-right: 1px solid var(--white-opacity-8);
  background: var(--white-opacity-2); /* token: white @ 2% */
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid var(--white-opacity-8);
  background: rgba(9, 13, 19, 0.72); /* token: near night-500 @ 72% */
  color: var(--moon-50-opacity-70);
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.4, 0, 0.2, 1),
    background 160ms cubic-bezier(0.4, 0, 0.2, 1),
    transform 160ms cubic-bezier(0.4, 0, 0.2, 1),
    color 160ms cubic-bezier(0.4, 0, 0.2, 1);
}

.settings-nav-item:hover {
  transform: translateY(-1px);
  border-color: var(--tsukuyomi-200-opacity-20); /* token: tsukuyomi-200 @ 20% */
  color: var(--moon-50-opacity-92); /* token: moon-50 @ 92% */
}

.settings-nav-item--active {
  border-color: var(--tsukuyomi-200-opacity-30); /* token: tsukuyomi-200 @ 30% */
  background: var(--tsukuyomi-200-opacity-8); /* token: tsukuyomi-200 @ 8% */
  color: var(--moon-50-opacity-96); /* token: moon-50 @ 96% */
}

.settings-nav-item-eyebrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background: var(--white-opacity-6);
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  flex-shrink: 0;
}

.settings-nav-item-label {
  font-size: 0.94rem;
  font-weight: 600;
}

.settings-panel-area {
  min-height: 0;
  height: 100%;
  overflow-y: auto;
  padding: 1.2rem;
  overscroll-behavior: contain;
}

.settings-panel-area > :deep(*) {
  min-height: 0;
}

@media (max-width: 1200px) {
  .settings-workbench {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    border-right: none;
    border-bottom: 1px solid var(--white-opacity-8);
  }
}

@media (max-width: 820px) {
  .desktop-settings-page {
    padding-inline: 0.85rem;
  }

  .settings-nav {
    grid-template-columns: 1fr;
  }
}
</style>
