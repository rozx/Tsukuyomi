<script setup lang="ts">
/**
 * 手机端卷 / 章节树（共享片段）。
 *
 * 同时服务于「书籍详情 Overview」的章节标签页与「阅读器章节目录 picker」：
 * - Overview：volumeTag='div'、showRowActions=true，行尾 ⋮ 按钮触发卷 / 章节操作 picker。
 * - Picker：volumeTag='button'、showRowActions=false，仅用于跳转章节。
 *
 * 样式由父级 BookDetailsMobile.vue 的非 scoped 样式表统一提供（mbd-tree* 前缀唯一）。
 */
import { computed } from 'vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Chapter, Volume } from 'src/models/novel';

const ctx = injectBookDetailsPage();

const props = defineProps<{
  activeChapterId: string | null | undefined;
  volumeTag: 'div' | 'button';
  showRowActions?: boolean;
}>();

const emit = defineEmits<{
  navigate: [chapter: Chapter];
  'volume-action': [volume: Volume];
  'chapter-action': [payload: { chapter: Chapter; volumeId: string; index: number }];
}>();

// 模板内三元 / 比较抽到方法，降低段落认知复杂度（CRAP = cyc²+cyc，需压低分支数）
const volumeRole = computed(() => (props.volumeTag === 'div' ? 'button' : undefined));
const folderIcon = (volId: string) =>
  ctx.isVolumeExpanded(volId) ? 'pi-folder-open' : 'pi-folder';
const isActive = (chId: string) => props.activeChapterId === chId;
const volumeRowClass = (volId: string) => [
  'mbd-tree-row',
  'mbd-tree-row--vol',
  { 'mbd-tree-row--vol-open': ctx.isVolumeExpanded(volId) },
];
const chapterRowClass = (chId: string) => [
  'mbd-tree-row',
  'mbd-tree-row--chapter',
  { 'mbd-tree-row--active': isActive(chId) },
];
// 阻止冒泡：避免点 ⋮ 触发所在行的 click（行 click 会折叠卷 / 跳转章节）
const onVolumeMore = (e: Event, vol: Volume) => {
  e.stopPropagation();
  emit('volume-action', vol);
};
const onChapterMore = (
  e: Event,
  chapter: Chapter,
  volumeId: string,
  index: number,
) => {
  e.stopPropagation();
  emit('chapter-action', { chapter, volumeId, index });
};
// 把 || / ?? / ?. 留在脚本侧，避免模板表达式贡献分支复杂度
const chaptersOf = (vol: Volume) => vol.chapters ?? [];
const chapterCount = (vol: Volume) => vol.chapters?.length ?? 0;
</script>

<template>
  <template v-for="vol in ctx.volumes.value" :key="vol.id">
    <component
      :is="volumeTag"
      :class="volumeRowClass(vol.id)"
      :role="volumeRole"
      @click="ctx.toggleVolumeById(vol.id)"
    >
      <i
        class="pi mbd-tree-vol-icon"
        :class="folderIcon(vol.id)"
        aria-hidden="true"
      />
      <span class="mbd-tree-row-title">{{ ctx.getVolumeDisplayTitle(vol) }}</span>
      <span class="mbd-tree-row-count">{{ chapterCount(vol) }} 章</span>
        <button
          v-if="showRowActions"
          type="button"
          class="mbd-tree-row-more"
          aria-label="卷操作"
          @click="onVolumeMore($event, vol)"
        >
        <i class="pi pi-ellipsis-v" aria-hidden="true" />
      </button>
    </component>
    <template v-if="ctx.isVolumeExpanded(vol.id)">
      <div
        v-for="(ch, chIdx) in chaptersOf(vol)"
        :key="ch.id"
        :class="chapterRowClass(ch.id)"
        role="button"
        @click="emit('navigate', ch)"
      >
        <i
          class="pi mbd-tree-chap-icon"
          :class="ctx.chapterStatusIcon(ch.id)"
          :style="{ color: ctx.chapterStatusColor(ch.id) }"
          aria-hidden="true"
        />
        <span class="mbd-tree-row-title">
          {{ ctx.getChapterDisplayTitle(ch, ctx.book.value || undefined) }}
        </span>
        <span class="mbd-tree-row-count" :style="{ color: ctx.chapterStatusTextColor(ch.id) }">
          {{ ctx.chapterStatusLabel(ch.id) }}
        </span>
        <button
          v-if="showRowActions"
          type="button"
          class="mbd-tree-row-more"
          aria-label="章节操作"
          @click="onChapterMore($event, ch, vol.id, chIdx)"
        >
          <i class="pi pi-ellipsis-v" aria-hidden="true" />
        </button>
      </div>
    </template>
  </template>

  <div v-if="ctx.volumes.value.length === 0" class="mbd-tree-empty">
    <i class="pi pi-folder-open" aria-hidden="true" />
    <span>尚未创建卷或章节</span>
  </div>
</template>
