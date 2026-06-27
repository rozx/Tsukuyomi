<template>
  <div class="flex-1 overflow-y-auto px-6 py-4" :style="contentScrollStyle">
    <!-- 加载中 - 使用骨架屏 -->
    <div v-if="isLoadingChapter" class="py-4 space-y-2">
      <Skeleton v-for="i in 15" :key="i" width="100%" height="1rem" />
    </div>
    <!-- 错误状态 -->
    <div
      v-else-if="selectedChapterError"
      class="flex flex-col items-center justify-center py-12 space-y-4"
    >
      <i class="pi pi-exclamation-triangle text-4xl text-red-400/70" />
      <div class="text-center space-y-2">
        <p class="text-moon/90 font-medium">加载失败</p>
        <p class="text-sm text-moon/60">{{ selectedChapterError }}</p>
      </div>
      <Button
        label="重试"
        icon="pi pi-refresh"
        class="p-button-outlined p-button-sm"
        @click="retryLoadContent"
      />
    </div>
    <!-- 已导入章节的差异对比 -->
    <ScraperCompareView v-else-if="showCompare" has-new-content />
    <!-- 已导入章节但新内容未加载 -->
    <ScraperCompareView v-else-if="showCompareWaiting" :has-new-content="false" />
    <!-- 内容显示（未导入章节） -->
    <div
      v-else-if="selectedChapterContent"
      class="text-sm text-moon/80 whitespace-pre-line leading-relaxed prose prose-invert max-w-none"
    >
      {{ selectedChapterContent }}
    </div>
    <!-- 未选择章节 -->
    <div v-else-if="selectedChapter" class="text-moon/60 text-center py-12">
      <i class="pi pi-file text-4xl text-moon/40 mb-4 block" />
      <p>点击章节加载内容</p>
    </div>
    <div v-else class="text-moon/60 text-center py-12">
      <i class="pi pi-arrow-left text-4xl text-moon/40 mb-4 block" />
      <p>请从左侧选择章节查看内容</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Skeleton from 'primevue/skeleton';
import Button from 'primevue/button';
import ScraperCompareView from './ScraperCompareView.vue';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const {
  loadingChapters,
  selectedChapterId,
  selectedChapterError,
  isSelectedChapterImported,
  selectedChapterImportedContent,
  selectedChapterContent,
  selectedChapter,
  loadChapterContent,
  contentScrollStyle,
} = inject(SCRAPER_DIALOG_KEY)!;

const isLoadingChapter = computed(() => loadingChapters.value.has(selectedChapterId.value || ''));

// 已导入且本地内容已加载，并且新内容已加载 → 并排对比
const showCompare = computed(
  () =>
    isSelectedChapterImported.value &&
    selectedChapterImportedContent.value !== null &&
    !!selectedChapterContent.value,
);
// 已导入且本地内容已加载，但新内容尚未加载 → 等待加载
const showCompareWaiting = computed(
  () =>
    isSelectedChapterImported.value &&
    selectedChapterImportedContent.value !== null &&
    !selectedChapterContent.value,
);

// 重试加载当前章节内容
const retryLoadContent = () => {
  if (selectedChapter.value) {
    void loadChapterContent(selectedChapter.value, true);
  }
};
</script>
