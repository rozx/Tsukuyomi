<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import Tabs from 'primevue/tabs';
import TabList from 'primevue/tablist';
import Tab from 'primevue/tab';
import TabPanels from 'primevue/tabpanels';
import TabPanel from 'primevue/tabpanel';
import { useSettingsStore } from 'src/stores/settings';
import { useElectron } from 'src/composables/useElectron';
import { useAdaptiveDialog } from 'src/composables/useAdaptiveDialog';
import AIModelSettingsTab from '../settings/AIModelSettingsTab.vue';
import ScraperSettingsTab from '../settings/ScraperSettingsTab.vue';
import ProxySettingsTab from '../settings/ProxySettingsTab.vue';
import SyncSettingsTab from '../settings/SyncSettingsTab.vue';
import ImportExportTab from '../settings/ImportExportTab.vue';
import ApiKeysSettingsTab from '../settings/ApiKeysSettingsTab.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const settingsStore = useSettingsStore();
const { isElectron } = useElectron();
const { dialogStyle, dialogClass } = useAdaptiveDialog({
  desktopWidth: '800px',
  tabletWidth: '94vw',
  desktopHeight: '700px',
  tabletHeight: '94vh',
});

// 当前选中的标签页值（字符串类型）
const activeTab = ref('0');

// 标签页索引映射：
// 非 Electron: 0=AI模型, 1=代理设置, 2=API Keys, 3=同步设置, 4=爬虫设置, 5=导入/导出
// Electron: 0=AI模型, 1=API Keys, 2=同步设置, 3=爬虫设置, 4=导入/导出

// 将保存的标签页索引转换为实际标签页值（处理向后兼容）
const convertSavedTabIndex = (savedIndex: number): string => {
  if (isElectron.value) {
    // Electron 环境：代理设置标签页不存在
    // 旧: 0=AI, 1=代理, 2=同步, 3=爬虫, 4=导入
    // 新: 0=AI, 1=API Keys, 2=同步, 3=爬虫, 4=导入
    if (savedIndex === 0) return '0'; // AI
    if (savedIndex === 1) return '1'; // 代理 → API Keys
    if (savedIndex >= 2) return String(savedIndex); // 保持原值
    return '0';
  } else {
    // 非 Electron 环境：
    // 旧: 0=AI, 1=代理, 2=同步, 3=爬虫, 4=导入
    // 新: 0=AI, 1=代理, 2=API Keys, 3=同步, 4=爬虫, 5=导入
    // 新 API Keys 标签页使用索引 6（避免与旧索引冲突）
    if (savedIndex === 6) return '2'; // 新 API Keys 标签页
    if (savedIndex < 2) return String(savedIndex); // AI(0), 代理(1)
    if (savedIndex >= 2 && savedIndex <= 4) return String(savedIndex + 1); // 同步+1, 爬虫+1, 导入+1
    return '0';
  }
};

// 将标签页值转换为保存的索引（反向转换，与 convertSavedTabIndex 对应）
const convertTabValueToIndex = (tabValue: string): number => {
  const tabIndex = Number(tabValue);
  if (isElectron.value) {
    // Electron 环境：
    // 旧: 0=AI, 1=代理, 2=同步, 3=爬虫, 4=导入
    // 新: 0=AI, 1=API Keys, 2=同步, 3=爬虫, 4=导入
    // 新标签页值直接对应旧索引（代理被 API Keys 替换，索引保持不变）
    if (tabIndex === 0) return 0; // AI
    if (tabIndex === 1) return 1; // API Keys → 映射到原代理索引 1
    if (tabIndex >= 2) return tabIndex; // 同步、爬虫、导入保持原值
    return 0;
  } else {
    // 非 Electron 环境：
    // 旧: 0=AI, 1=代理, 2=同步, 3=爬虫, 4=导入
    // 新: 0=AI, 1=代理, 2=API Keys, 3=同步, 4=爬虫, 5=导入
    // 新 API Keys 标签页使用索引 6（避免与旧索引冲突）
    if (tabIndex < 2) return tabIndex; // AI(0), 代理(1) 保持不变
    if (tabIndex === 2) return 6; // API Keys (新标签页，使用索引 6)
    if (tabIndex >= 3) return tabIndex - 1; // 同步、爬虫、导入需要减 1 恢复原索引
    return 0;
  }
};

// 确保 store 已加载
const ensureStoreLoaded = async () => {
  if (!settingsStore.isLoaded) {
    await settingsStore.loadSettings();
  }
};

// 初始化标签页值
const initializeActiveTab = async () => {
  await ensureStoreLoaded();
  const lastTab = settingsStore.lastOpenedSettingsTab;
  const tabValue = convertSavedTabIndex(lastTab);
  // Electron 最多 5 个标签页（0-4），非 Electron 最多 6 个（0-5）
  const maxTabIndex = isElectron.value ? 4 : 5;
  const tabIndex = Number(tabValue);
  if (tabIndex >= 0 && tabIndex <= maxTabIndex) {
    activeTab.value = tabValue;
  } else {
    activeTab.value = '0';
  }
};

// 组件挂载时，如果对话框已可见，则初始化
onMounted(async () => {
  if (props.visible) {
    await initializeActiveTab();
  }
});

// 监听对话框显示状态，恢复最后打开的标签页
watch(
  () => props.visible,
  async (isVisible) => {
    if (isVisible) {
      await initializeActiveTab();
    }
  },
);

// 处理标签页切换
const handleTabChange = (value: string | number) => {
  const stringValue = String(value);
  activeTab.value = stringValue;
  const tabIndex = Number(stringValue);
  const savedIndex = convertTabValueToIndex(stringValue);
  const maxTabIndex = isElectron.value ? 4 : 5;
  if (tabIndex >= 0 && tabIndex <= maxTabIndex) {
    void settingsStore.setLastOpenedSettingsTab(savedIndex);
  }
};

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};
</script>

<template>
  <Dialog
    :visible="visible"
    header="设置"
    :modal="true"
    :style="dialogStyle"
    :closable="true"
    :draggable="false"
    :resizable="false"
    :class="['settings-dialog', dialogClass]"
    @update:visible="$emit('update:visible', $event)"
    @hide="handleClose"
  >
    <Tabs :value="activeTab" @update:value="handleTabChange" class="settings-tabview">
      <TabList>
        <Tab value="0">AI 模型</Tab>
        <Tab v-if="!isElectron" value="1">代理设置</Tab>
        <Tab :value="isElectron ? '1' : '2'">API Keys</Tab>
        <Tab :value="isElectron ? '2' : '3'">同步设置</Tab>
        <Tab :value="isElectron ? '3' : '4'">爬虫设置</Tab>
        <Tab :value="isElectron ? '4' : '5'">导入/导出</Tab>
      </TabList>
      <TabPanels>
        <!-- AI 模型默认设置 -->
        <TabPanel value="0">
          <AIModelSettingsTab />
        </TabPanel>

        <!-- 代理设置（仅在非 Electron 环境显示） -->
        <TabPanel v-if="!isElectron" value="1">
          <ProxySettingsTab />
        </TabPanel>

        <!-- API Keys 设置 -->
        <TabPanel :value="isElectron ? '1' : '2'">
          <ApiKeysSettingsTab />
        </TabPanel>

        <!-- 同步设置 -->
        <TabPanel :value="isElectron ? '2' : '3'">
          <SyncSettingsTab :visible="visible" />
        </TabPanel>

        <!-- 爬虫设置 -->
        <TabPanel :value="isElectron ? '3' : '4'">
          <ScraperSettingsTab />
        </TabPanel>

        <!-- 导入/导出资料 -->
        <TabPanel :value="isElectron ? '4' : '5'">
          <ImportExportTab />
        </TabPanel>
      </TabPanels>
    </Tabs>
  </Dialog>

  <!-- 确认对话框（放在 Dialog 外部，避免重复渲染） -->
  <ConfirmDialog group="settings" />
</template>

<style scoped>
/* Dialog 内容区域 */
.settings-dialog :deep(.p-dialog-content) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-tabview {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 确保 TabList 始终可见且不会被隐藏 */
.settings-tabview :deep([data-pc-name='tablist']),
.settings-tabview :deep(.p-tabs-list) {
  flex-shrink: 0;
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  position: relative;
  z-index: 1;
}

/* TabPanels 容器 */
.settings-tabview :deep([data-pc-name='tabpanels']),
.settings-tabview :deep(.p-tabs-panels) {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 单个 TabPanel */
.settings-tabview :deep([data-pc-name='tabpanel']),
.settings-tabview :deep(.p-tab-panel) {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
