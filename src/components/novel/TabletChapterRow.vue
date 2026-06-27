<script setup lang="ts">
import type { Volume, Chapter, Novel } from 'src/models/novel';
import { getChapterDisplayTitle } from 'src/utils';

// 平板章节树的单行章节：把状态图标/颜色/标签的多重绑定收敛到叶子组件，
// 降低 VolumesListTablet 模板的圈复杂度。状态取值函数由父级透传。
defineProps<{
  chapter: Chapter;
  isSelected: boolean;
  book: Novel | null;
  statusIcon: (chapterId: string) => string;
  statusColor: (chapterId: string) => string;
  statusTextColor: (chapterId: string) => string;
  statusLabel: (chapterId: string) => string;
}>();

defineEmits<{
  navigate: [chapter: Chapter];
  more: [event: Event];
}>();
</script>

<template>
  <div
    class="vt-row vt-row--chapter"
    :class="{ 'vt-row--active': isSelected }"
    role="button"
    tabindex="0"
    @click="$emit('navigate', chapter)"
    @keydown.enter.space.prevent="$emit('navigate', chapter)"
  >
    <i
      class="pi vt-chap-icon"
      :class="statusIcon(chapter.id)"
      :style="{ color: statusColor(chapter.id) }"
      aria-hidden="true"
    />
    <span class="vt-row-title">{{ getChapterDisplayTitle(chapter, book || undefined) }}</span>
    <span class="vt-row-count" :style="{ color: statusTextColor(chapter.id) }">
      {{ statusLabel(chapter.id) }}
    </span>
    <button type="button" class="vt-row-more" aria-label="章节操作" @click.stop="$emit('more', $event)">
      <i class="pi pi-ellipsis-v" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.vt-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  color: var(--moon-50-opacity-90);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
  text-align: left;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.vt-row:hover {
  background: var(--white-opacity-3);
}

.vt-row--chapter {
  padding-left: 28px;
  font-size: 12.5px;
  color: var(--moon-50-opacity-80);
}

.vt-row--active {
  background: var(--tsukuyomi-opacity-12);
  color: var(--primary-300);
}

.vt-row-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vt-row-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  flex-shrink: 0;
}

.vt-row-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin-left: 2px;
  margin-right: -4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--moon-50-opacity-45);
  cursor: pointer;
  flex-shrink: 0;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.vt-row-more:hover {
  background: var(--white-opacity-6);
  color: var(--moon-50-opacity-85);
}

.vt-row-more i {
  font-size: 12px;
}

.vt-chap-icon {
  font-size: 13px;
  width: 13px;
  flex-shrink: 0;
}
</style>
