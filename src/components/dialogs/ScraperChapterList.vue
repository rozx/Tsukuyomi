<template>
  <div
    class="h-full flex flex-col bg-night-900/50 rounded-lg border border-white/10 overflow-hidden"
    :style="splitPanelContainerStyle"
  >
    <div class="px-4 py-3 border-b border-white/10 flex-shrink-0 bg-white/5 space-y-2 w-full">
      <div class="flex items-center justify-between min-w-0 gap-2">
        <h4 class="text-md font-semibold text-moon/90 flex-shrink-0">章节列表</h4>
        <div class="flex items-center gap-2 flex-1 justify-end min-w-0">
          <div
            class="flex gap-1 min-w-0"
            :class="{ 'overflow-x-auto whitespace-nowrap pr-1': isPhone }"
          >
            <Button
              v-for="opt in filterOptions"
              :key="opt.value"
              :label="opt.label"
              :class="filterButtonClass(opt.value)"
              class="p-button-sm icon-button-hover"
              @click="chapterFilter = opt.value"
            />
          </div>
          <Button
            :label="selectAllLabel"
            :icon="selectAllIcon"
            class="p-button-text p-button-sm text-moon/70 hover:text-moon/90 flex-shrink-0"
            :aria-label="selectAllAria"
            @click="toggleSelectAll"
          />
        </div>
      </div>
    </div>
    <div class="flex-1 min-h-0 px-3 py-2 overflow-hidden w-full min-w-0">
      <VirtualScroller
        :items="virtualList"
        :itemSize="chapterItemSize"
        class="border-0 h-full"
        :style="chapterScrollerStyle"
      >
        <template #item="{ item }">
          <ScraperChapterListItem :item="item" />
        </template>
      </VirtualScroller>
      <div v-if="displayVolumeChapters.length === 0" class="flex items-center justify-center py-8">
        <div class="text-center text-moon/60">没有找到章节</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Button from 'primevue/button';
import VirtualScroller from 'primevue/virtualscroller';
import ScraperChapterListItem from './ScraperChapterListItem.vue';
import { SCRAPER_DIALOG_KEY, type ChapterFilter } from './scraper-dialog-context';

const {
  isPhone,
  chapterFilter,
  isAllSelected,
  toggleSelectAll,
  virtualList,
  displayVolumeChapters,
  chapterItemSize,
  chapterScrollerStyle,
  splitPanelContainerStyle,
} = inject(SCRAPER_DIALOG_KEY)!;

// 过滤按钮配置
const filterOptions: ReadonlyArray<{ label: string; value: ChapterFilter }> = [
  { label: '全部', value: 'all' },
  { label: '已导入', value: 'imported' },
  { label: '未导入', value: 'unimported' },
  { label: '有更新', value: 'updated' },
];

// 当前激活的过滤按钮不加 outlined，其余加 outlined
const filterButtonClass = (value: ChapterFilter): string =>
  chapterFilter.value === value ? '' : 'p-button-outlined';

// 全选/取消全选按钮的文案 / 图标 / aria
const selectAllLabel = computed(() => (isPhone.value ? '' : isAllSelected.value ? '取消' : '全选'));
const selectAllIcon = computed(() => (isAllSelected.value ? 'pi pi-times' : 'pi pi-check-square'));
const selectAllAria = computed(() => (isAllSelected.value ? '取消全选' : '全选章节'));
</script>
