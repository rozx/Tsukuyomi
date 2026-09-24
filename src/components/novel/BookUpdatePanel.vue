<script setup lang="ts">
/**
 * 检查更新面板（桌面/平板路由面板，/books/:id/settings/update）。
 * 壳组件：panel-header 标题区 + 同步工作区。会话由 BookDetailsPage dispatcher 按路由提供，
 * 应用与撤销都经过同步服务的写入保护。与其他设置面板一样没有返回按钮，由侧栏切换。
 */
import BookSyncWorkspace from 'src/components/book-sync/BookSyncWorkspace.vue';

// 桌面页用同一个动态组件切换各设置面板并统一传入 book；本面板的会话由页面提供，不需要它
defineOptions({ inheritAttrs: false });
</script>

<template>
  <div class="book-update-panel h-full flex flex-col">
    <div class="panel-header border-b border-white/10">
      <div class="min-w-0">
        <h1 class="panel-title font-semibold text-moon-100">检查更新</h1>
        <p class="panel-desc text-sm text-moon/70">
          从来源网站检查新章节和原文修订，确认后才写入书籍
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
