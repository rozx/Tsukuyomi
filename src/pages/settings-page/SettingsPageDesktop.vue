<script setup lang="ts">
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
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
  <section class="settings-page-desktop">
    <header class="settings-page-header">
      <div>
        <div class="eyebrow">SETTINGS</div>
        <h1>设置</h1>
      </div>
    </header>

    <Tabs
      :value="ctx.activeTab.value"
      class="settings-tabview"
      @update:value="ctx.handleTabChange"
    >
      <TabList>
        <Tab value="0">AI 模型</Tab>
        <Tab v-if="!ctx.isElectron.value" value="1">代理设置</Tab>
        <Tab :value="ctx.isElectron.value ? '1' : '2'">API Keys</Tab>
        <Tab :value="ctx.isElectron.value ? '2' : '3'">同步设置</Tab>
        <Tab :value="ctx.isElectron.value ? '3' : '4'">爬虫设置</Tab>
        <Tab :value="ctx.isElectron.value ? '4' : '5'">导入/导出</Tab>
        <Tab :value="ctx.isElectron.value ? '5' : '6'">本地嵌入</Tab>
      </TabList>
      <TabPanels>
        <TabPanel value="0">
          <AIModelSettingsTab />
        </TabPanel>
        <TabPanel v-if="!ctx.isElectron.value" value="1">
          <ProxySettingsTab />
        </TabPanel>
        <TabPanel :value="ctx.isElectron.value ? '1' : '2'">
          <ApiKeysSettingsTab />
        </TabPanel>
        <TabPanel :value="ctx.isElectron.value ? '2' : '3'">
          <SyncSettingsTab :visible="true" />
        </TabPanel>
        <TabPanel :value="ctx.isElectron.value ? '3' : '4'">
          <ScraperSettingsTab />
        </TabPanel>
        <TabPanel :value="ctx.isElectron.value ? '4' : '5'">
          <ImportExportTab />
        </TabPanel>
        <TabPanel :value="ctx.isElectron.value ? '5' : '6'">
          <EmbeddingSettingsTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </section>
</template>

<style scoped>
.settings-page-desktop {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 2rem 0;
  overflow: hidden;
}

.settings-page-header {
  flex-shrink: 0;
  padding-bottom: 1rem;
}

.settings-page-header .eyebrow {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(163, 183, 207, 0.8);
  margin-bottom: 6px;
}

.settings-page-header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #e9edf5;
  letter-spacing: -0.01em;
  margin: 0;
}

.settings-tabview {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.settings-tabview :deep([data-pc-name='tablist']),
.settings-tabview :deep(.p-tabs-list) {
  flex-shrink: 0;
}

.settings-tabview :deep([data-pc-name='tabpanels']),
.settings-tabview :deep(.p-tabs-panels) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-bottom: 1.5rem;
}

.settings-tabview :deep([data-pc-name='tabpanel']),
.settings-tabview :deep(.p-tab-panel) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
