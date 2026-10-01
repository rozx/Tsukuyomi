<template>
  <div v-if="expanded && volume.chapters && volume.chapters.length > 0" class="ml-6 space-y-1 mt-2">
    <BookChapterRow
      v-for="chapter in volume.chapters"
      :key="chapter.id"
      :chapter="chapter"
      :book="book"
      :char-display="getCharDisplay(chapter)"
      :char-loading="isLoading(chapter)"
    />
  </div>
  <div
    v-else-if="expanded && (!volume.chapters || volume.chapters.length === 0)"
    class="ml-6 text-xs text-moon/50 italic p-2"
  >
    {{ i18nT('libraryUi.noChapters') }}
  </div>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
const { t: i18nT } = useI18n();

import type { Chapter, Novel, Volume } from 'src/models/novel';
import BookChapterRow from './BookChapterRow.vue';

defineProps<{
  volume: Volume;
  book?: Novel | null | undefined;
  expanded: boolean;
  getCharDisplay: (chapter: Chapter) => number;
  isLoading: (chapter: Chapter) => boolean;
}>();
</script>
