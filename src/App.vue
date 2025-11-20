<script setup lang="ts">
import { onMounted } from 'vue';
import { migrateFromLocalStorage } from 'src/utils/indexed-db';
import { useBooksStore } from 'src/stores/books';

const booksStore = useBooksStore();

onMounted(async () => {
  // 首次运行时从 localStorage 迁移到 IndexedDB
  const hasRun = sessionStorage.getItem('indexeddb-migration-done');
  if (!hasRun) {
    await migrateFromLocalStorage();
    sessionStorage.setItem('indexeddb-migration-done', 'true');
  }

  // 从 IndexedDB 加载书籍
  await booksStore.loadBooks();
});
</script>

<template>
  <router-view />
</template>
