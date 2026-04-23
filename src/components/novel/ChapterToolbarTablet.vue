<script setup lang="ts">
/**
 * 平板专用章节头部：参考 tablet 手写稿——标题行 + 状态行 + 右侧动作区。
 *
 * 与 ChapterToolbar（桌面/手机）相比：
 *   - 不再把 undo/redo/搜索/导出/术语/角色/记忆/快捷键 同屏塞进工具栏；
 *     次级动作通过右侧常驻 rail（在 BookDetailsTablet 里）+ 底部浮动操作条触发，
 *     桌面工具栏内容靠右侧 `...` 溢出菜单承接。
 *   - 主要信息聚焦：章节标题（serif）+ "共 N 段 · 已译 M · 约 X 字" 状态行
 *     + 右侧三件套：模型芯片 / 批量翻译 / 设置齿轮。
 */
import { computed, ref } from 'vue';
import Menu from 'primevue/menu';
import type { MenuItem } from 'primevue/menuitem';
import type { Chapter, Novel, Paragraph } from 'src/models/novel';
import type { EditMode } from 'src/composables/book-details/useEditMode';
import { getChapterDisplayTitle, getChapterTranslationStats } from 'src/utils';

interface EditModeOption {
  value: EditMode;
  icon: string;
  title: string;
}

interface TranslationStatus {
  hasNone: boolean;
  hasAll: boolean;
}

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
  translatedCharCount: number;
  modelName: string;
  translationStatus: TranslationStatus;
  translationButtonLabel: string;
  translationButtonMenuItems: MenuItem[];
  isTranslatingChapter: boolean;
  isPolishingChapter: boolean;
  isSearchVisible: boolean;
  usedTermCount: number;
  usedCharacterCount: number;
  usedMemoryCount: number;
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

const overflowMenuRef = ref<{ toggle: (event: Event) => void } | null>(null);
const translateMenuRef = ref<{ toggle: (event: Event) => void } | null>(null);

const stats = computed(() => getChapterTranslationStats(props.selectedChapterParagraphs));

const translatedCharLabel = computed(() => {
  const count = props.translatedCharCount;
  if (count >= 10000) return `约 ${(count / 10000).toFixed(1)} 万字`;
  if (count >= 1000) return `约 ${(count / 1000).toFixed(1)}k 字`;
  return `约 ${count} 字`;
});

const title = computed(() =>
  props.selectedChapter
    ? getChapterDisplayTitle(props.selectedChapter, props.book || undefined)
    : '未选择章节',
);

const overflowMenuItems = computed<MenuItem[]>(() => [
  {
    label: '撤销',
    icon: 'pi pi-undo',
    disabled: !props.canUndo,
    command: () => emit('undo'),
  },
  {
    label: '重做',
    icon: 'pi pi-refresh',
    disabled: !props.canRedo,
    command: () => emit('redo'),
  },
  { separator: true },
  {
    label: props.isSearchVisible ? '关闭搜索' : '搜索与替换',
    icon: props.isSearchVisible ? 'pi pi-search-minus' : 'pi pi-search',
    command: () => emit('toggleSearch'),
  },
  {
    label: '导出章节',
    icon: 'pi pi-file-export',
    // PrimeVue Menu command 回调只暴露 MenuItemCommandEvent，originalEvent 可能缺失，
    // 这里仅用 event 用于 Popover 定位；缺失时使用 document.body 兜底。
    command: (event) => emit('toggleExport', (event.originalEvent) ?? new Event('click')),
  },
  { separator: true },
  {
    label: `术语（${props.usedTermCount}）`,
    icon: 'pi pi-bookmark',
    command: (event) =>
      emit('toggleTermPopover', (event.originalEvent) ?? new Event('click')),
  },
  {
    label: `角色（${props.usedCharacterCount}）`,
    icon: 'pi pi-user',
    command: (event) =>
      emit('toggleCharacterPopover', (event.originalEvent) ?? new Event('click')),
  },
  {
    label: `记忆（${props.usedMemoryCount}）`,
    icon: 'pi pi-lightbulb',
    command: (event) =>
      emit('toggleMemoryPopover', (event.originalEvent) ?? new Event('click')),
  },
  { separator: true },
  {
    label: '键盘快捷键',
    icon: 'pi pi-info-circle',
    command: (event) =>
      emit('toggleKeyboardShortcuts', (event.originalEvent) ?? new Event('click')),
  },
]);

const onOverflowToggle = (event: Event) => overflowMenuRef.value?.toggle(event);
const onTranslateMenuToggle = (event: Event) => translateMenuRef.value?.toggle(event);

const translateBusy = computed(
  () => props.isTranslatingChapter || props.isPolishingChapter,
);
const translateIcon = computed(() => {
  if (translateBusy.value) return 'pi pi-spin pi-spinner';
  return props.translationStatus.hasAll ? 'pi pi-sparkles' : 'pi pi-play';
});
const translateDisabled = computed(
  () => translateBusy.value || !props.selectedChapterParagraphs.length,
);
const showTranslateCaret = computed(() => !props.translationStatus.hasNone);
</script>

<template>
  <div class="chapter-toolbar-tablet">
    <div class="ctt-main">
      <div class="ctt-text">
        <h1 class="ctt-title" :title="title">{{ title }}</h1>
        <div class="ctt-stats">
          <span>共 {{ stats.total }} 段</span>
          <span class="ctt-stats-sep">·</span>
          <span>已译 {{ stats.translated }}</span>
          <span class="ctt-stats-sep">·</span>
          <span>{{ translatedCharLabel }}</span>
        </div>
      </div>

      <div class="ctt-actions">
        <span class="ctt-chip">
          <i class="pi pi-sparkles" aria-hidden="true" />
          {{ modelName }}
        </span>

        <div class="ctt-primary">
          <button
            type="button"
            class="ctt-primary-main"
            :disabled="translateDisabled"
            @click="emit('translationButtonClick')"
          >
            <i :class="['pi', translateIcon]" aria-hidden="true" />
            {{ translationButtonLabel }}
          </button>
          <button
            v-if="showTranslateCaret"
            type="button"
            class="ctt-primary-caret"
            :disabled="translateDisabled"
            aria-label="更多翻译操作"
            @click="onTranslateMenuToggle"
          >
            <i class="pi pi-chevron-down" aria-hidden="true" />
          </button>
          <Menu ref="translateMenuRef" :model="translationButtonMenuItems" popup />
        </div>

        <button
          type="button"
          class="ctt-icon-btn"
          title="翻译设置"
          @click="(event: Event) => emit('toggleSpecialInstructions', event)"
        >
          <i class="pi pi-cog" aria-hidden="true" />
        </button>

        <button
          type="button"
          class="ctt-icon-btn"
          title="更多操作"
          @click="onOverflowToggle"
        >
          <i class="pi pi-ellipsis-v" aria-hidden="true" />
        </button>
        <Menu ref="overflowMenuRef" :model="overflowMenuItems" popup />
      </div>
    </div>
  </div>
</template>

<style scoped>
.chapter-toolbar-tablet {
  padding: 14px 22px 12px;
  border-bottom: 1px solid var(--white-opacity-6);
  background: var(--night-300-opacity-72); /* token: night-300 @ 72% */
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-shrink: 0;
}

.ctt-main {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.ctt-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ctt-title {
  margin: 0;
  font-family: 'Noto Serif JP', 'Songti SC', serif;
  font-size: 18px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.01em;
  color: var(--primary-200); /* token: primary-200 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ctt-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: var(--moon-50-opacity-55);
  letter-spacing: 0.02em;
  flex-wrap: wrap;
}

.ctt-stats-sep {
  opacity: 0.45;
}

.ctt-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.ctt-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: var(--tsukuyomi-opacity-14); /* token: tsukuyomi-500 @ 14% */
  border: 1px solid var(--tsukuyomi-opacity-28); /* token: tsukuyomi-500 @ 28% */
  border-radius: 999px;
  font-size: 11px;
  font-weight: 500;
  color: var(--tsukuyomi-200); /* token: tsukuyomi-200 */
  white-space: nowrap;
}

.ctt-chip i {
  font-size: 10px;
}

/* 主动作按钮——直接对齐手机端 .mbr-strip-btn 的视觉（半透明 slate 填充 +
   细边 + 浅色文字 + 8px 圆角），只把尺寸按平板稍微放大。SplitButton 的结构
   在 PrimeVue 下样式过重，这里改成纯 <button> + 独立 caret 以保持一致观感。*/
.ctt-primary {
  display: inline-flex;
  align-items: stretch;
  background: var(--tsukuyomi-opacity-25);
  border: 1px solid var(--tsukuyomi-opacity-40);
  border-radius: 8px;
  overflow: hidden;
  transition: all 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ctt-primary:hover {
  background: var(--tsukuyomi-opacity-38); /* token: tsukuyomi-500 @ 38% */
}

.ctt-primary-main,
.ctt-primary-caret {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--primary-300); /* token: primary-300 */
  font-family: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ctt-primary-main:disabled,
.ctt-primary-caret:disabled {
  opacity: 0.5;
  cursor: default;
}

.ctt-primary-main i {
  font-size: 11px;
  color: var(--tsukuyomi-300); /* token: tsukuyomi-300 */
}

.ctt-primary-caret {
  padding: 6px 8px;
  border-left: 1px solid var(--tsukuyomi-opacity-32); /* token: tsukuyomi-500 @ 32% */
  color: rgba(216, 221, 232, 0.75); /* token: primary-300 @ 75% */
}

.ctt-primary-caret:hover:not(:disabled) {
  color: var(--primary-200); /* token: primary-200 */
}

.ctt-primary-caret i {
  font-size: 10px;
}

.ctt-icon-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--white-opacity-8);
  border-radius: 8px;
  color: var(--moon-50-opacity-72); /* token: moon-50 @ 72% */
  cursor: pointer;
  transition:
    background 150ms cubic-bezier(0.4, 0, 0.2, 1),
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ctt-icon-btn:hover {
  background: var(--white-opacity-6);
  color: var(--primary-200); /* token: primary-200 */
  border-color: var(--white-opacity-14); /* token: white @ 14% */
}

.ctt-icon-btn i {
  font-size: 13px;
}

</style>
