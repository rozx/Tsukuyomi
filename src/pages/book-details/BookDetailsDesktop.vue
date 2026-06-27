<script setup lang="ts">
import { computed, ref, watch } from 'vue';
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
import type { ChapterScrollToIndex } from 'src/composables/book-details/useChapterVirtualizer';
import { useUiStore } from 'src/stores/ui';

const ctx = injectBookDetailsPage();
const ui = useUiStore();

// 章节内容面板组件 ref：挂载后把其 scrollToParagraphIndex 注册到页面上下文，供键盘导航/搜索按索引滚动。
// 用具体的 exposed 接口而非 InstanceType<typeof ChapterContentPanel>（后者在泛型 SFC 下会退化为 any，
// 触发 eslint no-redundant-type-constituents）。
const chapterPanelRef = ref<{ scrollToParagraphIndex: ChapterScrollToIndex } | null>(null);
watch(chapterPanelRef, (comp) => {
  ctx.registerChapterScroller(comp ? (index, options) => comp.scrollToParagraphIndex(index, options) : null);
});

const settingsShellRef = ref<HTMLElement | null>(null);

function onSettingsBeforeLeave() {
  const shell = settingsShellRef.value;
  if (!shell) return;
  shell.style.height = `${shell.offsetHeight}px`;
}

function onSettingsEnter(el: Element) {
  const shell = settingsShellRef.value;
  if (!shell) return;
  const target = (el as HTMLElement).scrollHeight;
  requestAnimationFrame(() => {
    if (!settingsShellRef.value) return;
    settingsShellRef.value.style.height = `${target}px`;
  });
}

function onSettingsAfterEnter() {
  const shell = settingsShellRef.value;
  if (!shell) return;
  shell.style.height = '';
}

const settingContextMeta = computed(() => {
  switch (ctx.selectedSettingMenu.value) {
    case 'terms':
      return { eyebrow: 'Terms', label: '术语设置', icon: 'pi pi-bookmark' };
    case 'characters':
      return { eyebrow: 'Characters', label: '角色设置', icon: 'pi pi-users' };
    case 'memory':
      return { eyebrow: 'Memory', label: '记忆管理', icon: 'pi pi-database' };
    default:
      return null;
  }
});
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
      <!-- 书籍概览 -->
      <section v-if="ctx.book.value" class="sidebar-section sidebar-section--book book-header">
        <span v-if="!ctx.isPhone.value" class="sidebar-eyebrow">BOOK</span>
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
      </section>

      <!-- 设置快捷入口（手机端在设置页已有二级导航） -->
      <section v-if="!ctx.isPhone.value" class="sidebar-section settings-menu-wrapper">
        <div ref="settingsShellRef" class="settings-menu-shell">
        <Transition
          name="settings-menu"
          @before-leave="onSettingsBeforeLeave"
          @enter="onSettingsEnter"
          @after-enter="onSettingsAfterEnter"
        >
          <div v-if="ui.bookSettingsMenuExpanded" key="expanded" class="settings-menu-expanded">
            <div class="settings-menu-header">
              <span class="sidebar-eyebrow settings-menu-eyebrow">SETTINGS</span>
              <button
                type="button"
                class="settings-menu-toggle"
                title="收起设置菜单"
                aria-label="收起设置菜单"
                @click="ui.toggleBookSettingsMenu"
              >
                <i class="pi pi-chevron-up" />
              </button>
            </div>
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
          </div>
          <div v-else key="collapsed" class="settings-menu-items settings-menu-items--collapsed">
            <button
              type="button"
              class="settings-menu-item"
              :class="{
                'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'terms',
              }"
              title="术语设置"
              aria-label="术语设置"
              @click="ctx.navigateToTermsSetting"
            >
              <i class="pi pi-bookmark settings-menu-icon" />
            </button>
            <button
              type="button"
              class="settings-menu-item"
              :class="{
                'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'characters',
              }"
              title="角色设置"
              aria-label="角色设置"
              @click="ctx.navigateToCharactersSetting"
            >
              <i class="pi pi-users settings-menu-icon" />
            </button>
            <button
              type="button"
              class="settings-menu-item"
              :class="{
                'settings-menu-item-selected': ctx.selectedSettingMenu.value === 'memory',
              }"
              title="记忆管理"
              aria-label="记忆管理"
              @click="ctx.navigateToMemorySetting"
            >
              <i class="pi pi-database settings-menu-icon" />
            </button>
            <button
              type="button"
              class="settings-menu-item"
              title="检查更新"
              aria-label="检查更新"
              @click="ctx.openScraperDialog"
            >
              <i class="pi pi-download settings-menu-icon" />
            </button>
            <button
              type="button"
              class="settings-menu-item settings-menu-expand"
              title="展开设置菜单"
              aria-label="展开设置菜单"
              @click="ui.toggleBookSettingsMenu"
            >
              <i class="pi pi-chevron-down settings-menu-icon" />
            </button>
          </div>
        </Transition>
        </div>
        <div class="settings-menu-separator" />
      </section>

      <!-- 目录工具 -->
      <div class="sidebar-section-header sidebar-title-wrapper">
        <span v-if="!ctx.isPhone.value" class="sidebar-eyebrow sidebar-eyebrow--inline">
          CATALOG
        </span>
        <h2 v-if="ctx.isPhone.value" class="sidebar-title">目录</h2>
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

    </div>
  </aside>

  <!-- 主内容区域 -->
  <div
    class="book-main-content"
    :class="{
      'overflow-hidden': !!ctx.selectedSettingMenu.value,
      'book-main-content--settings': !!ctx.selectedSettingMenu.value,
      'book-main-content--reading':
        !ctx.selectedSettingMenu.value && !!ctx.selectedChapter.value,
      'book-main-content-mobile-hidden':
        ctx.isPhone.value && ctx.workspaceMode.value === 'catalog',
    }"
  >
    <!-- 设置上下文头（桌面）：在工作台主面板里清晰标示当前设置区 -->
    <header
      v-if="settingContextMeta && !ctx.isPhone.value"
      class="workspace-context-bar"
    >
      <i :class="settingContextMeta.icon" class="workspace-context-icon" aria-hidden="true" />
      <span class="workspace-context-eyebrow">{{ settingContextMeta.eyebrow }}</span>
      <span class="workspace-context-sep" aria-hidden="true" />
      <span class="workspace-context-label">{{ settingContextMeta.label }}</span>
      <span v-if="ctx.book.value" class="workspace-context-book"
        >· {{ ctx.book.value.title }}</span
      >
    </header>

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
      :ref="ctx.setScrollableContentRef"
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
          :ref="ctx.setChapterContentPanelRef"
          class="chapter-content-panel h-full overflow-y-auto overflow-x-hidden"
          tabindex="-1"
        >
          <ChapterContentPanel
            ref="chapterPanelRef"
            :scroll-element="ctx.chapterContentPanelRef.value"
            :currently-editing-paragraph-id="ctx.currentlyEditingParagraphId.value"
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
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
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
  font-family:
    'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
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

.settings-menu-wrapper {
  flex-shrink: 0;
  padding: 0 0.5rem 0.25rem;
}

.settings-menu-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.settings-menu-eyebrow {
  flex: 1;
}

.settings-menu-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.4rem;
  height: 1.4rem;
  margin-right: 0.25rem;
  padding: 0;
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  color: var(--moon-50-opacity-55);
  font-size: 0.7rem;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-menu-toggle:hover {
  background: var(--white-opacity-5);
  color: var(--moon-50-opacity-90);
}

.settings-menu-items {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.settings-menu-items--collapsed {
  position: relative;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 0.15rem;
  padding: 0.1rem 0.1rem;
}

.settings-menu-items--collapsed .settings-menu-item {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  padding: 0;
  justify-content: center;
}

.settings-menu-items--collapsed .settings-menu-icon {
  width: auto;
}

.settings-menu-items--collapsed .settings-menu-expand {
  position: absolute;
  right: 0.1rem;
  top: 50%;
  transform: translateY(-50%);
}

/* Shell wrapper holds the animated height so the section never collapses to 0 during the swap */
.settings-menu-shell {
  position: relative;
  overflow: hidden;
  transition: height 0.24s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: height;
}

/* Vue <Transition name="settings-menu"> — crossfade while shell animates height */
.settings-menu-enter-active,
.settings-menu-leave-active {
  transition: opacity 0.18s ease;
}

.settings-menu-enter-from,
.settings-menu-leave-to {
  opacity: 0;
}

/* Pull the leaving element out of flow so only the incoming one occupies space */
.settings-menu-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
}

.settings-menu-separator {
  height: 1px;
  background: var(--white-opacity-6);
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
  /* token: moon-50 @ 72% */
  color: var(--moon-50-opacity-72);
  font-size: 0.82rem;
  font-family: inherit;
  text-align: left;
  width: 100%;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}

.settings-menu-item:hover {
  background: var(--white-opacity-5);
  color: var(--moon-50-opacity-100);
}

.settings-menu-item-selected {
  background: var(--tsukuyomi-opacity-20);
  color: var(--moon-50-opacity-100);
}

.settings-menu-item-selected .settings-menu-icon {
  /* token: tsukuyomi-300 */
  color: var(--tsukuyomi-300);
}

.settings-menu-icon {
  font-size: 0.85rem;
  width: 1rem;
  color: var(--moon-50-opacity-55);
  transition: color 0.15s ease;
}

.settings-menu-item:hover .settings-menu-icon {
  color: var(--moon-50-opacity-90);
}

.settings-menu-label {
  flex: 1;
}


.book-main-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.book-main-content--reading {
  /* tokens: tsukuyomi-500 @ 10% → 3% (moonlight vignette at top) */
  background:
    radial-gradient(
      ellipse at top,
      var(--tsukuyomi-opacity-10) 0%,
      var(--tsukuyomi-opacity-3) 70%
    );
}

.book-main-content--settings {
  background: transparent;
}

.workspace-context-bar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 1.1rem;
  border-bottom: 1px solid var(--white-opacity-6);
  /* token: shell @ 55% */
  background: var(--shell-opacity-55);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}

.workspace-context-icon {
  font-size: 0.76rem;
  /* token: tsukuyomi-300 @ 85% */
  color: var(--tsukuyomi-300-opacity-85);
}

.workspace-context-eyebrow {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.58rem;
  font-weight: 600;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--accent-silver);
}

.workspace-context-sep {
  width: 1px;
  height: 0.7rem;
  background: var(--white-opacity-12);
}

.workspace-context-label {
  font-family:
    'Noto Serif JP',
    'Songti SC',
    serif;
  font-size: 0.88rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  /* token: moon-50 @ 95% */
  color: var(--moon-50-opacity-95);
}

.workspace-context-book {
  font-family:
    'Noto Sans SC',
    'PingFang SC',
    -apple-system,
    sans-serif;
  font-size: 0.72rem;
  font-weight: 500;
  /* token: accent-silver @ 50% */
  color: var(--accent-opacity-50);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.scrollable-content {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.chapter-content-panel:focus,
.chapter-content-panel:focus-visible {
  outline: none;
}

/* 隐藏原生滚动条：章节内容改用自定义索引驱动滚动条（Teleport 到 .page-container）。
   滚动仍由滚轮/键盘/触控驱动，仅隐藏原生滑块，避免其在虚拟化下与光标失同步。 */
.chapter-content-panel {
  scrollbar-width: none; /* Firefox */
}

.chapter-content-panel::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.page-container {
  padding: 1rem 1.25rem;
  /* 作为自定义滚动条 Teleport 的定位锚点 */
  position: relative;
}

.no-chapter-selected {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1.5rem;
  color: var(--moon-50-opacity-55);
}

.no-selection-icon {
  font-size: 3rem;
  /* token: accent-silver @ 45% */
  color: var(--accent-opacity-45);
  margin-bottom: 1rem;
}

.no-selection-text {
  font-size: 0.95rem;
  margin: 0 0 0.25rem;
  color: var(--moon-50-opacity-75);
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
