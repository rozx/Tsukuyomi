<script setup lang="ts">
/**
 * 检查更新面板（桌面/平板路由面板，/books/:id/settings/update）。
 * 壳组件：panel-header 标题区 + 同步工作区。会话由 BookDetailsPage dispatcher 按路由提供，
 * 应用与撤销都经过同步服务的写入保护。返回回到书籍工作台。
 */
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';
import type { Novel } from 'src/models/novel';

const props = defineProps<{
  book: Novel | null;
}>();

const router = useRouter();

const goBack = () => {
  if (props.book) void router.replace(`/books/${props.book.id}`);
};
</script>

<template>
  <div class="book-update-panel h-full flex flex-col">
    <div class="panel-header border-b border-white/10 flex items-start gap-2">
      <Button
        icon="pi pi-arrow-left"
        text
        rounded
        size="small"
        aria-label="返回书籍"
        @click="goBack"
      />
      <div class="min-w-0">
        <h1 class="panel-title font-semibold text-moon-100">检查更新</h1>
        <p class="panel-desc text-sm text-moon/70">
          按来源配方回放目录：新章节默认勾选，有更新的章节需要你查看差异后手动勾选
        </p>
      </div>
    </div>

    <div class="flex-1 min-h-0 panel-body flex flex-col">
      <BookSyncWorkspace />
    </div>
  </div>
</template>

<!-- 标题区样式（五个设置面板共享），详见 panel-header.css -->
<style scoped src="./panel-header.css"></style>

<style scoped>
.panel-body {
  padding: 0.75rem 1.5rem 1rem;
}

@media (max-width: 640px) {
  .panel-body {
    padding: 0.5rem 1rem 0.75rem;
  }
}
</style>
