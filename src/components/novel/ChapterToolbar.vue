<script setup lang="ts">
import Menubar from 'primevue/menubar';
import Button from 'primevue/button';
import SplitButton from 'primevue/splitbutton';
import Badge from 'primevue/badge';
import type { Chapter, Paragraph } from 'src/models/novel';
import type { EditMode } from 'src/composables/book-details/useEditMode';
import { getChapterDisplayTitle } from 'src/utils';

interface EditModeOption {
  value: EditMode;
  icon: string;
  title: string;
}

interface TranslationStatus {
  hasNone: boolean;
  hasAll: boolean;
}

// Use PrimeVue's MenuItem type
import type { MenuItem } from 'primevue/menuitem';

const props = defineProps<{
  selectedChapter: Chapter | null;
  canUndo: boolean;
  canRedo: boolean;
  undoDescription: string | null;
  redoDescription: string | null;
  editMode: EditMode;
  editModeOptions: EditModeOption[];
  selectedChapterParagraphs: Paragraph[];
  usedTermCount: number;
  usedCharacterCount: number;
  translationStatus: TranslationStatus;
  translationButtonLabel: string;
  translationButtonMenuItems: MenuItem[];
  isTranslatingChapter: boolean;
  isPolishingChapter: boolean;
  isSearchVisible: boolean;
}>();

const emit = defineEmits<{
  (e: 'undo'): void;
  (e: 'redo'): void;
  (e: 'update:editMode', value: EditMode): void;
  (e: 'normalize'): void;
  (e: 'toggleExport', event: Event): void;
  (e: 'toggleTermPopover', event: Event): void;
  (e: 'toggleCharacterPopover', event: Event): void;
  (e: 'translationButtonClick'): void;
  (e: 'toggleSearch'): void;
  (e: 'toggleKeyboardShortcuts', event: Event): void;
}>();

const handleEditModeChange = (value: EditMode) => {
  emit('update:editMode', value);
};

const handleToggleTermPopover = (event: Event) => {
  emit('toggleTermPopover', event);
};

const handleToggleCharacterPopover = (event: Event) => {
  emit('toggleCharacterPopover', event);
};

const handleToggleKeyboardShortcuts = (event: Event) => {
  emit('toggleKeyboardShortcuts', event);
};
</script>

<template>
  <Menubar
    :model="[]"
    class="chapter-toolbar !border-none !rounded-none !bg-white/5 !backdrop-blur-md !border-b !border-white/10 !p-2 !px-6"
  >
    <template #start>
      <div class="flex items-center gap-3 overflow-hidden max-w-[15rem]">
        <span
          v-if="selectedChapter"
          class="text-sm font-bold truncate opacity-90"
          :title="getChapterDisplayTitle(selectedChapter)"
        >
          {{ getChapterDisplayTitle(selectedChapter) }}
        </span>
      </div>
    </template>

    <template #end>
      <div class="flex items-center gap-2">
        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 撤销/重做按钮 -->
        <div class="flex items-center gap-1 mr-2">
          <Button
            icon="pi pi-undo"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :disabled="!canUndo"
            :title="undoDescription ? `撤销: ${undoDescription}` : '撤销 (Ctrl+Z)'"
            @click="emit('undo')"
          />
          <Button
            icon="pi pi-refresh"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :disabled="!canRedo"
            :title="redoDescription ? `重做: ${redoDescription}` : '重做 (Ctrl+Y)'"
            @click="emit('redo')"
          />
        </div>

        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 编辑模式切换 -->
        <div class="flex items-center bg-white/5 rounded-lg p-1 gap-1 mr-2">
          <Button
            v-for="option in editModeOptions"
            :key="option.value"
            :icon="option.icon"
            :title="option.title"
            rounded
            text
            size="small"
            :class="[
              '!w-8 !h-8',
              editMode === option.value
                ? '!bg-primary/20 !text-primary'
                : 'text-moon/70 hover:text-moon',
            ]"
            @click="handleEditModeChange(option.value)"
          />
        </div>

        <!-- 规范化按钮 -->
        <Button
          icon="pi pi-code"
          rounded
          text
          size="small"
          class="!w-8 !h-8 text-moon/70 hover:text-moon"
          title="规范化符号：格式化本章所有翻译中的符号（引号、标点、空格等）"
          :disabled="!selectedChapter || !selectedChapterParagraphs.length"
          @click="emit('normalize')"
        />

        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 导出按钮 -->
        <Button
          icon="pi pi-file-export"
          rounded
          text
          size="small"
          class="!w-8 !h-8 text-moon/70 hover:text-moon"
          title="导出章节内容"
          @click="(event: Event) => emit('toggleExport', event)"
        />

        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 术语统计 -->
        <div class="relative inline-flex">
          <Button
            icon="pi pi-bookmark"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :title="`本章共使用了 ${usedTermCount} 个术语`"
            @click="handleToggleTermPopover"
          />
          <Badge
            v-if="usedTermCount > 0"
            :value="usedTermCount > 99 ? '99+' : usedTermCount"
            severity="info"
            class="absolute -top-1 -right-1 !min-w-[1.25rem] !h-[1.25rem] !text-[0.75rem] !p-0 flex items-center justify-center"
          />
        </div>

        <!-- 角色统计 -->
        <div class="relative inline-flex">
          <Button
            icon="pi pi-user"
            rounded
            text
            size="small"
            class="!w-8 !h-8 text-moon/70 hover:text-moon"
            :title="`本章共使用了 ${usedCharacterCount} 个角色设定`"
            @click="handleToggleCharacterPopover"
          />
          <Badge
            v-if="usedCharacterCount > 0"
            :value="usedCharacterCount > 99 ? '99+' : usedCharacterCount"
            severity="info"
            class="absolute -top-1 -right-1 !min-w-[1.25rem] !h-[1.25rem] !text-[0.75rem] !p-0 flex items-center justify-center"
          />
        </div>

        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 翻译按钮 -->
        <Button
          v-if="translationStatus.hasNone"
          :label="translationButtonLabel"
          icon="pi pi-language"
          size="small"
          class="!px-3"
          :loading="isTranslatingChapter || isPolishingChapter"
          :disabled="
            isTranslatingChapter || isPolishingChapter || !selectedChapterParagraphs.length
          "
          @click="emit('translationButtonClick')"
        />
        <SplitButton
          v-else
          :label="translationButtonLabel"
          :icon="translationStatus.hasAll ? 'pi pi-sparkles' : 'pi pi-language'"
          size="small"
          class="!px-3"
          :loading="isTranslatingChapter || isPolishingChapter"
          :disabled="
            isTranslatingChapter || isPolishingChapter || !selectedChapterParagraphs.length
          "
          :model="translationButtonMenuItems"
          @click="emit('translationButtonClick')"
        />

        <div class="w-px h-4 bg-white/20 mx-2"></div>

        <!-- 搜索按钮 -->
        <Button
          :icon="isSearchVisible ? 'pi pi-search-minus' : 'pi pi-search'"
          rounded
          text
          size="small"
          class="!w-8 !h-8 text-moon/70 hover:text-moon"
          :class="{ '!bg-primary/20 !text-primary': isSearchVisible }"
          :title="isSearchVisible ? '关闭搜索 (Ctrl+F)' : '搜索与替换 (Ctrl+F)'"
          @click="emit('toggleSearch')"
        />

        <!-- 键盘快捷键按钮 -->
        <Button
          icon="pi pi-info-circle"
          rounded
          text
          size="small"
          class="!w-8 !h-8 text-moon/70 hover:text-moon"
          title="键盘快捷键"
          @click="handleToggleKeyboardShortcuts"
        />
      </div>
    </template>
  </Menubar>
</template>
