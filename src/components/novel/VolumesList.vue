<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { getVolumeDisplayTitle } from 'src/utils';
import {
  isSelectedChapterLoading as isSelectedChapterLoadingByState,
  canNavigateToChapter,
} from 'src/components/novel/volumes-list-utils';
import ChapterListItem from 'src/components/novel/ChapterListItem.vue';

interface DraggedChapter {
  chapter: Chapter;
  sourceVolumeId: string;
  sourceIndex: number;
}

const props = defineProps<{
  volumes: Volume[];
  book: Novel | null;
  selectedChapterId: string | null;
  isPageLoading: boolean;
  isLoadingChapterContent?: boolean;
  isVolumeExpanded: (volumeId: string) => boolean;
  draggedChapter: DraggedChapter | null;
  dragOverVolumeId: string | null;
  dragOverIndex: number | null;
  touchMode?: boolean;
  isMovingChapter?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-volume', volumeId: string): void;
  (e: 'navigate-to-chapter', chapter: Chapter): void;
  (e: 'edit-volume', volume: Volume): void;
  (e: 'delete-volume', volume: Volume): void;
  (e: 'edit-chapter', chapter: Chapter): void;
  (e: 'delete-chapter', chapter: Chapter): void;
  (e: 'drag-start', event: DragEvent, chapter: Chapter, volumeId: string, index: number): void;
  (e: 'drag-end', event: DragEvent): void;
  (e: 'drag-over', event: DragEvent, volumeId: string, index?: number): void;
  (e: 'drop', event: DragEvent, volumeId: string, index?: number): void;
  (e: 'drag-leave'): void;
  (
    e: 'move-chapter',
    payload: { chapter: Chapter; volumeId: string; index: number; direction: 'up' | 'down' },
  ): void;
}>();

const handleToggleVolume = (volumeId: string) => {
  emit('toggle-volume', volumeId);
};

const handleNavigateToChapter = (chapter: Chapter) => {
  if (!canNavigateToChapter(props, chapter.id)) {
    return;
  }

  emit('navigate-to-chapter', chapter);
};

const handleEditVolume = (volume: Volume) => {
  emit('edit-volume', volume);
};

const handleDeleteVolume = (volume: Volume) => {
  emit('delete-volume', volume);
};

const handleEditChapter = (chapter: Chapter) => {
  emit('edit-chapter', chapter);
};

const handleDeleteChapter = (chapter: Chapter) => {
  emit('delete-chapter', chapter);
};

const handleDragStart = (event: DragEvent, chapter: Chapter, volumeId: string, index: number) => {
  emit('drag-start', event, chapter, volumeId, index);
};

const handleDragEnd = (event: DragEvent) => {
  emit('drag-end', event);
};

const handleDragOver = (event: DragEvent, volumeId: string, index?: number) => {
  emit('drag-over', event, volumeId, index);
};

const handleDrop = (event: DragEvent, volumeId: string, index?: number) => {
  emit('drop', event, volumeId, index);
};

const handleDragLeave = () => {
  emit('drag-leave');
};

const handleMoveChapter = (
  chapter: Chapter,
  volumeId: string,
  index: number,
  direction: 'up' | 'down',
) => {
  emit('move-chapter', {
    chapter,
    volumeId,
    index,
    direction,
  });
};

const isSelectedChapterLoading = (chapterId: string) => {
  return isSelectedChapterLoadingByState(props, chapterId);
};

// 布尔状态访问器：把 === / && 表达式包成函数，避免在模板里产生圈复杂度
const isChapterSelected = (chapterId: string) => props.selectedChapterId === chapterId;
const isChapterDragOver = (volumeId: string, index: number) =>
  props.dragOverVolumeId === volumeId && props.dragOverIndex === index;
const isChapterDragging = (chapterId: string) => props.draggedChapter?.chapter.id === chapterId;
const isListDragOver = (volumeId: string) =>
  props.dragOverVolumeId === volumeId && props.dragOverIndex === null;
const showVolumeActions = (volumeId: string) =>
  !!props.touchMode && props.isVolumeExpanded(volumeId);
const volumeToggleIcon = (volumeId: string) =>
  props.isVolumeExpanded(volumeId) ? 'pi-chevron-down' : 'pi-chevron-right';
const hasExpandedChapters = (volume: Volume) =>
  !!volume.chapters && volume.chapters.length > 0 && props.isVolumeExpanded(volume.id);
const hasChapters = (volume: Volume) => !!volume.chapters && volume.chapters.length > 0;
const chapterCount = (volume: Volume) => volume.chapters?.length ?? 0;
const chaptersOf = (volume: Volume) => volume.chapters ?? [];
const hasVolumes = computed(() => props.volumes.length > 0);
</script>

<template>
  <div class="volumes-container">
    <!-- 加载状态 -->
    <div v-if="isPageLoading" class="volumes-loading">
      <Skeleton height="60px" class="mb-2" />
      <Skeleton height="40px" class="mb-2" />
      <Skeleton height="40px" class="mb-2" />
      <Skeleton height="40px" />
    </div>
    <!-- 卷列表 -->
    <div v-else-if="hasVolumes" class="volumes-list">
      <div v-for="volume in volumes" :key="volume.id" class="volume-item">
        <div class="volume-header">
          <div
            class="volume-header-content"
            role="button"
            tabindex="0"
            :aria-expanded="isVolumeExpanded(volume.id)"
            @click="handleToggleVolume(volume.id)"
            @keydown.enter.prevent="handleToggleVolume(volume.id)"
            @keydown.space.prevent="handleToggleVolume(volume.id)"
          >
            <i
              :class="['pi volume-toggle-icon', volumeToggleIcon(volume.id)]"
            ></i>
            <i class="pi pi-book volume-icon"></i>
            <span class="volume-title">{{ getVolumeDisplayTitle(volume) }}</span>
            <span v-if="hasChapters(volume)" class="volume-chapter-count">
              ({{ chapterCount(volume) }} 章)
            </span>
          </div>
          <div
            class="volume-actions"
            :class="{ 'volume-actions-visible': showVolumeActions(volume.id) }"
            @click.stop
          >
            <Button
              icon="pi pi-pencil"
              class="p-button-text p-button-sm p-button-rounded action-button"
              size="small"
              title="编辑"
              @click="handleEditVolume(volume)"
            />
            <Button
              icon="pi pi-trash"
              class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
              size="small"
              title="删除"
              @click="handleDeleteVolume(volume)"
            />
          </div>
        </div>
        <Transition name="slide-down">
          <div
            v-if="hasExpandedChapters(volume)"
            class="chapters-list"
            @dragover.prevent="handleDragOver($event, volume.id)"
            @drop="handleDrop($event, volume.id)"
            @dragleave="handleDragLeave"
            :class="{ 'drag-over': isListDragOver(volume.id) }"
          >
            <ChapterListItem
              v-for="(chapter, index) in chaptersOf(volume)"
              :key="chapter.id"
              :chapter="chapter"
              :index="index"
              :volume-chapters-count="volume.chapters?.length || 0"
              :book="book"
              :touch-mode="touchMode"
              :is-moving-chapter="isMovingChapter"
              :is-selected="isChapterSelected(chapter.id)"
              :is-loading="isSelectedChapterLoading(chapter.id)"
              :is-drag-over="isChapterDragOver(volume.id, index)"
              :is-dragging="isChapterDragging(chapter.id)"
              @navigate="handleNavigateToChapter(chapter)"
              @edit="handleEditChapter(chapter)"
              @delete="handleDeleteChapter(chapter)"
              @move="(direction) => handleMoveChapter(chapter, volume.id, index, direction)"
              @dragstart="(event) => handleDragStart(event, chapter, volume.id, index)"
              @dragend="handleDragEnd"
              @dragover="(event) => handleDragOver(event, volume.id, index)"
              @drop="(event) => handleDrop(event, volume.id, index)"
            />
          </div>
        </Transition>
      </div>
    </div>
    <div v-else class="empty-state">
      <p class="text-moon/60 text-sm">暂无卷和章节</p>
    </div>
  </div>
</template>

<style scoped>
.volumes-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  padding: 0 0.5rem;
}

/* 加载状态 */
.volumes-loading {
  padding: 1rem;
}

.volumes-loading .mb-2 {
  margin-bottom: 0.5rem;
}

.volumes-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

.volume-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 0;
  overflow: hidden;
}

.volume-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--moon-opacity-90);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  min-width: 0;
  overflow: hidden;
}

.volume-header:hover {
  background: var(--white-opacity-8);
  border-color: var(--primary-opacity-30);
}

.volume-header-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.volume-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  max-width: 0;
  overflow: hidden;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.2s ease;
}

.volume-header:hover .volume-actions {
  opacity: 1;
  max-width: 5rem;
}

.volume-actions-visible {
  opacity: 1;
  max-width: 5rem;
}

.action-button {
  min-width: 1.5rem !important;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.action-button .p-button-icon {
  font-size: 0.75rem !important;
}

.volume-toggle-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  flex-shrink: 0;
}

.volume-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
  flex-shrink: 0;
}

.volume-title {
  flex: 1;
  /* 设计系统：卷名用显示字体，强化"本卷"的阅读分章感 */
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-weight: 600;
  letter-spacing: -0.005em;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-chapter-count {
  font-family:
    'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 400;
  flex-shrink: 0;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  margin-left: 0.25rem;
  padding-left: 0.375rem;
  /* 给右侧留 4px 缓冲，避免 .chapter-item:hover 的 translateX(2px) 被 .volume-item 的 overflow:hidden 截掉。 */
  padding-right: 0.25rem;
  border-left: 1px solid var(--white-opacity-10);
  min-width: 0;
}

/* 章节行（.chapter-item 系列）样式由子组件 ChapterListItem.vue 自带 scoped 样式负责，此处不再重复定义。 */

.chapters-list.drag-over {
  background: var(--primary-opacity-10);
  border-radius: 6px;
  border: 2px dashed var(--primary-opacity-40);
}

/* 触屏按下卷头反馈：章节行的同名反馈由 ChapterListItem.vue 自带。 */
.volume-header-content:active {
  transform: scale(0.99);
}

.volume-actions-visible .action-button {
  min-width: 1.875rem !important;
  width: 1.875rem !important;
  height: 1.875rem !important;
}

.volume-actions-visible .action-button:active {
  background: var(--white-opacity-15) !important;
  transform: scale(0.96);
}

/* 折叠/展开动画 */
.slide-down-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  overflow: hidden;
}

.slide-down-enter-from {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.slide-down-enter-to {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-from {
  opacity: 1;
  max-height: 1000px;
  transform: translateY(0);
}

.slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  transform: translateY(-10px);
}

.empty-state {
  padding: 2rem 1rem;
  text-align: center;
}
</style>
