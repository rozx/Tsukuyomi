<script setup lang="ts">
/**
 * 检查更新面板（桌面/平板路由面板，/books/:id/settings/update）。
 * 壳组件：panel-header 风格标题区 + 嵌入模式的小说抓取器主体（embedded
 * NovelScraperDialog，含底部导入操作栏），应用更新走页面上下文的
 * handleScraperUpdate（与原弹窗同一条链路）。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import NovelScraperDialog from 'src/components/dialogs/NovelScraperDialog.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Novel } from 'src/models/novel';

const props = defineProps<{
  book: Novel | null;
}>();

const ctx = injectBookDetailsPage();
const router = useRouter();

const initialUrl = computed(() => props.book?.webUrl?.[0] || '');

// 嵌入模式下抓取器的「取消/关闭」语义 = 离开面板回到书籍工作台
const onVisibleChange = (visible: boolean) => {
  if (!visible && props.book) {
    void router.replace(`/books/${props.book.id}`);
  }
};
</script>

<template>
  <div class="book-update-panel h-full flex flex-col">
    <div class="panel-header border-b border-white/10">
      <h1 class="panel-title font-semibold text-moon-100">检查更新</h1>
      <p class="panel-desc text-sm text-moon/70">
        从来源网站（Syosetu / Kakuyomu 等）抓取本书章节列表，选择未导入或有更新的章节导入
      </p>
    </div>

    <div class="flex-1 min-h-0 panel-body flex flex-col">
      <NovelScraperDialog
        :visible="true"
        embedded
        :current-book="book"
        :initial-url="initialUrl"
        :show-novel-info="false"
        initial-filter="unimported"
        @apply="ctx.handleScraperUpdate"
        @update:visible="onVisibleChange"
      />
    </div>
  </div>
</template>

<style scoped>
.panel-header {
  padding: 1.5rem;
}

.panel-title {
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.625rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 2rem;
  margin-bottom: 0.5rem;
}

.panel-desc {
  margin-bottom: 0.75rem;
}

.panel-body {
  padding: 0.5rem 1.5rem 1rem;
}

@media (max-width: 640px) {
  .panel-header {
    display: none;
  }

  .panel-body {
    padding: 0.5rem 1rem 0.75rem;
  }
}
</style>
