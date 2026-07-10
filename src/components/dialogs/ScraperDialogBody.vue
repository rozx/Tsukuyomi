<script setup lang="ts">
/**
 * 小说抓取器主体（URL 输入 + 统计 + 章节列表/预览分栏）。
 * 从 NovelScraperDialog 模板抽出，供弹窗形态与嵌入面板形态（BookUpdatePanel）共用；
 * 全部状态经 SCRAPER_DIALOG_KEY 注入（由 NovelScraperDialog 提供）。
 */
import { inject } from 'vue';
import ScraperUrlInput from './ScraperUrlInput.vue';
import ScraperLoadingState from './ScraperLoadingState.vue';
import ScraperNovelInfo from './ScraperNovelInfo.vue';
import ScraperChapterList from './ScraperChapterList.vue';
import ScraperChapterPreview from './ScraperChapterPreview.vue';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const ctx = inject(SCRAPER_DIALOG_KEY)!;
const {
  bodyClass,
  loading,
  showSplitView,
  showChapterPanel,
  showPreviewPanel,
  contentContainerComponent,
  contentPanelComponent,
  contentContainerProps,
  chapterPanelProps,
  previewPanelProps,
  contentContainerClass,
  chapterPanelWrapperClass,
  previewPanelWrapperClass,
  contentContainerStyle,
} = ctx;
</script>

<template>
  <div :class="bodyClass">
    <!-- URL 输入 -->
    <ScraperUrlInput />

    <!-- 加载中 - 使用骨架屏 -->
    <ScraperLoadingState v-if="loading" />

    <!-- 统计信息 -->
    <ScraperNovelInfo />

    <!-- 左右分栏布局 -->
    <div v-if="showSplitView" class="flex-1 min-h-0 min-w-0">
      <component
        :is="contentContainerComponent"
        v-bind="contentContainerProps"
        :class="contentContainerClass"
        :style="contentContainerStyle"
      >
        <!-- 左侧：章节列表 -->
        <component
          :is="contentPanelComponent"
          v-bind="chapterPanelProps"
          :class="chapterPanelWrapperClass"
          v-show="showChapterPanel"
        >
          <ScraperChapterList />
        </component>

        <!-- 右侧：章节内容 -->
        <component
          :is="contentPanelComponent"
          v-bind="previewPanelProps"
          :class="previewPanelWrapperClass"
          v-show="showPreviewPanel"
        >
          <ScraperChapterPreview />
        </component>
      </component>
    </div>
  </div>
</template>

<style scoped>
.novel-scraper-body > * {
  min-width: 0;
}

@media (max-width: 640px) {
  .novel-scraper-body {
    gap: 0.75rem;
    padding-top: 0.25rem;
  }
}
</style>
