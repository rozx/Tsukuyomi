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

const booksStore = useBooksStore();
const aiModelsStore = useAIModelsStore();
const settingsStore = useSettingsStore();
const toastHistoryStore = useToastHistoryStore();
const coverHistoryStore = useCoverHistoryStore();
const bookDetailsStore = useBookDetailsStore();
const uiStore = useUiStore();

onMounted(async () => {
  // 首次运行时从 localStorage 迁移到 IndexedDB
  const hasRun = sessionStorage.getItem('indexeddb-migration-done');
  if (!hasRun) {
    await migrateFromLocalStorage();
    sessionStorage.setItem('indexeddb-migration-done', 'true');
  }

  // 从 IndexedDB 加载所有 stores
  await Promise.all([
    booksStore.loadBooks(),
    aiModelsStore.loadModels(),
    settingsStore.loadSettings(),
    toastHistoryStore.loadHistory(),
    coverHistoryStore.loadCoverHistory(),
    bookDetailsStore.loadState(),
    uiStore.loadState(),
  ]);
});
</script>

<template>
  <router-view />
</template>
