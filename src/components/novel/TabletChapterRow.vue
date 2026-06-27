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

<!-- 共享行基础样式（.vt-row*）与 VolumesListTablet 复用同一文件 -->
<style scoped src="./volume-tree-row.css"></style>

<style scoped>
/* 章节行专属样式；通用 .vt-row* 基础样式见 volume-tree-row.css */
.vt-row--chapter {
  padding-left: 28px;
  font-size: 12.5px;
  color: var(--moon-50-opacity-80);
}

.vt-row--active {
  background: var(--tsukuyomi-opacity-12);
  color: var(--primary-300);
}

.vt-chap-icon {
  font-size: 13px;
  width: 13px;
  flex-shrink: 0;
}
</style>
