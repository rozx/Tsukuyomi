<script setup lang="ts">
import { ref, computed } from 'vue';
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { EditMode } from 'src/composables/book-details/useEditMode';
import { getChapterDisplayTitle } from 'src/utils';
import { useUiStore } from 'src/stores/ui';
import ToolbarBadgeButton from 'src/components/novel/ToolbarBadgeButton.vue';

interface EditModeOption {
  value: EditMode;
  icon: string;
  title: string;
}

interface TranslationStatus {
  hasNone: boolean;
  hasAll: boolean;
}

import type { MenuItem } from 'primevue/menuitem';

const props = defineProps<{
  selectedChapter: Chapter | null;
  book: Novel | null;
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  editMode: EditMode;
  editModeOptions: EditModeOption[];
  selectedChapterParagraphs: Paragraph[];
  usedTermCount: number;
  usedCharacterCount: number;
  usedMemoryCount: number;
  translationStatus: TranslationStatus;
  translationButtonLabel: string;
  translationButtonMenuItems: MenuItem[];
  isTranslatingChapter: boolean;
  isPolishingChapter: boolean;
  isSearchVisible: boolean;
  isSmallScreen: boolean;
}>();

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'update:editMode', value: EditMode): void;
  (e: 'toggleExport', event: Event): void;
  (e: 'toggleTermPopover', event: Event): void;
  (e: 'toggleCharacterPopover', event: Event): void;
  (e: 'toggleMemoryPopover', event: Event): void;
  (e: 'translationButtonClick'): void;
  (e: 'toggleSearch'): void;
  (e: 'toggleKeyboardShortcuts', event: Event): void;
  (e: 'toggleSpecialInstructions', event: Event): void;
}>();

const uiStore = useUiStore();
const isToolbarExpanded = ref(false);

const handleEditModeChange = (value: EditMode) => {
  emit('update:editMode', value);
};

const handleToggleTermPopover = (event: Event) => {
  emit('toggleTermPopover', event);
};

const handleToggleCharacterPopover = (event: Event) => {
  emit('toggleCharacterPopover', event);
};

const handleToggleMemoryPopover = (event: Event) => {
  emit('toggleMemoryPopover', event);
};

const handleToggleKeyboardShortcuts = (event: Event) => {
  emit('toggleKeyboardShortcuts', event);
};

// 把模板内的内联三元/&& 收敛为 computed，降低模板圈复杂度（复杂度转移到 script，不计入模板指标）
const translationSplitIcon = computed(() =>
  props.translationStatus.hasAll ? 'pi pi-sparkles' : 'pi pi-language',
);
const expandToggleIcon = computed(() =>
  isToolbarExpanded.value ? 'pi pi-chevron-up' : 'pi pi-chevron-down',
);
const expandToggleTitle = computed(() => (isToolbarExpanded.value ? '收起工具栏' : '展开工具栏'));
const undoBtnTitle = computed(() =>
  props.undoDescription ? `撤销: ${props.undoDescription}` : '撤销 (Ctrl+Z)',
);
const redoBtnTitle = computed(() =>
  props.redoDescription ? `重做: ${props.redoDescription}` : '重做 (Ctrl+Y)',
);
const searchBtnIcon = computed(() =>
  props.isSearchVisible ? 'pi pi-search-minus' : 'pi pi-search',
);
const searchBtnTitle = computed(() =>
  props.isSearchVisible ? '关闭搜索 (Ctrl+F)' : '搜索与替换 (Ctrl+F)',
);
const progressBtnActive = computed(
  () => uiStore.rightPanelOpen && uiStore.activeRightTab === 'progress',
);
const translationBtnLoading = computed(
  () => props.isTranslatingChapter || props.isPolishingChapter,
);
const translationBtnDisabled = computed(
  () => props.isTranslatingChapter || props.isPolishingChapter || !props.selectedChapterParagraphs.length,
);
const editModeBtnClass = (value: EditMode) =>
  value === props.editMode ? '!bg-primary/20 !text-primary' : 'text-moon/70 hover:text-moon';
</script>

<template>
  <div class="chapter-toolbar">
    <!-- Primary row: title + translate button + expand toggle (always visible) -->
    <div class="chapter-toolbar-primary">
      <span
        v-if="selectedChapter"
        class="chapter-toolbar-title"
        :title="getChapterDisplayTitle(selectedChapter, book || undefined)"
      >
        {{ getChapterDisplayTitle(selectedChapter, book || undefined) }}
      </span>

      <div class="chapter-toolbar-primary-actions">
        <div class="toolbar-group toolbar-group-mode">
          <Button
            v-for="option in editModeOptions"
            :key="option.value"
            :icon="option.icon"
            :title="option.title"
            rounded
            text
            size="small"
            :class="['!w-8 !h-8', editModeBtnClass(option.value)]"
            @click="handleEditModeChange(option.value)"
          />
        </div>

        <Button
          v-if="translationStatus.hasNone"
          :label="translationButtonLabel"
          icon="pi pi-language"
          size="small"
          class="translation-main-button !px-3"
          :loading="translationBtnLoading"
          :disabled="translationBtnDisabled"
          @click="emit('translationButtonClick')"
        />
        <SplitButton
          v-else
          :label="translationButtonLabel"
          :icon="translationSplitIcon"
          size="small"
          class="translation-main-button !px-3"
          :loading="translationBtnLoading"
          :disabled="translationBtnDisabled"
          :model="translationButtonMenuItems"
          @click="emit('translationButtonClick')"
        />

        <Button
          :icon="expandToggleIcon"
          rounded
          text
          size="small"
          class="toolbar-expand-toggle !w-8 !h-8 text-moon/70 hover:text-moon"
          :title="expandToggleTitle"
          @click="isToolbarExpanded = !isToolbarExpanded"
        />
      </div>
    </div>

    <!-- Secondary row: all other tools (collapsible on mobile) -->
    <div
      class="chapter-toolbar-secondary"
      :class="{ 'chapter-toolbar-secondary--expanded': isToolbarExpanded }"
    >
      <div class="chapter-toolbar-actions">
        <!-- 编辑组: 撤销/重做 -->
        <div class="toolbar-group">
          <Button
            icon="pi pi-undo"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :disabled="!canUndo"
            :title="undoBtnTitle"
            @click="emit('undo')"
          />
          <Button
            icon="pi pi-refresh"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :disabled="!canRedo"
            :title="redoBtnTitle"
            @click="emit('redo')"
          />
        </div>

        <div class="toolbar-divider"></div>

        <!-- 搜索 + 导出 -->
        <div class="toolbar-group">
          <Button
            :icon="searchBtnIcon"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :class="{ '!bg-primary/20 !text-primary': isSearchVisible }"
            :title="searchBtnTitle"
            @click="emit('toggleSearch')"
          />
          <Button
            icon="pi pi-file-export"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            title="导出章节内容"
            @click="(event: Event) => emit('toggleExport', event)"
          />
        </div>

        <div class="toolbar-divider"></div>

        <!-- 资源组: 术语/角色/记忆 -->
        <div class="toolbar-group">
          <ToolbarBadgeButton
            icon="pi pi-bookmark"
            :count="usedTermCount"
            :title="`本章共使用了 ${usedTermCount} 个术语`"
            @click="handleToggleTermPopover"
          />
          <ToolbarBadgeButton
            icon="pi pi-user"
            :count="usedCharacterCount"
            :title="`本章共使用了 ${usedCharacterCount} 个角色设定`"
            @click="handleToggleCharacterPopover"
          />
          <ToolbarBadgeButton
            icon="pi pi-lightbulb"
            :count="usedMemoryCount"
            :title="`本章共参考了 ${usedMemoryCount} 条记忆`"
            @click="handleToggleMemoryPopover"
          />
        </div>

        <div class="toolbar-divider"></div>

        <!-- 设置组: 快捷键/进度/设置 -->
        <div class="toolbar-group">
          <Button
            icon="pi pi-info-circle"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            title="键盘快捷键"
            @click="handleToggleKeyboardShortcuts"
          />

          <Button
            icon="pi pi-objects-column"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :class="{ '!bg-primary/20 !text-primary': progressBtnActive }"
            title="翻译进度"
            :disabled="isSmallScreen"
            @click="() => { uiStore.openRightPanel(); uiStore.setActiveRightTab('progress'); }"
          />

          <Button
            icon="pi pi-cog"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            title="翻译设置"
            @click="(event: Event) => emit('toggleSpecialInstructions', event)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chapter-toolbar {
  border-bottom: 1px solid var(--white-opacity-10);
  background: var(--white-opacity-5);
  backdrop-filter: blur(12px);
  padding: 0.5rem 1.5rem;
}

/* === Primary row: title + translate + toggle === */
.chapter-toolbar-primary {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2rem;
}

.chapter-toolbar-title {
  display: inline-block;
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.35;
  color: var(--moon-opacity-90);
  opacity: 0.95;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.chapter-toolbar-primary-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

/* Expand toggle: hidden on desktop, visible on mobile/tablet */
.toolbar-expand-toggle {
  display: none;
}

/* === Secondary row: all tools === */
.chapter-toolbar-secondary {
  margin-top: 0.35rem;
}

.chapter-toolbar-actions {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 0.125rem;
}

.toolbar-group {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}

.toolbar-group-mode {
  background: var(--white-opacity-5);
  border-radius: 0.5rem;
  padding: 0.125rem;
}

.toolbar-divider {
  width: 1px;
  height: 1rem;
  background: var(--white-opacity-20);
  flex-shrink: 0;
}

/* === Tablet & Mobile: collapsible secondary toolbar === */
@media (max-width: 1279px) {
  .chapter-toolbar {
    padding: 0.5rem 0.75rem;
  }

  .chapter-toolbar-title {
    font-size: 0.8125rem;
    opacity: 0.9;
  }

  /* Show expand toggle on mobile/tablet */
  .toolbar-expand-toggle {
    display: inline-flex;
  }

  /* Hide translation button label text (icon-only) */
  .chapter-toolbar :deep(.translation-main-button .p-button-label) {
    display: none;
  }

  .chapter-toolbar :deep(.translation-main-button .p-button),
  .chapter-toolbar :deep(.translation-main-button .p-splitbutton-button) {
    padding-left: 0.6rem !important;
    padding-right: 0.6rem !important;
    min-width: 2.25rem;
  }

  /* Collapsible secondary section */
  .chapter-toolbar-secondary {
    max-height: 0;
    overflow: hidden;
    margin-top: 0;
    transition:
      max-height 0.25s ease-out,
      margin-top 0.25s ease-out;
  }

  .chapter-toolbar-secondary--expanded {
    max-height: 10rem;
    margin-top: 0.35rem;
    transition:
      max-height 0.3s ease-in,
      margin-top 0.2s ease-in;
  }

  /* Wrapped layout for secondary actions */
  .chapter-toolbar-actions {
    gap: 0.25rem;
    justify-content: flex-start;
    flex-wrap: wrap;
    overflow-x: visible;
    overflow-y: visible;
  }

  .toolbar-divider {
    display: none;
  }
}
</style>
