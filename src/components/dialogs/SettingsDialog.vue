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
import AIModelSettingsTab from '../settings/AIModelSettingsTab.vue';
import ScraperSettingsTab from '../settings/ScraperSettingsTab.vue';
import SyncSettingsTab from '../settings/SyncSettingsTab.vue';
import ImportExportTab from '../settings/ImportExportTab.vue';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  'update:visible': [value: boolean];
}>();

const settingsStore = useSettingsStore();

// 将数字索引转换为字符串值
const tabIndexToString = (index: number): string => String(index);
const tabStringToIndex = (value: string): number => Number(value);

// 当前选中的标签页值（字符串类型）
const activeTab = ref('0');

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
  const tabValue = tabIndexToString(lastTab);
  // 确保值在有效范围内
  const tabIndex = Number(tabValue);
  if (tabIndex >= 0 && tabIndex <= 3) {
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
const handleTabChange = (value: string) => {
  activeTab.value = value;
  const tabIndex = tabStringToIndex(value);
  // 只有当值有效时才保存（0-3）
  if (tabIndex >= 0 && tabIndex <= 3) {
    void settingsStore.setLastOpenedSettingsTab(tabIndex);
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
        <Tab value="1">爬虫设置</Tab>
        <Tab value="2">同步设置</Tab>
        <Tab value="3">导入/导出</Tab>
      </TabList>
      <TabPanels>
        <!-- AI 模型默认设置 -->
        <TabPanel value="0">
          <AIModelSettingsTab />
        </TabPanel>

        <!-- 爬虫设置 -->
        <TabPanel value="1">
          <ScraperSettingsTab />
        </TabPanel>

        <!-- 同步设置 -->
        <TabPanel value="2">
          <SyncSettingsTab :visible="visible" />
        </TabPanel>

        <!-- 导入/导出资料 -->
        <TabPanel value="3">
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
