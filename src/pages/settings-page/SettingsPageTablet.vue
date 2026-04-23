<script setup lang="ts">
import {
  getSettingsPanelComponent,
  injectSettingsPage,
} from 'src/composables/settings-page/useSettingsPage';

const ctx = injectSettingsPage();

const panelFor = (value: string) => getSettingsPanelComponent(ctx.isElectron.value, value);
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
  background: var(--shell-opacity-60); /* token: near night-500 @ 60% */
  pointer-events: none;
}

.settings-tablet-card {
  position: relative;
  width: 100%;
  max-width: 1080px;
  height: 100%;
  background: var(--night-300); /* token: night-300 */
  border: 1px solid var(--white-opacity-8);
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
  color: var(--moon-50-opacity-50);
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.st-close:hover {
  background: var(--white-opacity-6);
  color: var(--primary-200); /* token: primary */
}

.st-close .pi {
  font-size: 14px;
}

.st-eyebrow {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--tsukuyomi-300-opacity-75); /* token: tsukuyomi-300 @ 75% */
  margin-bottom: 4px;
}

.st-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 22px;
  font-weight: 600;
  color: var(--primary-200); /* token: primary */
  letter-spacing: -0.01em;
  margin: 0;
}

.st-tabs {
  display: flex;
  gap: 24px;
  padding: 14px 32px 0;
  border-bottom: 1px solid var(--white-opacity-6);
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
  color: var(--moon-50-opacity-55);
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
  color: var(--moon-50-opacity-85);
}

.st-tab-active {
  color: var(--primary-200); /* token: primary */
  font-weight: 600;
  border-bottom-color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
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
