<template>
  <div
    class="h-full flex-1 min-h-0 flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
    :style="splitPanelContainerStyle"
  >
    <ScraperPreviewHeader v-if="selectedChapter" />
    <div v-else class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5">
      <Button
        v-if="isPhone"
        label="返回章节列表"
        icon="pi pi-arrow-left"
        class="p-button-text p-button-sm mb-2"
        @click="showMobileChapterList"
      />
      <h4 class="text-lg font-semibold text-moon/60">请从左侧选择章节</h4>
    </div>
    <ScraperPreviewContent />
  </div>
</template>

<script setup lang="ts">
import { inject } from 'vue';
import Button from 'primevue/button';
import ScraperPreviewHeader from './ScraperPreviewHeader.vue';
import ScraperPreviewContent from './ScraperPreviewContent.vue';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const { selectedChapter, isPhone, splitPanelContainerStyle, showMobileChapterList } =
  inject(SCRAPER_DIALOG_KEY)!;
</script>
