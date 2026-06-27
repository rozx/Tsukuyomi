<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
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
import BookSidebar from './BookSidebar.vue';

const ctx = injectBookDetailsPage();

// 章节内容面板组件 ref：挂载后把其 scrollToParagraphIndex 注册到页面上下文，供键盘导航/搜索按索引滚动。
// 用具体的 exposed 接口而非 InstanceType<typeof ChapterContentPanel>（后者在泛型 SFC 下会退化为 any，
// 触发 eslint no-redundant-type-constituents）。
const chapterPanelRef = ref<{ scrollToParagraphIndex: ChapterScrollToIndex } | null>(null);
watch(chapterPanelRef, (comp) => {
  ctx.registerChapterScroller(comp ? (index, options) => comp.scrollToParagraphIndex(index, options) : null);
});

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

// 主内容区显隐 / 工具栏 / 面板的复合条件全部收进 computed，避免模板内 && / || / === 堆叠
const hasSettingMenu = computed(() => !!ctx.selectedSettingMenu.value);
const hasSelectedChapter = computed(() => !!ctx.selectedChapter.value);
const showContextBar = computed(() => settingContextMeta.value !== null && !ctx.isPhone.value);
const showTabletToolbar = computed(
  () => ctx.isTablet.value && hasSelectedChapter.value && !hasSettingMenu.value,
);
const showDesktopToolbar = computed(
  () =>
    hasSelectedChapter.value &&
    !hasSettingMenu.value &&
    (ctx.isPhone.value ? ctx.workspaceMode.value === 'content' : true),
);
const onEditModeChange = (value: EditMode) => {
  ctx.editMode.value = value;
};
const mainContentClass = computed(() => ({
  'overflow-hidden': hasSettingMenu.value,
  'book-main-content--settings': hasSettingMenu.value,
  'book-main-content--reading': !hasSettingMenu.value && hasSelectedChapter.value,
  'book-main-content-mobile-hidden':
    ctx.isPhone.value && ctx.workspaceMode.value === 'catalog',
}));
const scrollableClass = computed(() => ({
  '!overflow-hidden': hasSettingMenu.value,
  'scrollable-content-mobile-hidden':
    ctx.isPhone.value &&
    ctx.workspaceMode.value === 'settings' &&
    !hasSettingMenu.value,
}));
const pageContainerClass = computed(() => ({
  '!h-full !overflow-hidden !min-h-0 flex flex-col !p-0': hasSettingMenu.value,
  '!h-full !overflow-hidden !min-h-0': hasSelectedChapter.value,
}));

// 以下 computed 把模板里重复的 `ctx.x.value || null` / `?.` 收进脚本侧，并把三态设置面板折叠
const bookOrNull = computed(() => ctx.book.value || null);
const undoDescriptionOrNull = computed(() => ctx.undoDescription.value || null);
const redoDescriptionOrNull = computed(() => ctx.redoDescription.value || null);
const contextIcon = computed(() => settingContextMeta.value?.icon);
const contextEyebrow = computed(() => settingContextMeta.value?.eyebrow);
const contextLabel = computed(() => settingContextMeta.value?.label);
const settingsPanelComponent = computed<Component | null>(() => {
  switch (ctx.selectedSettingMenu.value) {
    case 'terms':
      return TerminologyPanel;
    case 'characters':
      return CharacterSettingPanel;
    case 'memory':
      return MemoryPanel;
    default:
      return null;
  }
});
</script>

<template>
  <!-- 左侧卷/章节面板（抽出到 BookSidebar） -->
  <BookSidebar />

  <!-- 主内容区域 -->
  <div class="book-main-content" :class="mainContentClass">
    <!-- 设置上下文头（桌面）：在工作台主面板里清晰标示当前设置区 -->
    <header v-if="showContextBar" class="workspace-context-bar">
      <i :class="contextIcon" class="workspace-context-icon" aria-hidden="true" />
      <span class="workspace-context-eyebrow">{{ contextEyebrow }}</span>
      <span class="workspace-context-sep" aria-hidden="true" />
      <span class="workspace-context-label">{{ contextLabel }}</span>
      <span v-if="ctx.book.value" class="workspace-context-book"
        >· {{ ctx.book.value.title }}</span
      >
    </header>

    <!-- 章节阅读工具栏：平板单独用 ChapterToolbarTablet（更干净的 header），其余设备仍用 ChapterToolbar -->
    <ChapterToolbarTablet
      v-if="showTabletToolbar"
      :selected-chapter="ctx.selectedChapter.value"
      :book="bookOrNull"
      :can-undo="ctx.canUndo.value"
      :can-redo="ctx.canRedo.value"
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
      v-else-if="showDesktopToolbar"
      :selected-chapter="ctx.selectedChapter.value"
      :book="bookOrNull"
      :can-undo="ctx.canUndo.value"
      :can-redo="ctx.canRedo.value"
      :undo-description="undoDescriptionOrNull"
      :redo-description="redoDescriptionOrNull"
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
      @update:edit-mode="onEditModeChange"
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
      v-if="showDesktopToolbar"
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
      :class="scrollableClass"
    >
      <div class="page-container" :class="pageContainerClass">
        <component
          :is="settingsPanelComponent"
          v-if="settingsPanelComponent"
          :book="bookOrNull"
          class="flex-1 min-h-0"
        />

        <div
          v-else-if="hasSelectedChapter"
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
            :book="bookOrNull"
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

/* 鼠标/触摸/程序化聚焦不显示蓝色焦点框；保留键盘 :focus-visible 的轻量焦点指示以维持可访问性 */
.chapter-content-panel:focus:not(:focus-visible) {
  outline: none;
}

.chapter-content-panel:focus-visible {
  outline: 2px solid var(--tsukuyomi-opacity-40);
  outline-offset: -2px;
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
