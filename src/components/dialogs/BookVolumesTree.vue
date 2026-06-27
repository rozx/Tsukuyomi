<template>
  <div v-if="volumes.length > 0" class="space-y-2">
    <div class="flex items-center justify-between">
      <label class="block text-sm font-medium text-moon/90">卷和章节</label>
      <Button
        icon="pi pi-trash"
        label="清除全部"
        class="p-button-text p-button-danger p-button-sm"
        size="small"
        @click="emit('clear')"
      />
    </div>
    <div class="space-y-2 max-h-[300px] overflow-y-auto card-base p-3">
      <div
        v-for="volume in volumes"
        :key="volume.id"
        class="space-y-2 border-b border-white/10 last:border-b-0 pb-2 last:pb-0"
      >
        <!-- 卷标题 -->
        <div
          class="flex items-center justify-between cursor-pointer hover:bg-white/5 p-2 rounded-lg transition-colors"
          role="button"
          tabindex="0"
          @click="emit('toggle', volume.id)"
          @keydown.enter.prevent="emit('toggle', volume.id)"
          @keydown.space.prevent="emit('toggle', volume.id)"
        >
          <div class="flex items-center gap-2 flex-1">
            <i :class="volumeIconClass(volume.id)" />
            <span class="font-semibold text-sm text-moon/90">
              {{ getVolumeDisplayTitle(volume) || '未命名卷' }}
            </span>
            <span class="text-xs text-moon/60"> ({{ chapterCount(volume) }} 章) </span>
          </div>
        </div>

        <!-- 章节列表 -->
        <BookChapterList
          :volume="volume"
          :book="book"
          :expanded="expandedVolumeIds.has(volume.id)"
          :get-char-display="getCharDisplay"
          :is-loading="isLoading"
        />
      </div>
    </div>
    <small class="text-moon/60 text-xs block">点击卷标题展开/折叠章节列表（只读）</small>
  </div>
</template>

<script setup lang="ts">
import Button from 'primevue/button';
import type { Chapter, Novel, Volume } from 'src/models/novel';
import { getVolumeDisplayTitle } from 'src/utils';
import BookChapterList from './BookChapterList.vue';

const props = defineProps<{
  volumes: Volume[];
  book?: Novel | null | undefined;
  expandedVolumeIds: Set<string>;
  getCharDisplay: (chapter: Chapter) => number;
  isLoading: (chapter: Chapter) => boolean;
}>();

const emit = defineEmits<{
  toggle: [volumeId: string];
  clear: [];
}>();

// 卷展开/折叠的图标 class（避免在模板中写三元，降低圈复杂度）
const volumeIconClass = (volumeId: string): string => {
  return [
    'pi text-xs transition-transform',
    props.expandedVolumeIds.has(volumeId) ? 'pi-chevron-down' : 'pi-chevron-right',
  ].join(' ');
};

// 卷内章节数量（兼容 chapters 缺失的情况）
const chapterCount = (volume: Volume): number => volume.chapters?.length ?? 0;
</script>
