<template>
  <div class="flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors">
    <i class="pi pi-file text-xs text-moon/60 mt-1 flex-shrink-0" />
    <div class="flex-1 min-w-0">
      <div class="flex items-start justify-between gap-2">
        <div class="text-sm text-moon/80 line-clamp-2 flex-1">
          {{ getChapterDisplayTitle(chapter, book || undefined) || '未命名章节' }}
        </div>
        <span class="text-xs text-moon/60 flex-shrink-0">
          <Skeleton v-if="charLoading" width="40px" height="12px" />
          <span v-else>{{ formatCharCount(charDisplay) }} 字</span>
        </span>
      </div>
      <div class="flex items-center gap-3 mt-1 text-xs text-moon/50">
        <span v-if="chapter.lastUpdated" class="flex items-center gap-1">
          <i class="pi pi-clock text-[10px]" />
          {{ formatDate(chapter.lastUpdated) }}
        </span>
        <span v-if="chapter.webUrl" class="flex items-center gap-1">
          <i class="pi pi-link text-[10px]" />
          <a
            :href="chapter.webUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="text-accent-400 hover:text-accent-300 hover:underline break-all transition-colors"
            @click.stop
          >
            {{ chapter.webUrl }}
          </a>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Skeleton from 'primevue/skeleton';
import type { Chapter, Novel } from 'src/models/novel';
import { formatCharCount, formatDate, getChapterDisplayTitle } from 'src/utils';

defineProps<{
  chapter: Chapter;
  book?: Novel | null | undefined;
  charDisplay: number;
  charLoading: boolean;
}>();
</script>
