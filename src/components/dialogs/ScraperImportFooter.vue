<template>
  <div class="scraper-footer-wrapper w-full">
    <!-- 导入进度条 -->
    <div v-if="importing" class="mb-4 space-y-2">
      <div class="flex items-center justify-between text-sm text-moon/80">
        <span>正在导入章节内容...</span>
        <span>{{ importCurrent }} / {{ importTotal }}</span>
      </div>
      <ProgressBar :value="importProgress" class="w-full" />
      <div v-if="importCurrentChapter" class="text-xs text-moon/60 truncate">
        当前: {{ importCurrentChapter }}
      </div>
    </div>
    <div class="scraper-footer-actions flex gap-2 justify-end">
      <Button
        label="取消"
        icon="pi pi-times"
        class="p-button-text icon-button-hover"
        :disabled="importing"
        @click="handleCancel"
      />
      <Button
        :label="applyLabel"
        icon="pi pi-check"
        class="p-button-primary icon-button-hover"
        :disabled="applyDisabled"
        :loading="importing"
        @click="handleApply"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Button from 'primevue/button';
import ProgressBar from 'primevue/progressbar';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const {
  importing,
  importProgress,
  importCurrent,
  importTotal,
  importCurrentChapter,
  scrapedNovel,
  selectedChapters,
  handleApply,
  handleCancel,
} = inject(SCRAPER_DIALOG_KEY)!;

// 应用按钮文案（带选中数量）
const applyLabel = computed(
  () => `应用${selectedChapters.value.size > 0 ? ` (${selectedChapters.value.size})` : ''}`,
);
// 应用按钮禁用条件
const applyDisabled = computed(
  () => !scrapedNovel.value || selectedChapters.value.size === 0 || importing.value,
);
</script>
