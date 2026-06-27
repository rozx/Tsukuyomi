<script setup lang="ts">
/**
 * 手机端 · 书籍详情 Overview（卷 / 章节 / 术语 / 角色 / 记忆 概览）。
 *
 * 承载原 BookDetailsMobile 的 Overview 分支与「卷 / 章节操作 picker」状态。
 * 样式由 BookDetailsMobile.vue 的非 scoped 样式表统一提供。
 */
import { ref, computed } from 'vue';
import MobileBottomSheet from 'src/components/layout/MobileBottomSheet.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { Chapter, Volume } from 'src/models/novel';
import BookMobileHero from './BookMobileHero.vue';
import BookMobileSegTabs from './BookMobileSegTabs.vue';
import BookMobileTabContent from './BookMobileTabContent.vue';

const ctx = injectBookDetailsPage();

// picker 标题：有目标则显示对应卷 / 章节名，否则回退通用标题（三元收进 computed）
const volumeSheetTitle = computed(() =>
  volumeActionTarget.value ? ctx.getVolumeDisplayTitle(volumeActionTarget.value) : '卷操作',
);
const chapterSheetTitle = computed(() =>
  chapterActionTarget.value
    ? ctx.getChapterDisplayTitle(chapterActionTarget.value.chapter, ctx.book.value || undefined)
    : '章节操作',
);
const moveUpDisabled = computed(() => !chapterActionCanMoveUp.value);
const moveDownDisabled = computed(() => !chapterActionCanMoveDown.value);

// 卷 / 章节行的"更多操作" picker —— 手机端替代桌面右键菜单 / 悬浮按钮。
// 通过单个 bottom sheet 承载编辑 / 删除 / 上移 / 下移动作，避免每行塞一堆图标。
const volumeActionTarget = ref<Volume | null>(null);
const openVolumeActions = (vol: Volume) => {
  volumeActionTarget.value = vol;
};
const closeVolumeActions = () => {
  volumeActionTarget.value = null;
};
const showVolumeActions = computed({
  get: () => volumeActionTarget.value !== null,
  set: (open) => {
    if (!open) closeVolumeActions();
  },
});
const runVolumeEdit = () => {
  const vol = volumeActionTarget.value;
  closeVolumeActions();
  if (vol) ctx.onEditVolume(vol);
};
const runVolumeDelete = () => {
  const vol = volumeActionTarget.value;
  closeVolumeActions();
  if (vol) ctx.onDeleteVolume(vol);
};

const chapterActionTarget = ref<{ chapter: Chapter; volumeId: string; index: number } | null>(null);
const openChapterActions = (chapter: Chapter, volumeId: string, index: number) => {
  chapterActionTarget.value = { chapter, volumeId, index };
};
const closeChapterActions = () => {
  chapterActionTarget.value = null;
};
const showChapterActions = computed({
  get: () => chapterActionTarget.value !== null,
  set: (open) => {
    if (!open) closeChapterActions();
  },
});
const chapterActionVolume = computed(() =>
  chapterActionTarget.value
    ? (ctx.volumes.value.find((v) => v.id === chapterActionTarget.value!.volumeId) ?? null)
    : null,
);
const chapterActionCanMoveUp = computed(() =>
  chapterActionTarget.value ? chapterActionTarget.value.index > 0 : false,
);
const chapterActionCanMoveDown = computed(() => {
  const target = chapterActionTarget.value;
  const vol = chapterActionVolume.value;
  if (!target || !vol?.chapters) return false;
  return target.index < vol.chapters.length - 1;
});
const runChapterEdit = () => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (target) ctx.onEditChapter(target.chapter);
};
const runChapterDelete = () => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (target) ctx.onDeleteChapter(target.chapter);
};
const runChapterMove = (direction: 'up' | 'down') => {
  const target = chapterActionTarget.value;
  closeChapterActions();
  if (!target) return;
  void ctx.onMoveChapter({ ...target, direction });
};
</script>

<template>
  <!-- ─────────────── 手机端 · 书籍详情 Overview ─────────────── -->
  <div v-if="ctx.book.value" class="mobile-bd-overview">
    <header class="mbd-appbar">
      <button
        class="mbd-icon-btn"
        aria-label="返回书籍列表"
        @click="() => void ctx.router.push('/books')"
      >
        <i class="pi pi-chevron-left" aria-hidden="true" />
      </button>
      <div class="mbd-appbar-text">
        <div class="mbd-appbar-title">{{ ctx.book.value.title }}</div>
        <div v-if="ctx.book.value.author" class="mbd-appbar-sub">{{ ctx.book.value.author }}</div>
      </div>
      <button class="mbd-icon-btn" aria-label="更多操作" @click="ctx.openBookDialog">
        <i class="pi pi-ellipsis-h" aria-hidden="true" />
      </button>
    </header>

    <div class="mbd-scroll">
      <!-- Hero row -->
      <BookMobileHero />

      <!-- Action row -->
      <div class="mbd-actions">
        <button
          class="mbd-btn mbd-btn-primary"
          :disabled="!ctx.continueReadingChapter.value"
          @click="ctx.continueReadingOnPhone"
        >
          <i class="pi pi-play" aria-hidden="true" />继续翻译
        </button>
        <button
          class="mbd-btn mbd-btn-outline mbd-btn-icon"
          aria-label="编辑书籍"
          @click="ctx.openBookDialog"
        >
          <i class="pi pi-pencil" aria-hidden="true" />
        </button>
        <button
          class="mbd-btn mbd-btn-outline mbd-btn-icon"
          aria-label="检查更新"
          @click="ctx.openScraperDialog"
        >
          <i class="pi pi-download" aria-hidden="true" />
        </button>
      </div>

      <!-- Stats strip -->
      <div v-if="ctx.stats.value" class="mbd-stats">
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.stats.value.volumeCount }}</div>
          <div class="mbd-stat-label">卷数</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.stats.value.chapterCount }}</div>
          <div class="mbd-stat-label">章节</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.formatWordCount(ctx.stats.value.wordCount) }}</div>
          <div class="mbd-stat-label">字数</div>
        </div>
        <div class="mbd-stat">
          <div class="mbd-stat-value">{{ ctx.formatRelativeDate(ctx.book.value.lastEdited) }}</div>
          <div class="mbd-stat-label">更新</div>
        </div>
      </div>

      <!-- Segmented tabs -->
      <BookMobileSegTabs />

      <!-- Tab content -->
      <BookMobileTabContent
        @volume-action="openVolumeActions"
        @chapter-action="
          (payload) => openChapterActions(payload.chapter, payload.volumeId, payload.index)
        "
      />
    </div>
  </div>

  <!-- ─────────────── 卷 / 章节操作 picker（overview 触发） ─────────────── -->
  <!-- 卷操作 picker —— 编辑 / 删除 -->
  <MobileBottomSheet
    v-model:visible="showVolumeActions"
    :title="volumeSheetTitle"
    eyebrow="VOLUME"
    min-height="auto"
  >
    <button type="button" class="mbr-batch-picker-option" @click="runVolumeEdit">
      <i class="pi pi-pencil mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">编辑卷</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option mbr-batch-picker-option--danger"
      @click="runVolumeDelete"
    >
      <i class="pi pi-trash mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">删除卷</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
  </MobileBottomSheet>

  <!-- 章节操作 picker —— 编辑 / 删除 / 上下移 -->
  <MobileBottomSheet
    v-model:visible="showChapterActions"
    :title="chapterSheetTitle"
    eyebrow="CHAPTER"
    min-height="auto"
  >
    <button type="button" class="mbr-batch-picker-option" @click="runChapterEdit">
      <i class="pi pi-pencil mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">编辑章节</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option"
      :disabled="moveUpDisabled"
      @click="runChapterMove('up')"
    >
      <i class="pi pi-arrow-up mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">上移</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="mbr-batch-picker-option"
      :disabled="moveDownDisabled"
      @click="runChapterMove('down')"
    >
      <i class="pi pi-arrow-down mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">下移</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
    <div class="mbr-batch-picker-sep" />
    <button
      type="button"
      class="mbr-batch-picker-option mbr-batch-picker-option--danger"
      @click="runChapterDelete"
    >
      <i class="pi pi-trash mbr-batch-picker-option-icon" aria-hidden="true" />
      <span class="mbr-batch-picker-option-label">删除章节</span>
      <i class="pi pi-chevron-right mbr-batch-picker-chev" aria-hidden="true" />
    </button>
  </MobileBottomSheet>
</template>
