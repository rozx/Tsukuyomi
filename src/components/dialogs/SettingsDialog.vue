<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import ConfirmDialog from 'primevue/confirmdialog';
import Tabs from 'primevue/tabs';
import Tab from 'primevue/tab';
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

// 当前选中的标签页索引
const activeTabIndex = ref(0);

// 监听对话框显示状态，恢复最后打开的标签页
watch(
  () => props.visible,
  (isVisible) => {
    if (isVisible) {
      // 对话框打开时，恢复最后打开的标签页
      activeTabIndex.value = settingsStore.lastOpenedSettingsTab;
    }
  },
  { immediate: true },
);

// 监听标签页切换，保存到 store
watch(activeTabIndex, (newIndex) => {
  void settingsStore.setLastOpenedSettingsTab(newIndex);
});

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};

// 处理标签页切换
const handleTabChange = (val: string | number) => {
  activeTabIndex.value = typeof val === 'number' ? val : Number(val);
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
    <Tabs :value="activeTabIndex" @update:value="handleTabChange" class="settings-tabview">
      <!-- AI 模型默认设置 -->
      <Tab :value="0" header="AI 模型">
        <AIModelSettingsTab />
      </Tab>

      <!-- 爬虫设置 -->
      <Tab :value="1" header="爬虫设置">
        <ScraperSettingsTab />
      </Tab>

      <!-- 同步设置 -->
      <Tab :value="2" header="同步设置">
        <SyncSettingsTab :visible="visible" />
      </Tab>

      <!-- 导入/导出资料 -->
      <Tab :value="3" header="导入/导出">
        <ImportExportTab />
      </Tab>
    </Tabs>
  </Dialog>

  <!-- 确认对话框（放在 Dialog 外部，避免重复渲染） -->
  <ConfirmDialog group="settings" />
</template>

<style scoped>
.settings-tabview {
  height: 100%;
}

.settings-tabview :deep(.p-tabs-panels) {
  height: calc(100% - 3rem);
  overflow-y: auto;
}

.settings-tabview :deep(.p-tab-panel) {
  height: 100%;
}
</style>
