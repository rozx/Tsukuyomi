<script setup lang="ts">
import type { Chapter, Novel } from 'src/models/novel';
import Button from 'primevue/button';
import { getChapterDisplayTitle } from 'src/utils';

// 卷章节列表中的单行章节：把多重 class 绑定、加载/拖拽/触屏按钮收敛到叶子组件。
// 父级 VolumesList 通过函数把布尔状态算好传入，避免在父模板里写 === / && 表达式。
defineProps<{
  chapter: Chapter;
  index: number;
  volumeChaptersCount: number;
  book: Novel | null;
  touchMode?: boolean;
  isMovingChapter?: boolean;
  isSelected: boolean;
  isLoading: boolean;
  isDragOver: boolean;
  isDragging: boolean;
}>();

defineEmits<{
  navigate: [];
  edit: [];
  delete: [];
  move: [direction: 'up' | 'down'];
  dragstart: [event: DragEvent];
  dragend: [event: DragEvent];
  dragover: [event: DragEvent];
  drop: [event: DragEvent];
}>();
</script>

<template>
  <div
    class="chapter-item"
    :class="{
      'chapter-item-selected': isSelected,
      'chapter-item-loading': isLoading,
      'chapter-item-touch': touchMode,
      'drag-over': isDragOver,
      dragging: isDragging,
    }"
    :draggable="!touchMode"
    role="button"
    tabindex="0"
    @click="$emit('navigate')"
    @keydown.enter.prevent="$emit('navigate')"
    @keydown.space.prevent="$emit('navigate')"
    @dragstart="$emit('dragstart', $event)"
    @dragend="$emit('dragend', $event)"
    @dragover.prevent.stop="$emit('dragover', $event)"
    @drop.stop="$emit('drop', $event)"
  >
    <div class="chapter-content">
      <i
        v-if="isLoading"
        class="pi pi-spinner pi-spin loading-icon"
        role="status"
        aria-label="章节加载中"
      />
      <i
        v-else-if="!touchMode"
        class="pi pi-bars drag-handle"
        aria-hidden="true"
        @click.stop
      />
      <i class="pi pi-file chapter-icon"></i>
      <span class="chapter-title">{{ getChapterDisplayTitle(chapter, book || undefined) }}</span>
    </div>
    <div
      class="chapter-actions"
      :class="{ 'chapter-actions-visible': touchMode && isSelected }"
      @click.stop
    >
      <Button
        v-if="touchMode"
        icon="pi pi-arrow-up"
        class="p-button-text p-button-sm p-button-rounded action-button"
        size="small"
        title="上移"
        :disabled="isMovingChapter || index === 0"
        @click="$emit('move', 'up')"
      />
      <Button
        v-if="touchMode"
        icon="pi pi-arrow-down"
        class="p-button-text p-button-sm p-button-rounded action-button"
        size="small"
        title="下移"
        :disabled="isMovingChapter || index === volumeChaptersCount - 1"
        @click="$emit('move', 'down')"
      />
      <Button
        icon="pi pi-pencil"
        class="p-button-text p-button-sm p-button-rounded action-button"
        size="small"
        title="编辑"
        @click="$emit('edit')"
      />
      <Button
        icon="pi pi-trash"
        class="p-button-text p-button-sm p-button-rounded p-button-danger action-button"
        size="small"
        title="删除"
        @click="$emit('delete')"
      />
    </div>
  </div>
</template>

<style scoped>
.action-button {
  min-width: 1.5rem !important;
  width: 1.5rem !important;
  height: 1.5rem !important;
  padding: 0 !important;
}

.action-button .p-button-icon {
  font-size: 0.75rem !important;
}

.chapter-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.375rem;
  padding: 0.625rem 0.5rem;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  font-size: 0.8125rem;
  color: var(--moon-opacity-80);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  min-width: 0;
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

.chapter-content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
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
  max-width: 0;
  overflow: hidden;
  margin-left: 0;
  transition:
    opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1),
    max-width 0.2s ease,
    margin-left 0.2s ease;
}

.chapter-item:hover .chapter-actions {
  opacity: 1;
  max-width: 4rem;
  margin-left: 0.25rem;
}

.chapter-actions-visible {
  opacity: 1;
  max-width: 8rem;
  margin-left: 0.25rem;
}

.chapter-actions-visible .action-button {
  min-width: 1.875rem !important;
  width: 1.875rem !important;
  height: 1.875rem !important;
}

.chapter-item-touch {
  padding: 0.625rem 0.5rem;
  flex-direction: column;
  align-items: stretch;
  gap: 0.25rem;
}

.chapter-item-touch .action-button:active {
  background: var(--white-opacity-15) !important;
  transform: scale(0.96);
}

.chapter-item-touch .chapter-content {
  width: 100%;
  gap: 0.25rem;
  overflow: hidden;
}

.chapter-item-touch .chapter-icon {
  display: none;
}

.chapter-item-touch .chapter-content .chapter-title {
  display: block;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.25;
}

.chapter-item-touch .chapter-actions {
  width: auto;
  justify-content: flex-end;
  align-self: flex-end;
  margin-top: 0.125rem;
  max-width: none;
  margin-left: auto;
}

.chapter-item-touch .chapter-actions:not(.chapter-actions-visible) {
  display: none;
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
  min-width: 0;
  font-size: inherit;
  white-space: normal;
  line-height: 1.35;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.loading-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-80);
  flex-shrink: 0;
}

.chapter-item-loading {
  pointer-events: none;
  opacity: 0.85;
}
</style>
