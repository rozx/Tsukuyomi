<script setup lang="ts">
/**
 * 手机端 · 检查更新全屏页（/books/:id/settings/update）。
 * 不再使用底部抽屉：顶栏返回书籍概览，下方是单列同步工作区；会话由页面 dispatcher 提供。
 */
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';

const ctx = injectBookDetailsPage();
const router = useRouter();

const goBack = () => {
  if (ctx.bookId.value) void router.replace(`/books/${ctx.bookId.value}`);
};
</script>

<template>
  <div class="mbs">
    <header class="mbs-bar">
      <Button icon="pi pi-arrow-left" text rounded aria-label="返回书籍概览" @click="goBack" />
      <div class="mbs-heading">
        <h1 class="mbs-title">检查更新</h1>
        <p v-if="ctx.book.value" class="mbs-book">{{ ctx.book.value.title }}</p>
      </div>
    </header>
    <div class="mbs-body">
      <BookSyncWorkspace />
    </div>
  </div>
</template>

<style scoped>
.mbs {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.mbs-bar {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.mbs-heading {
  min-width: 0;
}

.mbs-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(226, 232, 240, 0.95);
}

.mbs-book {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  color: rgba(226, 232, 240, 0.55);
}

.mbs-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0.85rem 1rem;
}
</style>
