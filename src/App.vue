<script setup lang="ts">
import { onMounted } from 'vue';
import { migrateFromLocalStorage, isDbBlocked } from 'src/utils/indexed-db';
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
import { GlobalConfig } from 'src/services/global-config-cache';

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
  // 首次运行时从 localStorage 迁移到 IndexedDB（只执行一次）
  const hasRun = sessionStorage.getItem('indexeddb-migration-done');
  if (!hasRun) {
    try {
      await migrateFromLocalStorage();
      sessionStorage.setItem('indexeddb-migration-done', 'true');
    } catch (error) {
      console.error('Failed to migrate from localStorage:', error);
    }
  }

  // 非阻塞式地加载所有 stores 数据
  // 不使用 await，让页面立即渲染，数据在后台加载
  const loadPromise = Promise.all([
    booksStore.loadBooks(),
    aiModelsStore.loadModels(),
    settingsStore.loadSettings(),
    toastHistoryStore.loadHistory(),
    coverHistoryStore.loadCoverHistory(),
    aiProcessingStore.loadThinkingProcesses(),
    // 初始化全局配置访问层（确保服务/工具层读取配置时不需要再重复读 IndexedDB）
    GlobalConfig.ensureInitialized(),
  ]).catch((error) => {
    console.error('Failed to load initial data:', error);
  });

  // 检测数据库阻塞：如果 5 秒内数据仍未加载完成且 DB 被阻塞，提示用户
  const blockCheckTimer = setTimeout(() => {
    if (isDbBlocked()) {
      console.error(
        '[App] 数据库升级被其他标签页阻塞，数据无法加载。请关闭其他使用本应用的标签页后刷新。',
      );
    }
  }, 5000);
  void loadPromise.finally(() => clearTimeout(blockCheckTimer));

  // 从 localStorage 加载 UI 状态（同步）
  bookDetailsStore.loadState();
  uiStore.loadState();
  contextStore.loadState();

  // 全局监听 embedding 模型就绪事件,持久化"已缓存"标记
  // 无论用户通过哪条路径触发加载（设置页下载、记忆面板重新向量化、章节 backfill 等）
  // 都会被此监听器捕获,保证下次启动时 MainLayout 能自动 warmup
  const { EmbeddingService } = await import('src/services/embedding-service');
  EmbeddingService.addEventListener('ready', () => {
    if (settingsStore.settings.memoryInjection?.embeddingModelCached !== true) {
      void settingsStore.updateMemoryInjection({ embeddingModelCached: true });
    }
  });
});
</script>

<template>
  <router-view />
</template>
