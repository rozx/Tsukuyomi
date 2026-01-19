<script setup lang="ts">
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils';

interface DraggedChapter {
  chapter: Chapter;
  sourceVolumeId: string;
  sourceIndex: number;
}

const _props = defineProps<{
  volumes: Volume[];
  book: Novel | null;
  selectedChapterId: string | null;
  isPageLoading: boolean;
  isVolumeExpanded: (volumeId: string) => boolean;
  draggedChapter: DraggedChapter | null;
  dragOverVolumeId: string | null;
  dragOverIndex: number | null;
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
}>();

const handleToggleVolume = (volumeId: string) => {
  emit('toggle-volume', volumeId);
};

const handleNavigateToChapter = (chapter: Chapter) => {
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
    <div v-else-if="volumes.length > 0" class="volumes-list">
      <div v-for="volume in volumes" :key="volume.id" class="volume-item">
        <div class="volume-item">
          <div class="volume-header">
            <div class="volume-header-content" @click="handleToggleVolume(volume.id)">
              <i
                :class="[
                  'pi volume-toggle-icon',
                  isVolumeExpanded(volume.id) ? 'pi-chevron-down' : 'pi-chevron-right',
                ]"
              ></i>
              <i class="pi pi-book volume-icon"></i>
              <span class="volume-title">{{ getVolumeDisplayTitle(volume) }}</span>
              <span
                v-if="volume.chapters && volume.chapters.length > 0"
                class="volume-chapter-count"
              >
                ({{ volume.chapters.length }} 章)
              </span>
            </div>
            <div class="volume-actions" @click.stop>
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
              v-if="volume.chapters && volume.chapters.length > 0 && isVolumeExpanded(volume.id)"
              class="chapters-list"
              @dragover.prevent="handleDragOver($event, volume.id)"
              @drop="handleDrop($event, volume.id)"
              @dragleave="handleDragLeave"
              :class="{
                'drag-over': dragOverVolumeId === volume.id && dragOverIndex === null,
              }"
            >
              <div
                v-for="(chapter, index) in volume.chapters"
                :key="chapter.id"
                :class="[
                  'chapter-item',
                  { 'chapter-item-selected': selectedChapterId === chapter.id },
                  {
                    'drag-over': dragOverVolumeId === volume.id && dragOverIndex === index,
                  },
                  { dragging: draggedChapter?.chapter.id === chapter.id },
                ]"
                draggable="true"
                @dragstart="handleDragStart($event, chapter, volume.id, index)"
                @dragend="handleDragEnd($event)"
                @dragover.prevent.stop="handleDragOver($event, volume.id, index)"
                @drop.stop="handleDrop($event, volume.id, index)"
              >
                <div class="chapter-content" @click="handleNavigateToChapter(chapter)">
                  <i class="pi pi-bars drag-handle"></i>
                  <i class="pi pi-file chapter-icon"></i>
                  <span class="chapter-title">{{
                    getChapterDisplayTitle(chapter, book || undefined)
                  }}</span>
                  <i
                    v-if="chapter.summary"
                    class="pi pi-info-circle summary-icon"
                    v-tooltip.bottom="{
                      value: chapter.summary,
                      pt: {
                        text: {
                          style: {
                            maxWidth: '300px',
                            whiteSpace: 'pre-wrap',
                          },
                        },
                      },
                    }"
                  ></i>
                </div>
                <div class="chapter-actions" @click.stop>
                  <Button
                    icon="pi pi-pencil"
                    class="p-button-text p-button-sm p-button-rounded action-button"
                    size="small"
                    title="编辑"
                    @click="handleEditChapter(chapter)"
                  />
                  <Button
                    icon="pi pi-trash"
                    class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
                    size="small"
                    title="删除"
                    @click="handleDeleteChapter(chapter)"
                  />
                </div>
              </div>
            </div>
          </Transition>
        </div>
      </div>
    </div>
    <div v-else-if="!isPageLoading" class="empty-state">
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
}

.volume-item {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
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
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.volume-header:hover .volume-actions {
  opacity: 1;
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
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.volume-chapter-count {
  font-size: 0.75rem;
  color: var(--moon-opacity-70);
  font-weight: 400;
}

.chapters-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-left: 1rem;
  padding-left: 0.75rem;
  border-left: 1px solid var(--white-opacity-10);
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}

.chapter-item:hover {
  background: var(--primary-opacity-15);
  color: var(--moon-opacity-95);
  border-color: var(--primary-opacity-30);
  transform: translateX(2px);
}

.chapter-item.dragging {
  opacity: 0.5;
}

.chapter-item.drag-over {
  background: var(--primary-opacity-20) !important;
  border-color: var(--primary-opacity-50) !important;
  border-style: dashed !important;
}

.chapter-item-selected {
  background: var(--primary-opacity-15) !important;
  border-color: var(--primary-opacity-40) !important;
  color: var(--moon-opacity-95) !important;
}

.chapter-item-selected .chapter-icon {
  color: var(--primary-opacity-90) !important;
}

.chapters-list.drag-over {
  background: var(--primary-opacity-10);
  border-radius: 6px;
  border: 2px dashed var(--primary-opacity-40);
}

.chapter-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex: 1;
  cursor: pointer;
  min-width: 0;
}

.drag-handle {
  font-size: 0.75rem;
  color: var(--moon-opacity-50);
  cursor: grab;
  flex-shrink: 0;
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .drag-handle {
  color: var(--primary-opacity-70);
}

.chapter-item.dragging .drag-handle {
  cursor: grabbing;
}

.chapter-actions {
  display: flex;
  align-items: center;
  gap: 0.125rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-actions {
  opacity: 1;
}

.chapter-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-60);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .chapter-icon {
  color: var(--primary-opacity-85);
  transform: scale(1.1);
}

.chapter-content .chapter-title {
  flex: 1;
  font-size: inherit;
}

.summary-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-50);
  cursor: help;
  flex-shrink: 0;
  margin-left: 0.25rem;
  opacity: 0;
  transition:
    color 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-item:hover .summary-icon {
  opacity: 1;
}

.summary-icon:hover {
  color: var(--primary-opacity-90);
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
