<template>
  <div class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5">
    <div v-if="isPhone" class="mb-2">
      <Button
        label="返回章节列表"
        icon="pi pi-arrow-left"
        class="p-button-text p-button-sm"
        @click="showMobileChapterList"
      />
    </div>
    <div class="flex items-start justify-between gap-2 mb-2">
      <h4 class="text-lg font-semibold text-moon/90 flex-1">
        {{ getChapterDisplayTitle(selectedChapter!, currentBook || undefined) }}
      </h4>
      <span v-if="selectedChapterImportStatus" :class="selectedChapterImportStatus.class">
        {{ selectedChapterImportStatus.text }}
      </span>
    </div>
    <div v-if="showHeaderMeta" class="flex items-center gap-2 flex-wrap">
      <a
        v-if="showHeaderWebUrl"
        :href="selectedChapter!.webUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="text-xs text-primary/80 hover:text-primary hover:underline truncate"
      >
        {{ selectedChapter!.webUrl }}
      </a>
      <span v-if="chapterContents.has(selectedChapter!.id)" class="text-xs text-moon/60">
        · {{ formatWordCount(getChapterWordCount(selectedChapter!.id)) }} 字
      </span>
      <span
        v-if="selectedChapter!.lastUpdated"
        class="text-xs text-moon/50 flex items-center gap-1"
      >
        <i class="pi pi-clock text-[10px]" />
        {{ formatDate(selectedChapter!.lastUpdated) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Button from 'primevue/button';
import { formatWordCount, formatDate, getChapterDisplayTitle } from 'src/utils';
import { SCRAPER_DIALOG_KEY } from './scraper-dialog-context';

const {
  selectedChapter,
  selectedChapterImportStatus,
  chapterContents,
  isPhone,
  currentBook,
  getChapterWordCount,
  showMobileChapterList,
} = inject(SCRAPER_DIALOG_KEY)!;

// 元信息行展示条件：有网络地址或更新时间
const showHeaderMeta = computed(
  () => !!selectedChapter.value?.webUrl || !!selectedChapter.value?.lastUpdated,
);
// 网络地址仅桌面端展示
const showHeaderWebUrl = computed(() => !!selectedChapter.value?.webUrl && !isPhone.value);
</script>
