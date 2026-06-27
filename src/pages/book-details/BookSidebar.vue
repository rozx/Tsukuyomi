<script setup lang="ts">
/**
 * 书籍详情左侧栏（书籍概览 + 设置快捷入口 + 目录头 + 卷/章节列表）。
 * 从 BookDetailsDesktop 抽出以降低其模板复杂度。样式（book-sidebar* / book-header* / sidebar-*）
 * 为本组件 scoped；BookDetailsTablet 仍通过 :deep() 复用这些类名做平板适配。
 */
import { computed } from 'vue';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import VolumesList from 'src/components/novel/VolumesList.vue';
import VolumesListTablet from 'src/components/novel/VolumesListTablet.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import BookSidebarSettingsMenu from './BookSidebarSettingsMenu.vue';

const ctx = injectBookDetailsPage();

// 侧栏显隐 / 折叠的复合 class（吸收 && 分支，保持模板零分支）
const sidebarClass = computed(() => ({
  'book-sidebar-mobile-hidden':
    ctx.isPhone.value && ctx.workspaceMode.value !== 'catalog',
  'book-sidebar-mobile-visible': ctx.isPhone.value && ctx.workspaceMode.value === 'catalog',
  'book-sidebar-tablet-collapsed': ctx.isTablet.value && !ctx.isTabletSidebarOpen.value,
}));
const isDesktop = computed(() => !ctx.isPhone.value);
const showStatsSkeleton = computed(
  () => !ctx.stats.value && ctx.isStatsCalculating.value,
);

// 以下 computed 把模板里的 || / ?: 收进脚本侧；目录头两个互斥 v-if 折叠成 component:is
const coverSrc = computed(() => (ctx.book.value ? ctx.getCoverUrl(ctx.book.value) : ''));
const coverAlt = computed(() => ctx.book.value?.title || '');
const bookOrNull = computed(() => ctx.book.value || null);
const onCoverError = (e: Event) => {
  const target = e.target as HTMLImageElement;
  if (ctx.book.value) {
    target.src = ctx.getCoverUrl(ctx.book.value);
  }
};
const catalogHeaderTag = computed<'span' | 'h2'>(() => (isDesktop.value ? 'span' : 'h2'));
const catalogHeaderClass = computed(() =>
  isDesktop.value ? 'sidebar-eyebrow sidebar-eyebrow--inline' : 'sidebar-title',
);
const catalogHeaderText = computed(() => (isDesktop.value ? 'CATALOG' : '目录'));
</script>

<template>
  <aside class="book-sidebar" :class="sidebarClass">
    <div class="sidebar-content">
      <!-- 书籍概览 -->
      <section v-if="ctx.book.value" class="sidebar-section sidebar-section--book book-header">
        <span v-if="isDesktop" class="sidebar-eyebrow">BOOK</span>
        <div class="book-header-content" @click="ctx.openBookDialog">
          <i class="pi pi-info-circle book-edit-icon" />
          <div class="book-cover-wrapper">
            <img
              :src="coverSrc"
              :alt="coverAlt"
              class="book-cover"
              @error="onCoverError"
            />
          </div>
          <div class="book-info">
            <h3 class="book-title">{{ ctx.book.value.title }}</h3>
            <div v-if="ctx.stats.value" class="book-stats">
              <div class="stat-item stat-item-volume">
                <i class="pi pi-file stat-icon" />
                <span class="stat-value">{{ ctx.stats.value.volumeCount }}</span>
                <span class="stat-label">卷</span>
              </div>
              <span class="stat-separator">|</span>
              <div class="stat-item stat-item-chapter">
                <i class="pi pi-list stat-icon" />
                <span class="stat-value">{{ ctx.stats.value.chapterCount }}</span>
                <span class="stat-label">章</span>
              </div>
              <span class="stat-separator">|</span>
              <div class="stat-item stat-item-wordcount">
                <i class="pi pi-align-left stat-icon" />
                <span class="stat-value">{{ ctx.formatWordCount(ctx.stats.value.wordCount) }}</span>
              </div>
            </div>
            <div v-else-if="showStatsSkeleton" class="book-stats">
              <Skeleton width="120px" height="20px" />
            </div>
          </div>
        </div>
        <div v-if="isDesktop" class="book-separator" />
      </section>

      <!-- 设置快捷入口（手机端在设置页已有二级导航） -->
      <BookSidebarSettingsMenu v-if="isDesktop" />

      <!-- 目录工具 -->
      <div class="sidebar-section-header sidebar-title-wrapper">
        <component :is="catalogHeaderTag" :class="catalogHeaderClass">{{ catalogHeaderText }}</component>
        <div class="sidebar-actions">
          <Button
            icon="pi pi-plus"
            label="新卷"
            class="p-button-text p-button-sm"
            size="small"
            title="添加新卷"
            @click="ctx.showAddVolumeDialog.value = true"
          />
          <Button
            icon="pi pi-plus-circle"
            label="新章节"
            class="p-button-text p-button-sm"
            size="small"
            title="添加新章节"
            @click="ctx.openAddChapterDialog"
          />
        </div>
      </div>

      <!-- 卷和章节列表：平板用 mobile-style 轻量树，桌面/手机端保留原 VolumesList -->
      <VolumesListTablet
        v-if="ctx.isTablet.value"
        :volumes="ctx.volumes.value"
        :book="bookOrNull"
        :selected-chapter-id="ctx.selectedChapterId.value"
        :is-loading-chapter-content="ctx.isLoadingChapterContent.value"
        :is-volume-expanded="ctx.isVolumeExpanded"
        :chapter-status-icon="ctx.chapterStatusIcon"
        :chapter-status-color="ctx.chapterStatusColor"
        :chapter-status-text-color="ctx.chapterStatusTextColor"
        :chapter-status-label="ctx.chapterStatusLabel"
        @toggle-volume="ctx.onToggleVolume"
        @navigate-to-chapter="ctx.onNavigateToChapter"
        @edit-volume="ctx.onEditVolume"
        @delete-volume="ctx.onDeleteVolume"
        @edit-chapter="ctx.onEditChapter"
        @delete-chapter="ctx.onDeleteChapter"
        @move-chapter="ctx.onMoveChapter"
      />
      <VolumesList
        v-else
        :volumes="ctx.volumes.value"
        :book="bookOrNull"
        :selected-chapter-id="ctx.selectedChapterId.value"
        :is-page-loading="ctx.isPageLoading.value"
        :is-loading-chapter-content="ctx.isLoadingChapterContent.value"
        :is-volume-expanded="ctx.isVolumeExpanded"
        :dragged-chapter="ctx.draggedChapter.value"
        :drag-over-volume-id="ctx.dragOverVolumeId.value"
        :drag-over-index="ctx.dragOverIndex.value"
        :touch-mode="ctx.isSmallScreen.value"
        :is-moving-chapter="ctx.isMovingChapter.value"
        @toggle-volume="ctx.onToggleVolume"
        @navigate-to-chapter="ctx.onNavigateToChapter"
        @edit-volume="ctx.onEditVolume"
        @delete-volume="ctx.onDeleteVolume"
        @edit-chapter="ctx.onEditChapter"
        @delete-chapter="ctx.onDeleteChapter"
        @drag-start="ctx.onDragStart"
        @drag-end="ctx.onDragEnd"
        @drag-over="ctx.onDragOver"
        @drop="ctx.onDrop"
        @drag-leave="ctx.onDragLeave"
        @move-chapter="ctx.onMoveChapter"
      />
    </div>
  </aside>
</template>

<style scoped>
.book-sidebar {
  width: 19rem;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid var(--white-opacity-8);
  /* tokens: tsukuyomi-500 @ 8→2% over shell @ 55% (matches workbench surface) */
  background:
    linear-gradient(180deg, var(--tsukuyomi-opacity-8), var(--tsukuyomi-opacity-2)),
    var(--shell-opacity-55);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  /* token: white @ 2% */
  box-shadow: inset -1px 0 0 var(--white-opacity-2);
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.sidebar-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.sidebar-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.56rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  /* token: accent-silver @ 42% */
  color: var(--accent-opacity-42);
  padding: 0.7rem 0.9rem 0.2rem;
}

.book-header {
  flex-shrink: 0;
}

.book-header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 1rem 0.9rem;
  cursor: pointer;
  position: relative;
  border-radius: 8px;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.book-header-content:hover {
  background: var(--white-opacity-4);
}

.book-edit-icon {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.85rem;
  /* token: moon-50 @ 35% */
  color: var(--moon-50-opacity-35);
  opacity: 0;
  transition: opacity 0.15s ease;
}

.book-header-content:hover .book-edit-icon {
  opacity: 1;
}

.book-cover-wrapper {
  width: 3.5rem;
  height: 5rem;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  /* token: night-200 */
  background: var(--night-200);
}

.book-cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.book-info {
  flex: 1;
  min-width: 0;
}

.book-title {
  /* 设计系统：书名用显示字体（Noto Serif JP）传递文学感 */
  font-family: 'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.0625rem;
  font-weight: 600;
  color: var(--moon-opacity-95);
  letter-spacing: -0.01em;
  line-height: 1.25;
  margin: 0 0 0.35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.book-stats {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.72rem;
  color: var(--moon-50-opacity-60);
}

.stat-item {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.stat-icon {
  font-size: 0.72rem;
  opacity: 0.8;
}

.stat-value {
  /* 设计系统：数值用等宽字体 + 薄藍色 */
  font-family: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.stat-label {
  opacity: 0.8;
}

.stat-separator {
  opacity: 0.35;
}

.book-separator {
  height: 1px;
  background: var(--white-opacity-6);
  margin: 0 1rem;
}

.sidebar-title-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.75rem 0.9rem 0.4rem;
}

.sidebar-title-wrapper .sidebar-eyebrow--inline {
  padding: 0;
}

.sidebar-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  /* token: moon-50 @ 90% */
  color: var(--moon-50-opacity-90);
}

.sidebar-actions {
  display: inline-flex;
  gap: 0.15rem;
}

/* 小屏切换显示/隐藏辅助类 */
.book-sidebar-mobile-hidden {
  display: none;
}

.book-sidebar-mobile-visible {
  /* 由父布局控制可见性，此处保留类名供 :deep 适配 */
}
</style>
