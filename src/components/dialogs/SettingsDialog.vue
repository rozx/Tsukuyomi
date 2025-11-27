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
import AIModelSettingsTab from '../settings/AIModelSettingsTab.vue';
import ScraperSettingsTab from '../settings/ScraperSettingsTab.vue';
import ProxySettingsTab from '../settings/ProxySettingsTab.vue';
import SyncSettingsTab from '../settings/SyncSettingsTab.vue';
import ImportExportTab from '../settings/ImportExportTab.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const settingsStore = useSettingsStore();
const { isElectron } = useElectron();

// 将数字索引转换为字符串值
const tabIndexToString = (index: number): string => String(index);
const tabStringToIndex = (value: string): number => Number(value);

// 当前选中的标签页值（字符串类型）
const activeTab = ref('0');

// 计算标签页索引映射（Electron 环境下代理设置标签页被隐藏）
// 非 Electron: 0=AI模型, 1=代理设置, 2=同步设置, 3=爬虫设置, 4=导入/导出
// Electron: 0=AI模型, 1=同步设置, 2=爬虫设置, 3=导入/导出
const getTabValue = (index: number): string => {
  if (isElectron.value) {
    // Electron 环境：跳过代理设置标签页
    // 0=AI模型, 1=同步设置, 2=爬虫设置, 3=导入/导出
    return String(index);
  } else {
    // 非 Electron 环境：包含代理设置标签页
    // 0=AI模型, 1=代理设置, 2=同步设置, 3=爬虫设置, 4=导入/导出
    return String(index);
  }
};

// 将保存的标签页索引转换为实际标签页值
const convertSavedTabIndex = (savedIndex: number): string => {
  if (isElectron.value) {
    // Electron 环境：代理设置标签页不存在
    // 如果保存的索引是 1（代理设置），映射到 1（同步设置）
    // 如果保存的索引 >= 2，需要减 1
    if (savedIndex === 1) {
      // 原来是代理设置，现在映射到同步设置
      return '1';
    } else if (savedIndex >= 2) {
      // 原来是同步设置(2)、爬虫设置(3)、导入/导出(4)，现在分别是 1、2、3
      return String(savedIndex - 1);
    } else {
      // AI 模型 (0) 保持不变
      return '0';
    }
  } else {
    // 非 Electron 环境：直接使用
    return String(savedIndex);
  }
};

// 将标签页值转换为保存的索引
const convertTabValueToIndex = (tabValue: string): number => {
  const index = Number(tabValue);
  if (isElectron.value) {
    // Electron 环境：将标签页值转换回原始索引
    // 0=AI模型(0), 1=同步设置(2), 2=爬虫设置(3), 3=导入/导出(4)
    if (index === 0) return 0;
    if (index === 1) return 2; // 同步设置
    if (index === 2) return 3; // 爬虫设置
    if (index === 3) return 4; // 导入/导出
    return 0;
  } else {
    // 非 Electron 环境：直接使用
    return index;
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
  // 将保存的索引转换为当前环境下的标签页值
  const tabValue = convertSavedTabIndex(lastTab);
  // 确保值在有效范围内
  const maxTabIndex = isElectron.value ? 3 : 4; // Electron 环境最多 4 个标签页（0-3），非 Electron 最多 5 个（0-4）
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
      // 对话框打开时，重新初始化标签页
      await initializeActiveTab();
    }
  },
);

// 处理标签页切换
const handleTabChange = (value: string | number) => {
  const stringValue = String(value);
  activeTab.value = stringValue;
  const tabIndex = tabStringToIndex(stringValue);
  // 将标签页值转换为保存的索引
  const savedIndex = convertTabValueToIndex(stringValue);
  // 只有当值有效时才保存
  const maxTabIndex = isElectron.value ? 3 : 4;
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
    :style="{ width: '800px', height: '700px' }"
    :closable="true"
    :draggable="false"
    :resizable="false"
    class="settings-dialog"
    @update:visible="$emit('update:visible', $event)"
    @hide="handleClose"
  >
    <Tabs :value="activeTab" @update:value="handleTabChange" class="settings-tabview">
      <TabList>
        <Tab value="0">AI 模型</Tab>
        <Tab v-if="!isElectron" value="1">代理设置</Tab>
        <Tab :value="isElectron ? '1' : '2'">同步设置</Tab>
        <Tab :value="isElectron ? '2' : '3'">爬虫设置</Tab>
        <Tab :value="isElectron ? '3' : '4'">导入/导出</Tab>
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

        <!-- 同步设置 -->
        <TabPanel :value="isElectron ? '1' : '2'">
          <SyncSettingsTab :visible="visible" />
        </TabPanel>

        <!-- 爬虫设置 -->
        <TabPanel :value="isElectron ? '2' : '3'">
          <ScraperSettingsTab />
        </TabPanel>

        <!-- 导入/导出资料 -->
        <TabPanel :value="isElectron ? '3' : '4'">
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
