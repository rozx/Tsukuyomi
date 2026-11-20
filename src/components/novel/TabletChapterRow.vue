<script setup lang="ts">
import { useI18n } from 'vue-i18n';

import type { Volume, Chapter, Novel } from 'src/models/novel';
import { getChapterDisplayTitle } from 'src/utils';
import ChapterBatchCheck from 'src/components/novel/chapter-batch/ChapterBatchCheck.vue';
import ChapterBatchBadge from 'src/components/novel/chapter-batch/ChapterBatchBadge.vue';

const { t } = useI18n();

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
  /** 多选模式：复选框 + 状态徽章，隐藏 ⋮ */
  selecting?: boolean;
  checked?: boolean;
}>();

defineEmits<{
  navigate: [chapter: Chapter];
  more: [event: Event];
}>();
</script>

<template>
  <div
    class="vt-row vt-row--chapter"
    :class="{ 'vt-row--active': isSelected, 'vt-row--checked': selecting && checked }"
    role="button"
    tabindex="0"
    @click="$emit('navigate', chapter)"
    @keydown.enter.space.prevent="$emit('navigate', chapter)"
  >
    <ChapterBatchCheck v-if="selecting" :state="checked ? 'all' : 'none'" />
    <i
      v-else
      class="pi vt-chap-icon"
      :class="statusIcon(chapter.id)"
      :style="{ color: statusColor(chapter.id) }"
      aria-hidden="true"
    />
    <span class="vt-row-title">{{ getChapterDisplayTitle(chapter, book || undefined) }}</span>
    <ChapterBatchBadge v-if="selecting" :chapter-id="chapter.id" />
    <span v-else class="vt-row-count" :style="{ color: statusTextColor(chapter.id) }">
      {{ statusLabel(chapter.id) }}
    </span>
    <button
      v-if="!selecting"
      type="button"
      class="vt-row-more"
      :aria-label="t('readerUi.chapterActions')"
      @click.stop="$emit('more', $event)"
      @keydown.enter.stop
      @keydown.space.stop
    >
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

.vt-row--checked {
  background: var(--primary-opacity-10);
}

.vt-chap-icon {
  font-size: 13px;
  width: 13px;
  flex-shrink: 0;
}
</style>
