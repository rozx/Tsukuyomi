<script setup lang="ts">
/**
 * 平板书库变体（主从布局：左侧列表 + 右侧详情 + 右侧 rail）。
 *
 * 本文件只做编排：业务状态由 useBooksTabletPage 统一持有并 provide 给各片段
 * （Sidebar / Detail / SideRail），片段通过 injectBooksTabletPage() 取同一份状态。
 * 注意：本文件保留全部平板样式（非 scoped），因为 tl- 前缀仅在本页使用，
 * 抽出的片段作为后代元素可直接命中这些全局类，避免跨组件 scoped 样式失效。
 */
import Menu from 'primevue/menu';
import EditVolumeDialog from 'src/components/dialogs/EditVolumeDialog.vue';
import EditChapterDialog from 'src/components/dialogs/EditChapterDialog.vue';
import DeleteVolumeConfirmDialog from 'src/components/dialogs/DeleteVolumeConfirmDialog.vue';
import DeleteChapterConfirmDialog from 'src/components/dialogs/DeleteChapterConfirmDialog.vue';
import AddVolumeDialog from 'src/components/dialogs/AddVolumeDialog.vue';
import AddChapterDialog from 'src/components/dialogs/AddChapterDialog.vue';
import { provideBooksTabletPage } from 'src/composables/books-page/useBooksTabletPage';
import BooksTabletSidebar from './BooksTabletSidebar.vue';
import BooksTabletDetail from './BooksTabletDetail.vue';
import BooksTabletSideRail from './BooksTabletSideRail.vue';

const t = provideBooksTabletPage();
// 模板字符串 ref 绑定只查 <script setup> 顶层变量，故把 composable 的 ref 暴露到顶层。
const actionMenuRef = t.actionMenuRef;
</script>

<template>
  <div
    class="tablet-library w-full h-full flex min-h-0"
    :class="{ 'tablet-library--list-open': t.isListOpen.value }"
  >
    <!-- 竖屏叠层：list dock 打开时点外侧关闭；横屏由 CSS display:none 隐藏 -->
    <div
      v-if="t.isListOpen.value"
      class="tl-list-scrim"
      aria-hidden="true"
      @click="t.toggleList"
    />

    <!-- 左侧书籍列表 -->
    <BooksTabletSidebar />

    <!-- 右侧详情 -->
    <BooksTabletDetail />

    <!-- 右侧 rail -->
    <BooksTabletSideRail />

    <!-- 隐藏的文件输入（JSON 导入）—— 桌面与手机都在自己模板里挂一份 -->
    <input
      :ref="(el) => { t.ctx.fileInputRef.value = el as HTMLInputElement | null; }"
      type="file"
      accept=".json,.txt"
      class="hidden"
      @change="t.ctx.handleFileSelect"
    />

    <!-- ⋮ 动作菜单 —— 卷 / 章节共用一个 Menu 实例 -->
    <Menu ref="actionMenuRef" :model="t.actionMenuItems.value" :popup="true" append-to="body" />

    <!-- 卷 / 章节编辑对话框 —— 绑定 useChapterManagement 的状态与处理函数 -->
    <EditVolumeDialog
      v-model:visible="t.chapterMgmt.showEditVolumeDialog.value"
      :title="t.chapterMgmt.editingVolumeTitle.value"
      :translation="t.chapterMgmt.editingVolumeTranslation.value"
      :loading="t.chapterMgmt.isEditingVolume.value"
      @save="t.chapterMgmt.handleEditVolume"
    />
    <EditChapterDialog
      v-model:visible="t.chapterMgmt.showEditChapterDialog.value"
      :title="t.chapterMgmt.editingChapterTitle.value || ''"
      :translation="t.chapterMgmt.editingChapterTranslation.value || ''"
      :target-volume-id="t.chapterMgmt.editingChapterTargetVolumeId.value || null"
      :volume-options="t.volumeOptions.value"
      :loading="t.chapterMgmt.isEditingChapter.value"
      :web-url="t.chapterMgmt.editingChapterWebUrl.value || ''"
      :last-updated="t.chapterMgmt.editingChapterLastUpdated.value"
      :last-edited="t.chapterMgmt.editingChapterLastEdited.value"
      :created-at="t.chapterMgmt.editingChapterCreatedAt.value"
      :translation-instructions="t.chapterMgmt.editingChapterTranslationInstructions.value || ''"
      :polish-instructions="t.chapterMgmt.editingChapterPolishInstructions.value || ''"
      :proofreading-instructions="t.chapterMgmt.editingChapterProofreadingInstructions.value || ''"
      @save="t.chapterMgmt.handleEditChapter"
    />
    <DeleteVolumeConfirmDialog
      v-model:visible="t.chapterMgmt.showDeleteVolumeConfirm.value"
      :volume-title="t.chapterMgmt.deletingVolumeTitle.value"
      :loading="t.chapterMgmt.isDeletingVolume.value"
      @confirm="t.chapterMgmt.handleDeleteVolume"
    />
    <DeleteChapterConfirmDialog
      v-model:visible="t.chapterMgmt.showDeleteChapterConfirm.value"
      :chapter-title="t.chapterMgmt.deletingChapterTitle.value"
      :loading="t.chapterMgmt.isDeletingChapter.value"
      @confirm="t.chapterMgmt.handleDeleteChapter"
    />
    <AddVolumeDialog
      v-model:visible="t.chapterMgmt.showAddVolumeDialog.value"
      :loading="t.chapterMgmt.isAddingVolume.value"
      @save="t.chapterMgmt.handleAddVolume"
    />
    <AddChapterDialog
      v-model:visible="t.chapterMgmt.showAddChapterDialog.value"
      :volume-options="t.volumeOptions.value"
      :loading="t.chapterMgmt.isAddingChapter.value"
      @save="t.chapterMgmt.handleAddChapter"
    />
  </div>
</template>

<style>
.tablet-library {
  position: relative;
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  overflow: hidden;
}

/* 左侧列表 */
.tl-list {
  width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-6);
  background: rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-right-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

/* 横屏默认：list-open 不影响布局；list 关闭时宽度归零、内容面板自动填满 */
.tablet-library:not(.tablet-library--list-open) .tl-list {
  width: 0;
  border-right-color: transparent;
}

.tablet-library:not(.tablet-library--list-open) .tl-list > * {
  opacity: 0;
  pointer-events: none;
}

/* 遮罩：仅竖屏 list 打开时显示，点击关闭 */
.tl-list-scrim {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  z-index: 15;
}

@media (orientation: portrait) {
  .tl-list-scrim {
    display: block;
  }

  /* 竖屏 list 变成 overlay drawer，不参与 flex 布局——详情面板始终全宽 */
  .tl-list {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 320px;
    max-width: 86%;
    z-index: 20;
    /* token: near night-300 @ 96% */
    background: var(--shell-opacity-96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  }

  .tablet-library:not(.tablet-library--list-open) .tl-list {
    width: 320px;
    border-right-color: var(--white-opacity-6);
    transform: translateX(-100%);
  }

  .tablet-library:not(.tablet-library--list-open) .tl-list > * {
    opacity: 1;
    pointer-events: none;
  }
}

.tl-list-head {
  padding: 20px 20px 14px;
  border-bottom: 1px solid var(--white-opacity-6);
  flex-shrink: 0;
}

.tl-eyebrow {
  font-weight: 500;
  font-size: 10px;
  letter-spacing: 0.22em;
  /* token: accent-silver @ 75% */
  color: var(--accent-opacity-75);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tl-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 24px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  margin: 0;
  line-height: 1.15;
}

.tl-meta {
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  margin-top: 6px;
}

.tl-toolbar {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.tl-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
}

.tl-input-wrap > i {
  position: absolute;
  left: 10px;
  color: var(--moon-50-opacity-55);
  font-size: 12px;
  pointer-events: none;
}

.tl-input {
  width: 100%;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  padding: 7px 30px 7px 30px;
  color: var(--moon-50-opacity-100);
  font-family: inherit;
  font-size: 12px;
  outline: none;
}

.tl-input:focus {
  /* token: tsukuyomi-300 */
  border-color: var(--tsukuyomi-300);
  /* token: tsukuyomi-300 @ 20% */
  box-shadow: 0 0 0 2px var(--tsukuyomi-300-opacity-20);
}

.tl-input-clear {
  position: absolute;
  right: 6px;
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  color: var(--moon-50-opacity-55);
  cursor: pointer;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-input-clear i {
  font-size: 10px;
}

.tl-icon-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--white-opacity-4);
  border: 1px solid var(--white-opacity-10);
  color: var(--moon-50-opacity-75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
}

.tl-icon-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.tl-icon-btn i {
  font-size: 12px;
}

.tl-list-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}

.tl-list-row {
  width: 100%;
  padding: 10px 18px;
  display: flex;
  gap: 12px;
  align-items: center;
  border: none;
  background: transparent;
  /* token: white @ 4% */
  border-bottom: 1px solid var(--white-opacity-4);
  cursor: pointer;
  text-align: left;
  color: inherit;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  border-left: 3px solid transparent;
}

.tl-list-row:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-list-row--active {
  background: var(--tsukuyomi-opacity-10);
  /* token: tsukuyomi-300 */
  border-left-color: var(--tsukuyomi-300);
}

.tl-list-cover {
  width: 40px;
  height: 60px;
  flex-shrink: 0;
  border-radius: 4px;
  overflow: hidden;
  /* token: night-300 */
  background: var(--night-300);
}

.tl-list-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-list-body {
  flex: 1;
  min-width: 0;
}

.tl-list-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-author {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-list-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  margin-top: 4px;
}

.tl-list-star {
  /* token: warning */
  color: var(--color-warning);
  font-size: 10px;
  flex-shrink: 0;
}

.tl-dot {
  opacity: 0.5;
}

.tl-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px 16px;
  text-align: center;
  color: var(--moon-50-opacity-60);
  font-size: 12px;
}

.tl-state-icon {
  font-size: 32px;
  /* token: moon-50 @ 20% */
  color: var(--moon-50-opacity-20);
}

/* 右侧详情 */
.tl-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.tl-detail-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 28px 36px 36px;
}

.tl-detail-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--moon-50-opacity-50);
}

.tl-detail-empty i {
  font-size: 42px;
  /* token: moon-50 @ 20% */
  color: var(--moon-50-opacity-20);
}

.tl-detail-empty-title {
  font-size: 15px;
  color: var(--moon-50-opacity-75);
  font-weight: 500;
}

.tl-detail-empty-sub {
  font-size: 12px;
  color: var(--moon-50-opacity-45);
}

/* Hero */
.tl-hero {
  display: flex;
  gap: 24px;
  margin-bottom: 24px;
}

.tl-hero-cover {
  position: relative;
  width: 140px;
  height: 210px;
  flex-shrink: 0;
  border-radius: 8px;
  overflow: hidden;
  /* token: tsukuyomi-500 @ 50% → night-200 */
  background: linear-gradient(135deg, var(--tsukuyomi-opacity-50), var(--night-200));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.tl-hero-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.tl-hero-star {
  position: absolute;
  top: 8px;
  right: 8px;
  /* token: warning */
  color: var(--color-warning);
  font-size: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.tl-hero-body {
  flex: 1;
  min-width: 0;
}

.tl-hero-eyebrow {
  font-size: 10px;
  /* token: accent-silver @ 75% */
  color: var(--accent-opacity-75);
  letter-spacing: 0.2em;
  text-transform: uppercase;
  font-weight: 500;
}

.tl-hero-title {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 26px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  letter-spacing: -0.015em;
  margin: 6px 0 0;
  line-height: 1.2;
}

.tl-hero-alt {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 13px;
  /* token: moon-50 @ 65% */
  color: var(--moon-50-opacity-65);
  margin-top: 4px;
}

.tl-hero-badges {
  display: flex;
  gap: 6px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.tl-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 6px;
  font-size: 10px;
  font-weight: 500;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-8);
  color: var(--moon-50-opacity-75);
}

.tl-badge i {
  font-size: 9px;
}

.tl-badge--blue {
  background: var(--tsukuyomi-opacity-15);
  border-color: var(--tsukuyomi-opacity-30);
  /* token: tsukuyomi-200 */
  color: var(--tsukuyomi-200);
}

.tl-badge--star {
  /* token: warning @ 12% */
  background: var(--color-warning-opacity-12);
  /* token: warning @ 30% */
  border-color: var(--color-warning-opacity-30);
  /* token: warning */
  color: var(--color-warning);
}

.tl-hero-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
  flex-wrap: wrap;
}

/* 统计条 */
.tl-stats {
  padding: 16px 24px;
  /* token: white @ 2.5% */
  background: var(--white-opacity-2-5);
  border: 1px solid var(--white-opacity-8);
  border-radius: 12px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  margin-bottom: 24px;
}

.tl-stat {
  text-align: center;
  border-right: 1px solid var(--white-opacity-6);
  padding: 0 8px;
}

.tl-stat--last {
  border-right: none;
}

.tl-stat-value {
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  min-height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tl-stat-label {
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  margin-top: 4px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* 章节树 */
.tl-chapters {
  margin-bottom: 24px;
}

.tl-chapters-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--moon-50-opacity-55);
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 500;
  margin-bottom: 12px;
}

.tl-chapters-loading {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  letter-spacing: 0.1em;
  /* token: accent-silver @ 70% */
  color: var(--accent-opacity-70);
  text-transform: none;
}

.tl-chapters-loading i {
  font-size: 10px;
}

/* 章节树：2 列 grid（依照 mockup），同一卷的 header + 章节保持在一个 group 内避免跨列断裂 */
.tl-tree {
  columns: 2;
  column-gap: 20px;
}

.tl-tree-group {
  break-inside: avoid;
  page-break-inside: avoid;
  margin-bottom: 4px;
}

.tl-tree-vol {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 4px;
  margin: 0 -4px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--moon-50-opacity-100);
  cursor: pointer;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-vol:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-tree-vol-icon-open {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  font-size: 11px;
}

.tl-tree-vol-icon-closed {
  /* token: accent-silver @ 55% */
  color: var(--accent-opacity-55);
  font-size: 11px;
}

.tl-tree-vol-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tree-chap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0 6px 20px;
  font-size: 11px;
  /* token: moon-50 @ 80% */
  color: var(--moon-50-opacity-80);
  cursor: pointer;
  border-radius: 4px;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-chap:hover {
  /* token: white @ 3% */
  background: var(--white-opacity-3);
}

.tl-tree-chap--readonly {
  cursor: default;
}

.tl-tree-chap--readonly:hover {
  background: transparent;
}

.tl-tree-chap > i {
  font-size: 10px;
  flex-shrink: 0;
}

.tl-tree-chap-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tl-tree-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: var(--moon-50-opacity-50);
  flex-shrink: 0;
}

.tl-tree-more {
  padding: 6px 0 6px 20px;
  font-size: 10px;
  /* token: tsukuyomi-300 @ 75% */
  color: var(--tsukuyomi-300-opacity-75);
  cursor: pointer;
  font-style: italic;
  transition: color 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-more:hover {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-tree-more-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--moon-50-opacity-55);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 120ms cubic-bezier(0.4, 0, 0.2, 1),
    color 120ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-tree-more-btn i {
  font-size: 11px;
}

.tl-tree-more-btn:hover {
  background: var(--white-opacity-8);
  color: var(--moon-50-opacity-100);
}

.tl-chapters-edit-btn {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  border: 1px solid transparent;
  background: transparent;
  /* token: tsukuyomi-300 @ 85% */
  color: var(--tsukuyomi-300-opacity-85);
  border-radius: 6px;
  font-family: inherit;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 140ms cubic-bezier(0.4, 0, 0.2, 1);
}

.tl-chapters-edit-btn:hover {
  background: var(--white-opacity-4);
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-chapters-edit-btn--on {
  background: var(--tsukuyomi-opacity-18);
  border-color: var(--tsukuyomi-opacity-30);
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.tl-chapters-edit-btn--on:hover {
  /* token: tsukuyomi-500 @ 24% */
  background: var(--tsukuyomi-opacity-24);
}

.tl-chapters-edit-btn i {
  font-size: 10px;
}

.tl-chapters-empty {
  padding: 20px;
  color: var(--moon-50-opacity-45);
  font-size: 12px;
  text-align: center;
}

.tl-chapters-empty i {
  margin-right: 6px;
}

.tl-desc {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--moon-50-opacity-70);
  line-height: 1.65;
  white-space: pre-line;
  display: -webkit-box;
  -webkit-line-clamp: 4;
  line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
