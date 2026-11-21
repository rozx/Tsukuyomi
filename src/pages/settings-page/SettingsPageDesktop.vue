<script setup lang="ts">
import { computed } from 'vue';
import PageHeader from 'src/components/layout/PageHeader.vue';
import DesktopWorkbenchSurface from 'src/components/desktop/DesktopWorkbenchSurface.vue';
import {
  getSettingsPanelComponent,
  injectSettingsPage,
} from 'src/composables/settings-page/useSettingsPage';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const ctx = injectSettingsPage();

const currentTabLabel = computed(
  () =>
    ctx.tabs.value.find((tab) => tab.value === ctx.activeTab.value)?.label ??
    t('settings.tabs.models'),
);

const pageSummary = computed(() => t('settingsUi.page.summary', { tab: currentTabLabel.value }));

const settingsMetrics = computed(() => [
  { label: t('settingsUi.page.sections'), value: ctx.tabs.value.length },
  { label: t('settingsUi.page.current'), value: currentTabLabel.value, wide: true },
  {
    label: t('settingsUi.page.environment'),
    value: ctx.isElectron.value ? 'Electron' : 'Web',
    wide: true,
  },
]);

const panelFor = (value: string) => getSettingsPanelComponent(ctx.isElectron.value, value);
</script>

<template>
  <div class="desktop-settings-page">
    <PageHeader
      eyebrow="Settings"
      :title="t('settingsUi.page.workbench')"
      :description="pageSummary"
      :stats="settingsMetrics"
      :back-label="t('settingsUi.page.back')"
      @back="ctx.goBack"
    />

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
/* 页头（PageHeader）通栏，内容区自己留边距 */
.desktop-settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-workbench {
  flex: 1;
  min-height: 0;
  margin: 1rem 1.1rem 1.25rem;
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
  .settings-workbench {
    margin-inline: 0.85rem;
  }

  .settings-nav {
    grid-template-columns: 1fr;
  }
}
</style>
