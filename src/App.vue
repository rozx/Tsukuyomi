<script setup lang="ts">
import { onMounted } from 'vue';
import { migrateFromLocalStorage } from 'src/utils/indexed-db';
import { useBooksStore } from 'src/stores/books';
import { useAIModelsStore } from 'src/stores/ai-models';
import { useSettingsStore } from 'src/stores/settings';
import { useToastHistoryStore } from 'src/stores/toast-history';
import { useCoverHistoryStore } from 'src/stores/cover-history';
import { useBookDetailsStore } from 'src/stores/book-details';
import { useUiStore } from 'src/stores/ui';
import { useAIProcessingStore } from 'src/stores/ai-processing';
import { useContextStore } from 'src/stores/context';
import { useElectronSettings } from 'src/composables/useElectronSettings';

const booksStore = useBooksStore();
const aiModelsStore = useAIModelsStore();
const settingsStore = useSettingsStore();
const toastHistoryStore = useToastHistoryStore();
const coverHistoryStore = useCoverHistoryStore();
const bookDetailsStore = useBookDetailsStore();
const uiStore = useUiStore();
const aiProcessingStore = useAIProcessingStore();
const contextStore = useContextStore();

// 初始化 Electron 设置处理
useElectronSettings();

onMounted(async () => {
  // 确保数据已加载（如果路由守卫已经加载，这里会快速返回）
  // 这确保了即使直接访问页面，数据也会被加载
  await Promise.all([
    booksStore.loadBooks(),
    aiModelsStore.loadModels(),
    settingsStore.loadSettings(),
    toastHistoryStore.loadHistory(),
    coverHistoryStore.loadCoverHistory(),
    aiProcessingStore.loadThinkingProcesses(),
  ]);

  // 从 localStorage 加载 UI 状态（同步）
  bookDetailsStore.loadState();
  uiStore.loadState();
  contextStore.loadState();
});
</script>

<template>
  <router-view />
</template>
