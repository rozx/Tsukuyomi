<template>
  <!-- 卷头 -->
  <div v-if="item.type === 'header'" class="pb-2">
    <div
      class="text-sm font-semibold text-moon/80 px-3 py-2 bg-primary/10 border border-primary/20 rounded-lg cursor-pointer hover:bg-primary/15 transition-colors flex items-center justify-between gap-2"
      @click="toggleVolumeCollapse(group.volumeId)"
    >
      <div class="flex-shrink-0" @click.stop>
        <Checkbox
          :model-value="isVolumeSelected(group.volumeId)"
          :binary="true"
          @update:model-value="toggleVolumeSelection(group.volumeId)"
        />
      </div>
      <span class="flex-1"> {{ group.volumeTitle }} ({{ item.chapterCount }} 章) </span>
      <i :class="volumeChevronClass(group.volumeId)" class="text-xs text-moon/60" />
    </div>
  </div>

  <!-- 章节 -->
  <div v-else class="pb-2">
    <div
      class="list-item-base cursor-pointer min-w-0"
      :class="selectedChapterId === chapter.id ? 'list-item-selected' : 'hover:list-item-hover'"
      @click="selectChapter(chapter)"
    >
      <div class="flex items-start gap-3 min-w-0">
        <div class="flex-shrink-0 mt-0.5" @click.stop>
          <Checkbox
            :model-value="selectedChapters.has(chapter.id)"
            :binary="true"
            @update:model-value="toggleChapterSelection(chapter.id)"
          />
        </div>
        <div class="flex-1 min-w-0 w-0 overflow-hidden">
          <div class="flex items-start justify-between gap-2">
            <div class="font-medium text-sm text-moon/90 line-clamp-2 flex-1">
              {{ getChapterDisplayTitle(chapter, currentBook || undefined) }}
            </div>
            <template v-if="importStatus">
              <span :class="importStatus!.class">
                {{ importStatus!.text }}
              </span>
            </template>
          </div>
          <div class="flex items-center gap-3 mt-2 text-xs">
            <span v-if="chapterContents.has(chapter.id)" class="text-moon/70 font-medium">
              字数:
              <span class="novel-word-count">{{
                formatWordCount(getChapterWordCount(chapter.id))
              }}</span>
            </span>
            <span v-else-if="loadingChapters.has(chapter.id)" class="text-moon/50 italic">
              计算中...
            </span>
            <span v-else class="text-moon/40"> 未加载 </span>
            <span v-if="showChapterDate" class="text-moon/50 flex items-center gap-1">
              <i class="pi pi-clock text-[10px]" />
              {{ formatDate(chapter.lastUpdated) }}
            </span>
          </div>
          <div v-if="showChapterUrl" class="mt-2 w-full max-w-full overflow-hidden">
            <a
              :href="chapter.webUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-primary/80 hover:text-primary hover:underline block w-full overflow-hidden overflow-ellipsis whitespace-nowrap"
              style="max-width: 100%"
              @click.stop
            >
              {{ chapter.webUrl }}
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, inject } from 'vue';
import Checkbox from 'primevue/checkbox';
import { formatWordCount, formatDate, getChapterDisplayTitle } from 'src/utils';
import {
  SCRAPER_DIALOG_KEY,
  type ScraperVirtualItem,
  type ScraperVolumeGroup,
} from './scraper-dialog-context';
import type { Chapter } from 'src/models/novel';

const props = defineProps<{
  item: ScraperVirtualItem;
}>();

const {
  selectedChapterId,
  selectedChapters,
  chapterContents,
  loadingChapters,
  isPhone,
  currentBook,
  toggleVolumeCollapse,
  toggleVolumeSelection,
  isVolumeSelected,
  isVolumeCollapsed,
  toggleChapterSelection,
  selectChapter,
  getChapterImportStatus,
  getChapterWordCount,
} = inject(SCRAPER_DIALOG_KEY)!;

// 按条目类型断言取数据（v-if 已保证运行时类型正确）
const group = computed(() => props.item.data as ScraperVolumeGroup);
const chapter = computed(() => props.item.data as Chapter);

// 卷展开/折叠图标 class
const volumeChevronClass = (volumeId: string): string =>
  isVolumeCollapsed(volumeId) ? 'pi pi-chevron-right' : 'pi pi-chevron-down';

// 章节导入状态（仅在 chapter 条目有意义）
const importStatus = computed(() =>
  props.item.type === 'chapter' ? getChapterImportStatus(chapter.value) : null,
);

// 章节日期 / URL 的显示条件（仅桌面端）
const showChapterDate = computed(() => !!chapter.value.lastUpdated && !isPhone.value);
const showChapterUrl = computed(() => !!chapter.value.webUrl && !isPhone.value);
</script>
