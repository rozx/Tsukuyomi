<script setup lang="ts">
/**
 * 平板书库详情章节树（卷 / 章节折叠列表 + 编辑模式 ⋮ 菜单 + 折叠预览）。
 * 从 BooksPageTablet 抽出。样式由 BooksPageTablet.vue 提供。
 */
import { computed } from 'vue';
import { injectBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';
import { getVolumeDisplayTitle, getChapterDisplayTitle } from 'src/utils/novel-utils';
import type { Chapter, Volume } from 'src/models/novel';

const t = injectBooksTabletPage();

const book = computed(() => t.selectedBook.value);
const chapterTotal = computed(() => (book.value ? t.ctx.getTotalChapters(book.value) : 0));
const hasVolumes = computed(() => !!book.value?.volumes && book.value.volumes.length > 0);

const editBtnClass = computed(() => ({
  'tl-chapters-edit-btn--on': t.editMode.value,
}));
const editBtnTitle = computed(() => (t.editMode.value ? '完成编辑' : '编辑章节'));
const editBtnIcon = computed(() => (t.editMode.value ? 'pi-check' : 'pi-pencil'));
const editBtnText = computed(() => (t.editMode.value ? '完成' : '编辑'));

const volIconClass = (volId: string) =>
  t.isVolumeExpanded(volId)
    ? 'pi-folder-open tl-tree-vol-icon-open'
    : 'pi-folder tl-tree-vol-icon-closed';
const volTitle = (volume: Volume, vi: number) => getVolumeDisplayTitle(volume) || `卷 ${vi + 1}`;
const volChapterCount = (volume: Volume) => volume.chapters?.length ?? 0;
const chapTitle = (chapter: Chapter, ci: number) =>
  getChapterDisplayTitle(chapter, book.value!) || `第 ${ci + 1} 章`;
const chaptersOf = (volume: Volume) => volume.chapters ?? [];
const volKey = (volume: Volume, vi: number) => volume.id ?? vi;
const chapKey = (chapter: Chapter, ci: number) => chapter.id ?? ci;
const remainingChapters = (volume: Volume) =>
  (volume.chapters?.length ?? 0) - t.COLLAPSED_PREVIEW;
const hasCollapsedMore = (volume: Volume) =>
  !t.isVolumeExpanded(volume.id) && volChapterCount(volume) > t.COLLAPSED_PREVIEW;
// 阻止冒泡到行 click
const onVolumeMore = (e: Event, volume: Volume) => t.openVolumeMenu(e, volume);
const onChapterMore = (e: Event, chapter: Chapter, volumeId: string, ci: number) =>
  t.openChapterMenu(e, chapter, volumeId, ci);
const onChapterClick = (chapter: Chapter) => book.value && t.openChapter(book.value, chapter);
const onToggleVolume = (volId: string) => t.toggleVolume(volId);
</script>

<template>
  <section v-if="book" class="tl-chapters">
    <header class="tl-chapters-head">
      <span>章节 · {{ chapterTotal }}</span>
      <span v-if="t.isLoadingProgress.value" class="tl-chapters-loading">
        <i class="pi pi-spin pi-spinner" aria-hidden="true" /> 正在统计进度…
      </span>
      <button
        type="button"
        class="tl-chapters-edit-btn"
        :class="editBtnClass"
        :aria-pressed="t.editMode.value"
        :title="editBtnTitle"
        @click="t.toggleEditMode"
      >
        <i class="pi" :class="editBtnIcon" aria-hidden="true" />
        <span>{{ editBtnText }}</span>
      </button>
    </header>

    <div v-if="hasVolumes" class="tl-tree">
      <div v-for="(volume, vi) in book.volumes" :key="volKey(volume, vi)" class="tl-tree-group">
        <div
          class="tl-tree-vol"
          role="button"
          :aria-expanded="t.isVolumeExpanded(volume.id)"
          @click="onToggleVolume(volume.id)"
        >
          <i class="pi" :class="volIconClass(volume.id)" aria-hidden="true" />
          <span class="tl-tree-vol-title">{{ volTitle(volume, vi) }}</span>
          <span class="tl-tree-count">{{ volChapterCount(volume) }} 章</span>
          <button
            v-if="t.editMode.value"
            type="button"
            class="tl-tree-more-btn"
            aria-label="卷操作"
            @click="onVolumeMore($event, volume)"
          >
            <i class="pi pi-ellipsis-v" aria-hidden="true" />
          </button>
        </div>
        <div
          v-for="(chapter, ci) in t.visibleChapters(volume.id, chaptersOf(volume))"
          :key="chapKey(chapter, ci)"
          class="tl-tree-chap"
          :class="{ 'tl-tree-chap--readonly': t.editMode.value }"
          :role="t.chapterRowRole(chapter)"
          @click="onChapterClick(chapter)"
        >
          <i class="pi" :class="t.chIcon(chapter.id)" :style="{ color: t.chColor(chapter.id) }" aria-hidden="true" />
          <span class="tl-tree-chap-title">{{ chapTitle(chapter, ci) }}</span>
          <span class="tl-tree-count" :style="{ color: t.chTextColor(chapter.id) }">
            {{ t.chLabel(chapter.id) }}
          </span>
          <button
            v-if="t.editMode.value"
            type="button"
            class="tl-tree-more-btn"
            aria-label="章节操作"
            @click="onChapterMore($event, chapter, volume.id, ci)"
          >
            <i class="pi pi-ellipsis-v" aria-hidden="true" />
          </button>
        </div>
        <div
          v-if="hasCollapsedMore(volume)"
          class="tl-tree-more"
          role="button"
          @click="onToggleVolume(volume.id)"
        >
          展开余下 {{ remainingChapters(volume) }} 章
        </div>
      </div>
    </div>
    <div v-else class="tl-chapters-empty">
      <i class="pi pi-book" aria-hidden="true" /> 暂无章节
    </div>
  </section>
</template>
