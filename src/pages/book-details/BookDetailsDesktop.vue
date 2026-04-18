<script setup lang="ts">
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import VolumesList from 'src/components/novel/VolumesList.vue';
import VolumesListTablet from 'src/components/novel/VolumesListTablet.vue';
import ChapterToolbar from 'src/components/novel/ChapterToolbar.vue';
import ChapterToolbarTablet from 'src/components/novel/ChapterToolbarTablet.vue';
import SearchToolbar from 'src/components/novel/SearchToolbar.vue';
import TerminologyPanel from 'src/components/novel/TerminologyPanel.vue';
import CharacterSettingPanel from 'src/components/novel/CharacterSettingPanel.vue';
import MemoryPanel from 'src/components/novel/MemoryPanel.vue';
import ChapterContentPanel from 'src/components/novel/ChapterContentPanel.vue';
import { injectBookDetailsPage } from 'src/composables/book-details/useBookDetailsPage';
import type { EditMode } from 'src/composables/book-details/useEditMode';

const ctx = injectBookDetailsPage();
</script>

<template>
  <!-- 左侧卷/章节面板 -->
  <aside
    class="book-sidebar"
    :class="{
      'book-sidebar-mobile-hidden': ctx.isPhone.value && ctx.workspaceMode.value !== 'catalog',
      'book-sidebar-mobile-visible':
        ctx.isPhone.value && ctx.workspaceMode.value === 'catalog',
      'book-sidebar-tablet-collapsed':
        ctx.isTablet.value && !ctx.isTabletSidebarOpen.value,
    }"
  >
    <div class="sidebar-content">
      <!-- 书籍封面和标题 -->
      <div v-if="ctx.book.value" class="book-header">
        <div class="book-header-content" @click="ctx.openBookDialog">
          <i class="pi pi-info-circle book-edit-icon" />
          <div class="book-cover-wrapper">
            <img
              :src="ctx.book.value ? ctx.getCoverUrl(ctx.book.value) : ''"
              :alt="ctx.book.value?.title || ''"
              class="book-cover"
              @error="
                (e) => {
                  const target = e.target as HTMLImageElement;
                  if (ctx.book.value) {
                    target.src = ctx.getCoverUrl(ctx.book.value);
                  }
                }
              "
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
            <div v-else-if="ctx.isStatsCalculating.value" class="book-stats">
              <Skeleton width="120px" height="20px" />
            </div>
          </div>
        </div>
        <div v-if="!ctx.isPhone.value" class="book-separator" />
      </div>

      <!-- 设置菜单 - 手机端隐藏（设置页已有二级导航） -->
      <div v-if="!ctx.isPhone.value" class="settings-menu-wrapper">
        <div class="settings-menu-items">
          <button
            class="settings-menu-item"
            :class="{
              'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'terms',
            }"
            @click="ctx.navigateToTermsSetting"
          >
            <i class="pi pi-bookmark settings-menu-icon" />
            <span class="settings-menu-label">术语设置</span>
          </button>
          <button
            class="settings-menu-item"
            :class="{
              'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'characters',
            }"
            @click="ctx.navigateToCharactersSetting"
          >
            <i class="pi pi-users settings-menu-icon" />
            <span class="settings-menu-label">角色设置</span>
          </button>
          <button
            class="settings-menu-item"
            :class="{
              'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'memory',
            }"
            @click="ctx.navigateToMemorySetting"
          >
            <i class="pi pi-database settings-menu-icon" />
            <span class="settings-menu-label">记忆管理</span>
          </button>
          <button class="settings-menu-item" @click="ctx.openScraperDialog">
            <i class="pi pi-download settings-menu-icon" />
            <span class="settings-menu-label">检查更新</span>
          </button>
        </div>
        <div class="settings-menu-separator" />
      </div>

      <!-- 目录标题和操作按钮 -->
      <div class="sidebar-title-wrapper">
        <h2 v-if="!ctx.isPhone.value" class="sidebar-title">目录</h2>
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
        :book="ctx.book.value || null"
        :selected-chapter-id="ctx.selectedChapterId.value"
        :is-page-loading="ctx.isPageLoading.value"
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
        :book="ctx.book.value || null"
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

      <!-- 返回链接 -->
      <div class="back-link-wrapper">
        <button class="back-link" @click="() => void ctx.router.push('/books')">
          <i class="pi pi-arrow-left" />
          <span>返回书籍列表</span>
        </button>
      </div>
    </div>
  </aside>

  <!-- 主内容区域 -->
  <div
    class="book-main-content"
    :class="{
      'overflow-hidden': !!ctx.selectedSettingMenu.value,
      'book-main-content-mobile-hidden':
        ctx.isPhone.value && ctx.workspaceMode.value === 'catalog',
    }"
  >
    <!-- 章节阅读工具栏：平板单独用 ChapterToolbarTablet（更干净的 header），其余设备仍用 ChapterToolbar -->
    <ChapterToolbarTablet
      v-if="
        ctx.isTablet.value &&
        ctx.selectedChapter.value &&
        !ctx.selectedSettingMenu.value
      "
      :selected-chapter="ctx.selectedChapter.value"
      :book="ctx.book.value || null"
      :can-undo="ctx.canUndo.value"
      :can-redo="ctx.canRedo.value"
      :undo-description="ctx.undoDescription.value || null"
      :redo-description="ctx.redoDescription.value || null"
      :edit-mode="ctx.editMode.value"
      :edit-mode-options="[...ctx.editModeOptions]"
      :selected-chapter-paragraphs="ctx.selectedChapterParagraphs.value"
      :translated-char-count="ctx.translatedCharCount.value"
      :model-name="ctx.mobileReaderModelName.value"
      :used-term-count="ctx.usedTermCount.value"
      :used-character-count="ctx.usedCharacterCount.value"
      :used-memory-count="ctx.usedMemoryCount.value"
      :translation-status="ctx.translationStatus.value"
      :translation-button-label="ctx.translationButtonLabel.value"
      :translation-button-menu-items="ctx.translationButtonMenuItems.value"
      :is-translating-chapter="ctx.isTranslatingChapter.value"
      :is-polishing-chapter="ctx.isPolishingChapter.value"
      :is-search-visible="ctx.isSearchVisible.value"
      @undo="ctx.undo"
      @redo="ctx.redo"
      @update:edit-mode="
        (value: EditMode) => {
          ctx.editMode.value = value;
        }
      "
      @toggle-export="(event: Event) => ctx.toggleExportMenu(event)"
      @toggle-term-popover="(event: Event) => ctx.toggleTermPopover(event)"
      @toggle-character-popover="(event: Event) => ctx.toggleCharacterPopover(event)"
      @toggle-memory-popover="(event: Event) => ctx.handleToggleMemoryPopover(event)"
      @translation-button-click="ctx.translationButtonClick"
      @toggle-search="ctx.toggleSearch"
      @toggle-keyboard-shortcuts="ctx.toggleKeyboardShortcutsPopover"
      @toggle-special-instructions="ctx.toggleChapterSettingsPopover"
    />
    <ChapterToolbar
      v-else-if="
        ctx.selectedChapter.value &&
        !ctx.selectedSettingMenu.value &&
        (!ctx.isPhone.value || ctx.workspaceMode.value === 'content')
      "
      :selected-chapter="ctx.selectedChapter.value"
      :book="ctx.book.value || null"
      :can-undo="ctx.canUndo.value"
      :can-redo="ctx.canRedo.value"
      :undo-description="ctx.undoDescription.value || null"
      :redo-description="ctx.redoDescription.value || null"
      :edit-mode="ctx.editMode.value"
      :edit-mode-options="[...ctx.editModeOptions]"
      :selected-chapter-paragraphs="ctx.selectedChapterParagraphs.value"
      :used-term-count="ctx.usedTermCount.value"
      :used-character-count="ctx.usedCharacterCount.value"
      :used-memory-count="ctx.usedMemoryCount.value"
      :translation-status="ctx.translationStatus.value"
      :translation-button-label="ctx.translationButtonLabel.value"
      :translation-button-menu-items="ctx.translationButtonMenuItems.value"
      :is-translating-chapter="ctx.isTranslatingChapter.value"
      :is-polishing-chapter="ctx.isPolishingChapter.value"
      :is-search-visible="ctx.isSearchVisible.value"
      :is-small-screen="ctx.isPhone.value"
      @undo="ctx.undo"
      @redo="ctx.redo"
      @update:edit-mode="
        (value: EditMode) => {
          ctx.editMode.value = value;
        }
      "
      @toggle-export="(event: Event) => ctx.toggleExportMenu(event)"
      @toggle-term-popover="(event: Event) => ctx.toggleTermPopover(event)"
      @toggle-character-popover="(event: Event) => ctx.toggleCharacterPopover(event)"
      @toggle-memory-popover="(event: Event) => ctx.handleToggleMemoryPopover(event)"
      @translation-button-click="ctx.translationButtonClick"
      @toggle-search="ctx.toggleSearch"
      @toggle-keyboard-shortcuts="ctx.toggleKeyboardShortcutsPopover"
      @toggle-special-instructions="ctx.toggleChapterSettingsPopover"
    />

    <!-- 搜索工具栏 -->
    <SearchToolbar
      v-if="
        ctx.selectedChapter.value &&
        !ctx.selectedSettingMenu.value &&
        (!ctx.isPhone.value || ctx.workspaceMode.value === 'content')
      "
      v-model:visible="ctx.isSearchVisible.value"
      v-model:search-query="ctx.searchQuery.value"
      v-model:replace-query="ctx.replaceQuery.value"
      v-model:show-replace="ctx.showReplace.value"
      :matches-count="ctx.searchMatches.value.length"
      :current-match-index="ctx.currentSearchMatchIndex.value"
      @next="ctx.nextMatch"
      @prev="ctx.prevMatch"
      @replace="ctx.replaceCurrent"
      @replace-all="ctx.replaceAll"
    />

    <div
      ref="scrollableContentRef"
      class="scrollable-content"
      :class="{
        '!overflow-hidden': !!ctx.selectedSettingMenu.value,
        'scrollable-content-mobile-hidden':
          ctx.isPhone.value &&
          ctx.workspaceMode.value === 'settings' &&
          !ctx.selectedSettingMenu.value,
      }"
    >
      <div
        class="page-container"
        :class="{
          '!h-full !overflow-hidden !min-h-0 flex flex-col !p-0': !!ctx.selectedSettingMenu.value,
          '!h-full !overflow-hidden !min-h-0': ctx.selectedChapter.value,
        }"
      >
        <TerminologyPanel
          v-if="
            ctx.selectedSettingMenu.value === 'terms' &&
            (!ctx.isPhone.value || ctx.workspaceMode.value === 'settings')
          "
          :book="ctx.book.value || null"
          class="flex-1 min-h-0"
        />

        <CharacterSettingPanel
          v-else-if="
            ctx.selectedSettingMenu.value === 'characters' &&
            (!ctx.isPhone.value || ctx.workspaceMode.value === 'settings')
          "
          :book="ctx.book.value || null"
          class="flex-1 min-h-0"
        />

        <MemoryPanel
          v-else-if="
            ctx.selectedSettingMenu.value === 'memory' &&
            (!ctx.isPhone.value || ctx.workspaceMode.value === 'settings')
          "
          :book="ctx.book.value || null"
          class="flex-1 min-h-0"
        />

        <div
          v-else-if="ctx.selectedChapter.value"
          ref="chapterContentPanelRef"
          class="chapter-content-panel h-full overflow-y-auto overflow-x-hidden"
          tabindex="-1"
        >
          <ChapterContentPanel
            :selected-chapter="ctx.selectedChapter.value"
            :selected-chapter-with-content="ctx.selectedChapterWithContent.value"
            :selected-chapter-paragraphs="ctx.selectedChapterParagraphs.value"
            :is-loading-chapter-content="ctx.isLoadingChapterContent.value"
            :edit-mode="ctx.editMode.value"
            :original-text-edit-value="ctx.originalTextEditValue.value"
            :translated-char-count="ctx.translatedCharCount.value"
            :book="ctx.book.value || null"
            :terminologies="ctx.stableTerminologies.value"
            :character-settings="ctx.stableCharacterSettings.value"
            :book-id="ctx.bookId.value"
            :is-small-screen="ctx.isPhone.value"
            :selected-chapter-id="ctx.selectedChapterId.value"
            :translating-paragraph-ids="ctx.translatingParagraphIds.value"
            :polishing-paragraph-ids="ctx.polishingParagraphIds.value"
            :proofreading-paragraph-ids="ctx.proofreadingParagraphIds.value"
            :search-query="ctx.debouncedSearchQuery.value"
            :selected-paragraph-index="ctx.selectedParagraphIndex.value"
            :is-keyboard-selected="ctx.isKeyboardSelected.value"
            :is-click-selected="ctx.isClickSelected.value"
            :paragraph-card-refs="ctx.paragraphCardRefs"
            :is-summarizing="ctx.isSummarizing.value"
            :prev-chapter="ctx.prevChapter.value"
            :next-chapter="ctx.nextChapter.value"
            @update:original-text-edit-value="
              (value: string) => {
                ctx.originalTextEditValue.value = value;
              }
            "
            @open-edit-chapter-dialog="ctx.openEditChapterDialog"
            @cancel-original-text-edit="ctx.cancelOriginalTextEdit"
            @save-original-text-edit="ctx.saveOriginalTextEdit"
            @update-translation="
              (paragraphId: string, newTranslation: string) =>
                ctx.updateParagraphTranslation(paragraphId, newTranslation)
            "
            @retranslate-paragraph="ctx.retranslateParagraph"
            @polish-paragraph="ctx.polishParagraph"
            @proofread-paragraph="ctx.proofreadParagraph"
            @select-translation="
              (paragraphId: string, translationId: string) =>
                ctx.selectParagraphTranslation(paragraphId, translationId)
            "
            @paragraph-click="ctx.handleParagraphClick"
            @paragraph-edit-start="ctx.handleParagraphEditStart"
            @paragraph-edit-stop="ctx.handleParagraphEditStop"
            @re-summarize-chapter="ctx.handleReSummarizeChapter"
            @navigate-to-chapter="ctx.onNavigateToChapter"
            @navigate-to-chapter-list="ctx.onNavigateToChapterList"
          />
        </div>

        <div v-else class="no-chapter-selected">
          <i class="pi pi-book-open no-selection-icon" />
          <p class="no-selection-text">请从左侧选择一个章节</p>
          <p class="no-selection-hint text-moon/60 text-sm">点击章节标题查看内容</p>
        </div>
      </div>
    </div>
  </div>

</template>

<style scoped>
.book-sidebar {
  width: 22rem;
  height: 100%;
  flex-shrink: 0;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(10, 12, 15, 0.35);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.book-header {
  flex-shrink: 0;
}

.book-header-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem;
  cursor: pointer;
  position: relative;
  border-radius: 8px;
  transition:
    background-color 0.15s ease,
    opacity 0.15s ease;
}

.book-header-content:hover {
  background: rgba(255, 255, 255, 0.04);
}

.book-edit-icon {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  font-size: 0.85rem;
  color: rgba(247, 244, 236, 0.35);
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
  background: #1c1f26;
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
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 1rem;
  font-weight: 600;
  color: rgba(247, 244, 236, 1);
  letter-spacing: -0.01em;
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
  color: rgba(247, 244, 236, 0.6);
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
  font-family: 'JetBrains Mono', monospace;
  color: rgba(247, 244, 236, 0.85);
}

.stat-label {
  opacity: 0.8;
}

.stat-separator {
  opacity: 0.35;
}

.book-separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 0 1rem;
}

.sidebar-title-wrapper {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 1rem;
}

.sidebar-title {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: rgba(247, 244, 236, 0.9);
}

.sidebar-actions {
  display: inline-flex;
  gap: 0.15rem;
}

.settings-menu-wrapper {
  flex-shrink: 0;
  padding: 0.25rem 0.5rem;
}

.settings-menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.settings-menu-separator {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 0.5rem 0.5rem 0;
}

.settings-menu-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: rgba(247, 244, 236, 0.72);
  font-size: 0.82rem;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-menu-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(247, 244, 236, 1);
}

.settings-menu-item-selected {
  background: rgba(109, 136, 168, 0.2);
  color: rgba(247, 244, 236, 1);
}

.settings-menu-item-selected .settings-menu-icon {
  color: #a3b7cf;
}

.settings-menu-icon {
  font-size: 0.85rem;
  width: 1rem;
  color: rgba(247, 244, 236, 0.55);
  transition: color 0.15s ease;
}

.settings-menu-item:hover .settings-menu-icon {
  color: rgba(247, 244, 236, 0.9);
}

.settings-menu-label {
  flex: 1;
}

.back-link-wrapper {
  flex-shrink: 0;
  padding: 0.5rem 1rem 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
  margin-top: auto;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.5rem 0.75rem;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: rgba(247, 244, 236, 0.55);
  cursor: pointer;
  font-size: 0.78rem;
  font-family: inherit;
  width: 100%;
  text-align: left;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.back-link:hover {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(247, 244, 236, 0.9);
}

.back-link:active {
  background: rgba(255, 255, 255, 0.08);
}

.back-link .pi {
  font-size: 0.78rem;
}

.book-main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scrollable-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.chapter-content-panel:focus {
  outline: none;
}

.page-container {
  padding: 1rem 1.25rem;
}

.no-chapter-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  color: rgba(247, 244, 236, 0.55);
}

.no-selection-icon {
  font-size: 3rem;
  color: rgba(174, 183, 198, 0.45);
  margin-bottom: 1rem;
}

.no-selection-text {
  font-size: 0.95rem;
  margin: 0 0 0.25rem;
  color: rgba(247, 244, 236, 0.75);
}

.no-selection-hint {
  margin: 0;
}

/* 小屏切换显示/隐藏辅助类 */
.book-sidebar-mobile-hidden {
  display: none;
}

.book-main-content-mobile-hidden {
  display: none;
}

.scrollable-content-mobile-hidden {
  display: none;
}
</style>
