<script setup lang="ts">
/**
 * Tablet book-details layout — reuses BookDetailsDesktop for the dual-pane
 * reader (catalog sidebar + chapter content), swaps in ChapterToolbarTablet
 * inside BookDetailsDesktop when isTablet, and adds a right-edge vertical
 * rail that toggles the two independent TabletChatPanel / TabletProgressPanel
 * overlays (mounted in MainLayoutTablet).
 *
 * The 2-column grid for 原文 / 译文 is applied here via :deep() so we don't
 * fork ParagraphCard / ChapterContentPanel (~2,700 LoC of highlighted-text /
 * term popover / character popover / editing / multi-version selection).
 */
import BookDetailsDesktop from './BookDetailsDesktop.vue';
import TabletSideRail from 'src/components/layout/TabletSideRail.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import { useTabletRightRail } from 'src/composables/useTabletRightRail';

const ctx = injectBookDetailsPage();
const { isChatActive, isProgressActive, toggleRail } = useTabletRightRail();
</script>

<template>
  <div class="book-details-tablet">
    <BookDetailsDesktop />

    <!-- 竖屏叠层遮罩：sidebar dock 打开时点击外侧关闭。横屏由 CSS display:none
         隐藏，sidebar 参与 flex 布局、不需要遮罩 -->
    <div
      v-if="ctx.isTabletSidebarOpen.value"
      class="bdt-sidebar-scrim"
      aria-hidden="true"
      @click="ctx.toggleTabletSidebar"
    />

    <TabletSideRail>
      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': ctx.isTabletSidebarOpen.value }"
        :title="ctx.isTabletSidebarOpen.value ? '收起目录' : '展开目录'"
        :aria-label="ctx.isTabletSidebarOpen.value ? '收起目录' : '展开目录'"
        :aria-pressed="ctx.isTabletSidebarOpen.value"
        @click="ctx.toggleTabletSidebar"
      >
        <i
          class="pi"
          :class="ctx.isTabletSidebarOpen.value ? 'pi-angle-double-left' : 'pi-bars'"
          aria-hidden="true"
        />
      </button>

      <div class="tsr-sep" />

      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': isChatActive }"
        title="AI 助手"
        @click="() => toggleRail('chat')"
      >
        <i class="pi pi-sparkles" aria-hidden="true" />
      </button>

      <button
        type="button"
        class="tsr-btn"
        :class="{ 'tsr-btn--active': isProgressActive }"
        title="翻译进度"
        @click="() => toggleRail('progress')"
      >
        <i class="pi pi-objects-column" aria-hidden="true" />
        <span v-if="ctx.activeTranslationTaskCount.value > 0" class="tsr-badge">
          {{ ctx.activeTranslationTaskCount.value }}
        </span>
      </button>
    </TabletSideRail>
  </div>
</template>

<style scoped>
.book-details-tablet {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: row;
  overflow: hidden;
}

/* ─── 横屏：sidebar 参与 flex 布局，折叠时宽度归零，内容面板自动填满 ─── */
.book-details-tablet :deep(.book-sidebar) {
  width: 17rem;
  transition:
    width 220ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1),
    border-right-color 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.book-details-tablet :deep(.book-sidebar.book-sidebar-tablet-collapsed) {
  width: 0;
  border-right-color: transparent;
}

.book-details-tablet :deep(.book-sidebar.book-sidebar-tablet-collapsed .sidebar-content) {
  opacity: 0;
  pointer-events: none;
  transition: opacity 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

/* 遮罩：仅在竖屏 sidebar 打开时显示，点击关闭 */
.bdt-sidebar-scrim {
  display: none;
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(1px);
  -webkit-backdrop-filter: blur(1px);
  z-index: 15;
}

@media (orientation: portrait) {
  .bdt-sidebar-scrim {
    display: block;
  }
}

/* ─── 竖屏：sidebar 改成可 dock 的 overlay 抽屉，不占布局——打开时从左侧
       滑入叠在内容之上；折叠时 translate 出去藏起来；主内容始终全宽 ─── */
@media (orientation: portrait) {
  .book-details-tablet :deep(.book-sidebar) {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 17rem;
    max-width: 86%;
    z-index: 20;
    background: rgba(14, 16, 20, 0.96);
    backdrop-filter: blur(14px);
    -webkit-backdrop-filter: blur(14px);
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5);
  }

  .book-details-tablet :deep(.book-sidebar.book-sidebar-tablet-collapsed) {
    width: 17rem;
    border-right-color: rgba(255, 255, 255, 0.06);
    transform: translateX(-100%);
  }

  .book-details-tablet :deep(.book-sidebar.book-sidebar-tablet-collapsed .sidebar-content) {
    opacity: 1;
    pointer-events: none;
  }
}

/* ChapterContentPanel 自带的章节头（标题 / 段落数 / 字数 / 时间戳 / 查看原文 / 章节摘要）
   在平板上与 ChapterToolbarTablet 的标题 + 状态行重复，直接隐藏整块 */
.book-details-tablet :deep(.chapter-header) {
  display: none;
}

/* ───── 侧边栏密度压缩（竖屏 17rem 宽度下桌面默认尺寸显得太挤） ─────
   参考 mobile `.mbd-hero` 的紧凑度：小封面 + 单行压缩字号 + 精简 stats */
.book-details-tablet :deep(.book-header-content) {
  padding: 10px 12px;
  gap: 0.6rem;
}

.book-details-tablet :deep(.book-cover-wrapper) {
  width: 2.75rem;
  height: 4rem;
  border-radius: 5px;
}

.book-details-tablet :deep(.book-title) {
  font-size: 0.88rem;
  line-height: 1.3;
  margin-bottom: 0.25rem;
  -webkit-line-clamp: 2;
}

.book-details-tablet :deep(.book-stats) {
  font-size: 0.68rem;
  gap: 0.3rem;
  flex-wrap: nowrap;
  overflow: hidden;
}

.book-details-tablet :deep(.book-stats .stat-icon) {
  display: none;
}

.book-details-tablet :deep(.book-stats .stat-label) {
  opacity: 0.7;
}

.book-details-tablet :deep(.book-separator) {
  margin: 0 12px;
}

/* 设置菜单——收紧条目高度/左右 padding，图标也稍微缩 */
.book-details-tablet :deep(.settings-menu-wrapper) {
  padding: 0.1rem 0.35rem;
}

.book-details-tablet :deep(.settings-menu-item) {
  padding: 0.4rem 0.6rem;
  font-size: 0.78rem;
  gap: 0.45rem;
}

.book-details-tablet :deep(.settings-menu-icon) {
  font-size: 0.78rem;
}

.book-details-tablet :deep(.settings-menu-separator) {
  margin: 0.35rem 0.35rem 0;
}

/* "目录" 头部 + 新卷/新章节 —— 收紧行高和按钮 padding */
.book-details-tablet :deep(.sidebar-title-wrapper) {
  padding: 0.35rem 0.75rem 0.25rem;
}

.book-details-tablet :deep(.sidebar-title) {
  font-size: 0.8rem;
}

.book-details-tablet :deep(.sidebar-actions .p-button) {
  padding: 0.25rem 0.45rem;
  font-size: 0.72rem;
}

/* 双栏阅读：原文 / 译文 side-by-side */
.book-details-tablet :deep(.paragraph-content) {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  column-gap: 20px;
  padding-right: 0;
}

.book-details-tablet :deep(.paragraph-text) {
  padding-right: 12px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
}

.book-details-tablet :deep(.paragraph-translation-wrapper) {
  margin: 0;
  padding-top: 0;
  border-top: none;
  padding-left: 8px;
}

.book-details-tablet :deep(.chapter-content-panel)::before {
  content: '原文 · 日本語  |  译文 · 中文';
  display: block;
  position: sticky;
  top: 0;
  z-index: 4;
  background: rgba(10, 12, 15, 0.92);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-family: 'Noto Sans SC', 'PingFang SC', -apple-system, sans-serif;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(155, 164, 179, 0.75);
  padding: 8px 22px;
}

.book-details-tablet :deep(.paragraph-card) {
  position: relative;
  padding-right: 3rem;
}

.book-details-tablet :deep(.recent-translation-icon-button),
.book-details-tablet :deep(.edit-translation-icon-button),
.book-details-tablet :deep(.context-menu-icon-button) {
  z-index: 3;
}

</style>
