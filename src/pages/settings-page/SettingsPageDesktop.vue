<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import DesktopWorkbenchHeader from 'src/components/desktop/DesktopWorkbenchHeader.vue';
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
    <DesktopWorkbenchHeader eyebrow="Settings" title="设置工作台" :description="pageSummary">
      <template #actions>
        <div class="settings-header-actions">
          <Button
            label="返回"
            icon="pi pi-arrow-left"
            class="p-button-outlined"
            @click="ctx.goBack"
          />
        </div>
      </template>

      <template #metrics>
        <div class="settings-metrics-grid">
          <div class="settings-metric-card">
            <div class="settings-metric-label">设置分区</div>
            <div class="settings-metric-value">{{ ctx.tabs.value.length }}</div>
          </div>
          <div class="settings-metric-card">
            <div class="settings-metric-label">当前分区</div>
            <div class="settings-metric-value settings-metric-value--wide">
              {{ currentTabLabel }}
            </div>
          </div>
          <div class="settings-metric-card">
            <div class="settings-metric-label">运行环境</div>
            <div class="settings-metric-value settings-metric-value--wide">
              {{ ctx.isElectron.value ? 'Electron' : 'Web' }}
            </div>
          </div>
        </div>
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
  gap: 1rem;
  padding: 1rem 1.1rem 1.25rem;
}

.settings-header-actions {
  width: 100%;
  display: flex;
  justify-content: flex-end;
}

.settings-metrics-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.8rem;
}

.settings-metric-card {
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  padding: 0.95rem 1rem;
}

.settings-metric-label {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(247, 244, 236, 0.48);
}

.settings-metric-value {
  margin-top: 0.45rem;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: clamp(1.3rem, 0.55vw + 1.1rem, 1.7rem);
  font-weight: 600;
  color: rgba(247, 244, 236, 0.96);
}

.settings-metric-value--wide {
  font-size: clamp(1.05rem, 0.28vw + 0.95rem, 1.35rem);
}

.settings-workbench {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(14rem, 17rem) minmax(0, 1fr);
}

.settings-nav {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
  padding: 1rem;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  padding: 0.95rem 1rem;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(9, 13, 19, 0.72);
  color: rgba(247, 244, 236, 0.7);
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
  border-color: rgba(186, 201, 219, 0.2);
  color: rgba(247, 244, 236, 0.92);
}

.settings-nav-item--active {
  border-color: rgba(186, 201, 219, 0.3);
  background: rgba(186, 201, 219, 0.08);
  color: rgba(247, 244, 236, 0.96);
}

.settings-nav-item-eyebrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.8rem;
  height: 1.8rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  font-size: 0.76rem;
  font-weight: 700;
  color: #bac9db;
  flex-shrink: 0;
}

.settings-nav-item-label {
  font-size: 0.94rem;
  font-weight: 600;
}

.settings-panel-area {
  min-height: 0;
  overflow-y: auto;
  padding: 1.2rem;
}

.settings-panel-area > :deep(*) {
  min-height: 0;
}

@media (max-width: 1200px) {
  .settings-metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .settings-workbench {
    grid-template-columns: 1fr;
  }

  .settings-nav {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
}

@media (max-width: 820px) {
  .desktop-settings-page {
    padding-inline: 0.85rem;
  }

  .settings-header-actions {
    justify-content: stretch;
  }

  .settings-header-actions > * {
    width: 100%;
  }

  .settings-metrics-grid,
  .settings-nav {
    grid-template-columns: 1fr;
  }
}
</style>
