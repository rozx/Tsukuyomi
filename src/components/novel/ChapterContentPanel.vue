<script setup lang="ts">
import { computed, ref, watch, toRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Badge from 'primevue/badge';
import ProgressSpinner from 'primevue/progressspinner';
import type ParagraphCard from 'src/components/novel/ParagraphCard.vue';
import ChapterParagraphRow from 'src/components/novel/ChapterParagraphRow.vue';
import ChapterScrollbar from 'src/components/novel/ChapterScrollbar.vue';
import type {
  Chapter,
  Novel,
  Paragraph,
  Terminology,
  CharacterSetting,
} from 'src/models/novel';
import {
  getChapterDisplayTitle,
  getChapterCharCount,
  formatWordCount,
} from 'src/utils';
import { getSelectedParagraphTranslationText } from 'src/utils/translation-utils';
import { removeExtraBlankLines } from 'src/utils/text-utils';
import { useToastWithHistory } from 'src/composables/useToastHistory';
import type { EditMode } from 'src/composables/book-details/useEditMode';
import {
  useChapterVirtualizer,
  type ChapterListMode,
} from 'src/composables/book-details/useChapterVirtualizer';
import type { ScrollToOptions as VirtualScrollToOptions } from '@tanstack/vue-virtual';

const props = defineProps<{
  selectedChapter: Chapter | null;
  selectedChapterWithContent: Chapter | null;
  selectedChapterParagraphs: Paragraph[];
  isLoadingChapterContent: boolean;
  editMode: EditMode;
  originalTextEditValue: string;
  translatedCharCount: number;
  book: Novel | null;
  // 稳定化的术语/角色引用，避免 ParagraphCard 在无关的 book 变化时重新计算高亮
  terminologies: Terminology[];
  characterSettings: CharacterSetting[];
  bookId?: string;
  selectedChapterId: string | null;
  translatingParagraphIds: Set<string>;
  polishingParagraphIds: Set<string>;
  proofreadingParagraphIds: Set<string>;
  searchQuery: string;
  selectedParagraphIndex: number | null;
  isKeyboardSelected: boolean;
  isClickSelected: boolean;
  paragraphCardRefs: Map<string, InstanceType<typeof ParagraphCard>>;
  isSmallScreen: boolean;
  prevChapter: Chapter | null;
  nextChapter: Chapter | null;
  // 虚拟滚动：真实滚动容器（父级 .chapter-content-panel wrapper）与当前编辑段落 id（用于钉住）
  scrollElement: HTMLElement | null;
  currentlyEditingParagraphId: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:originalTextEditValue', value: string): void;
  (e: 'open-edit-chapter-dialog', chapter: Chapter): void;
  (e: 'cancel-original-text-edit'): void;
  (e: 'save-original-text-edit'): void;
  (e: 'update-translation', paragraphId: string, newTranslation: string): void;
  (e: 'retranslate-paragraph', paragraphId: string): void;
  (e: 'polish-paragraph', paragraphId: string): void;
  (e: 'proofread-paragraph', paragraphId: string): void;
  (e: 'select-translation', paragraphId: string, translationId: string): void;
  (e: 'paragraph-click', paragraphId: string): void;
  (e: 'paragraph-edit-start', paragraphId: string): void;
  (e: 'paragraph-edit-stop', paragraphId: string): void;
  (e: 'navigate-to-chapter', chapter: Chapter): void;
  (e: 'navigate-to-chapter-list'): void;
}>();

// 获取选中章节的统计信息
const selectedChapterStats = computed(() => {
  if (!props.selectedChapterWithContent) return null;

  const paragraphCount = props.selectedChapterParagraphs.length;
  const charCount = getChapterCharCount(props.selectedChapterWithContent);

  return {
    paragraphCount,
    charCount,
  };
});

// 获取段落的选中翻译文本（应用显示层格式化）
const getParagraphTranslationText = (paragraph: Paragraph): string =>
  getSelectedParagraphTranslationText(paragraph, props.book, props.selectedChapterWithContent);

const handleOriginalTextInput = (event: Event) => {
  const target = event.target as HTMLTextAreaElement;
  emit('update:originalTextEditValue', target.value);
};

const toast = useToastWithHistory();
const originalTextareaRef = ref<InstanceType<typeof Textarea> | null>(null);

// PrimeVue Textarea 内部是 textarea 元素；不同版本暴露方式不同，防御式解析。
const resolveOriginalTextarea = (): HTMLTextAreaElement | null => {
  const inst = originalTextareaRef.value as unknown as
    | { $el?: HTMLElement; input?: HTMLTextAreaElement }
    | null;
  if (!inst) return null;
  const root = inst.$el;
  if (root instanceof HTMLTextAreaElement) return root;
  const found = root?.querySelector('textarea');
  if (found) return found;
  return inst.input ?? null;
};

// 记住上次格式化的产出，连按两次（中间未编辑）时不再减一行，避免把场景空行吃掉。
// 切换章节时重置，避免跨章节误判。
const lastFormattedValue = ref<string | null>(null);
watch(
  () => props.selectedChapterId,
  () => {
    lastFormattedValue.value = null;
  },
);

// 格式化原始文本：每段连续空行减一行（保留相对间距）。
// 通过原生编辑管线（execCommand insertText）写入，使 Ctrl+Z / Ctrl+Y 能撤销/重做格式化；
// 仅更新编辑框，不直接落盘。
const formatOriginalText = () => {
  const current = props.originalTextEditValue;

  // 已是上次格式化结果（未再编辑）→ 不再减一行
  if (current === lastFormattedValue.value) {
    toast.add({
      severity: 'info',
      summary: '无需格式化',
      detail: '已是格式化后的结果',
      life: 2000,
    });
    return;
  }

  const formatted = removeExtraBlankLines(current);
  if (formatted === current) {
    toast.add({
      severity: 'info',
      summary: '无需格式化',
      detail: '没有需要清理的空行',
      life: 2000,
    });
    lastFormattedValue.value = current;
    return;
  }

  const el = resolveOriginalTextarea();
  // 用原生编辑替换全文，保留浏览器撤销/重做历史；input 事件会同步 originalTextEditValue
  let appliedViaNativeEdit = false;
  if (el) {
    el.focus();
    el.select();
    appliedViaNativeEdit = document.execCommand('insertText', false, formatted);
  }
  // 回退：环境不支持 execCommand 时直接更新（此时该次格式化无法用原生撤销）
  if (!appliedViaNativeEdit) {
    emit('update:originalTextEditValue', formatted);
  }
  lastFormattedValue.value = formatted;

  toast.add({
    severity: 'success',
    summary: '已格式化',
    detail: '已去除多余空行（可按 Ctrl+Z 撤销）',
    life: 2000,
  });
};

const getPrevChapterButtonLabel = (chapter: Chapter | null): string => {
  if (!chapter) return props.isSmallScreen ? '上一章' : '没有上一章';
  return props.isSmallScreen ? '上一章' : getChapterDisplayTitle(chapter, props.book || undefined);
};

const getNextChapterButtonLabel = (chapter: Chapter | null): string => {
  if (!chapter) return props.isSmallScreen ? '下一章' : '没有下一章';
  return props.isSmallScreen ? '下一章' : getChapterDisplayTitle(chapter, props.book || undefined);
};

// ---- 虚拟滚动（block translation）----
// 编辑/列表模式与预览模式共用同一个 virtualizer（任一时刻只渲染其中一个分支）。
const paragraphsRef = computed(() => props.selectedChapterParagraphs);
const scrollElementRef = toRef(props, 'scrollElement');
const chapterListMode = computed<ChapterListMode>(() =>
  props.editMode === 'preview' ? 'preview' : 'edit',
);

// 当前编辑段落索引（用于钉住，避免滚出可视区时卸载丢失编辑内容）
const pinnedIndex = computed<number | null>(() => {
  const id = props.currentlyEditingParagraphId;
  if (!id) return null;
  const i = props.selectedChapterParagraphs.findIndex((p) => p.id === id);
  return i >= 0 ? i : null;
});

// 「编辑草稿」表（段落 id → 未保存译文）：钉住行与窗口行是不同父级，编辑中段落跨窗口边界时会
// 卸载旧实例 + 挂载新实例（Vue 不跨父级复用实例），本地编辑态随之销毁。借此在卸载前暂存草稿、
// 重挂载时恢复，满足「编辑时滚离再滚回内容保留」。切换章节时清空，避免跨章残留草稿误触恢复。
const editDraftStore = new Map<string, string>();
watch(
  () => props.selectedChapter?.id ?? null,
  () => editDraftStore.clear(),
  // post：等旧章节的卡片卸载（其 onBeforeUnmount 会写回草稿）之后再清，确保切章不残留草稿
  { flush: 'post' },
);

// 列表起点相对滚动容器顶部的偏移（头部高度）。用 sentinel 实测，随头部高度变化更新。
const scrollMargin = ref(0);
const listStartRef = ref<HTMLElement | null>(null);
const contentHeaderRef = ref<HTMLElement | null>(null);

const recomputeScrollMargin = () => {
  const sc = scrollElementRef.value;
  const sentinel = listStartRef.value;
  if (!sc || !sentinel) return;
  const scRect = sc.getBoundingClientRect();
  const sRect = sentinel.getBoundingClientRect();
  const next = Math.max(0, Math.round(sRect.top - scRect.top + sc.scrollTop));
  if (next !== scrollMargin.value) scrollMargin.value = next;
};

const {
  virtualRows,
  spacerSize,
  blockStart,
  pinnedExtra,
  measureElement,
  scrollToIndex,
  scrollToFraction,
  scrollbarModel,
  remeasure,
} = useChapterVirtualizer({
  scrollElement: scrollElementRef,
  paragraphs: paragraphsRef,
  mode: chapterListMode,
  scrollMargin,
  pinnedIndex,
  overscan: 5,
  getTranslationText: (p) => getParagraphTranslationText(p),
});

// 头部高度变化（标题换行 / 统计 / 原文链接出现消失）时重算 scrollMargin
let headerResizeObserver: ResizeObserver | null = null;
const observeHeader = () => {
  if (typeof ResizeObserver === 'undefined') return;
  headerResizeObserver?.disconnect();
  headerResizeObserver = new ResizeObserver(() => recomputeScrollMargin());
  if (contentHeaderRef.value) headerResizeObserver.observe(contentHeaderRef.value);
};

watch(contentHeaderRef, () => {
  observeHeader();
  void nextTick(recomputeScrollMargin);
});

// 切换编辑/预览模式：行高模型改变，重测并重算偏移
watch(
  () => props.editMode,
  () => {
    void nextTick(() => {
      recomputeScrollMargin();
      remeasure();
    });
  },
);

// 切换章节：滚回顶部由父级处理，这里重算偏移
watch(
  () => props.selectedChapterId,
  () => {
    void nextTick(recomputeScrollMargin);
  },
);

onMounted(() => {
  observeHeader();
  void nextTick(recomputeScrollMargin);
});

onBeforeUnmount(() => {
  headerResizeObserver?.disconnect();
  headerResizeObserver = null;
});

// 暴露给父级（BookDetailsDesktop）注册到页面上下文，供键盘导航 / 搜索按索引滚动
const scrollToParagraphIndex = (index: number, options?: VirtualScrollToOptions): void => {
  scrollToIndex(index, options);
};

defineExpose({ scrollToParagraphIndex });
</script>

<template>
  <div
    v-if="selectedChapter"
    class="chapter-content-container"
    :class="{ 'chapter-content-container--full': editMode === 'original' }"
  >
    <!-- 自定义索引驱动滚动条（Teleport 到非滚动祖先 .page-container，避免随内容滚走） -->
    <ChapterScrollbar
      v-if="editMode !== 'original'"
      :model="scrollbarModel"
      teleport-to=".page-container"
      :scroll-to-fraction="scrollToFraction"
    />

    <!-- 加载中状态 -->
    <div v-if="isLoadingChapterContent" class="loading-container">
      <ProgressSpinner style="width: 3rem; height: 3rem" stroke-width="4" animation-duration="1s" />
      <p class="loading-text">正在加载章节内容...</p>
    </div>

    <!-- 原始文本编辑模式 -->
    <div v-else-if="editMode === 'original'" class="original-text-edit-container">
      <label class="block text-sm font-medium text-moon/90">原始文本</label>
      <Textarea
        ref="originalTextareaRef"
        :value="originalTextEditValue"
        @input="handleOriginalTextInput"
        :auto-resize="false"
        class="w-full original-text-textarea"
        placeholder="输入原始文本..."
      />
      <div class="flex gap-2 justify-between items-center">
        <Button
          label="格式化"
          icon="pi pi-eraser"
          class="p-button-outlined p-button-sm"
          title="去除多余空行（可 Ctrl+Z 撤销）"
          @click="formatOriginalText"
        />
        <div class="flex gap-2">
          <Button label="取消" class="p-button-text" @click="emit('cancel-original-text-edit')" />
          <Button label="保存" @click="emit('save-original-text-edit')" />
        </div>
      </div>
    </div>

    <!-- 翻译预览模式 -->
    <div v-else-if="editMode === 'preview'" class="translation-preview-container">
      <!-- 章节标题 -->
      <div
        v-if="selectedChapterWithContent || selectedChapter"
        ref="contentHeaderRef"
        class="preview-chapter-header"
      >
        <h1 class="preview-chapter-title">
          {{
            getChapterDisplayTitle(selectedChapterWithContent || selectedChapter, book || undefined)
          }}
        </h1>
        <!-- 翻译统计 -->
        <div v-if="selectedChapterParagraphs.length > 0" class="preview-chapter-stats">
          <div class="preview-stat-item">
            <i class="pi pi-align-left preview-stat-icon"></i>
            <span class="preview-stat-value">{{ formatWordCount(translatedCharCount) }}</span>
            <span class="preview-stat-label">已翻译</span>
          </div>
        </div>
      </div>
      <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
        <div ref="listStartRef" class="vlist-spacer" :style="{ height: `${spacerSize}px` }">
          <div class="vlist-window" :style="{ transform: `translateY(${blockStart}px)` }">
            <div
              v-for="row in virtualRows"
              :key="selectedChapterParagraphs[row.index]!.id"
              :ref="measureElement"
              :data-index="row.index"
              class="translation-preview-paragraph"
              :class="{
                'untranslated-paragraph':
                  !getParagraphTranslationText(selectedChapterParagraphs[row.index]!) &&
                  selectedChapterParagraphs[row.index]!.text.trim(),
              }"
            >
              <template v-if="getParagraphTranslationText(selectedChapterParagraphs[row.index]!)">
                <p class="translation-text">
                  {{ getParagraphTranslationText(selectedChapterParagraphs[row.index]!) }}
                </p>
              </template>
              <template v-else-if="selectedChapterParagraphs[row.index]!.text.trim()">
                <div class="untranslated-content">
                  <Badge value="未翻译" severity="warning" class="untranslated-badge" />
                  <p class="original-text">
                    {{ selectedChapterParagraphs[row.index]!.text }}
                  </p>
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>
      <div v-else class="empty-chapter-content">
        <i class="pi pi-file empty-icon"></i>
        <p class="empty-text">该章节暂无内容</p>
        <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
      </div>

      <!-- 章节导航按钮（预览模式） -->
      <div class="chapter-navigation">
        <Button
          :disabled="!prevChapter"
          icon="pi pi-chevron-left"
          :label="getPrevChapterButtonLabel(prevChapter)"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-prev"
          :class="{ 'p-button-disabled': !prevChapter }"
          @click="prevChapter && emit('navigate-to-chapter', prevChapter)"
          v-tooltip.top="
            prevChapter ? getChapterDisplayTitle(prevChapter, book || undefined) : '没有上一章'
          "
        />
        <Button
          v-if="isSmallScreen"
          icon="pi pi-list"
          label="章节列表"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-list"
          @click="emit('navigate-to-chapter-list')"
          v-tooltip.top="'返回章节列表'"
        />
        <Button
          :disabled="!nextChapter"
          icon="pi pi-chevron-right"
          iconPos="right"
          :label="getNextChapterButtonLabel(nextChapter)"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-next"
          :class="{ 'p-button-disabled': !nextChapter }"
          @click="nextChapter && emit('navigate-to-chapter', nextChapter)"
          v-tooltip.top="
            nextChapter ? getChapterDisplayTitle(nextChapter, book || undefined) : '没有下一章'
          "
        />
      </div>
    </div>

    <template v-else>
      <!-- 章节标题 -->
      <div ref="contentHeaderRef" class="chapter-header">
        <div class="flex items-center gap-2">
          <h1 class="chapter-title flex-1">
            {{
              getChapterDisplayTitle(
                selectedChapterWithContent || selectedChapter,
                book || undefined,
              )
            }}
          </h1>
          <Button
            icon="pi pi-pencil"
            class="p-button-text p-button-sm p-button-rounded"
            size="small"
            title="编辑章节标题"
            @click="emit('open-edit-chapter-dialog', selectedChapter)"
          />
        </div>
        <div v-if="selectedChapterStats" class="chapter-stats">
          <div class="chapter-stat-item">
            <i class="pi pi-list chapter-stat-icon"></i>
            <span class="chapter-stat-value">{{ selectedChapterStats.paragraphCount }}</span>
            <span class="chapter-stat-label">段落</span>
          </div>
          <span class="chapter-stat-separator">|</span>
          <div class="chapter-stat-item">
            <i class="pi pi-align-left chapter-stat-icon"></i>
            <span class="chapter-stat-value">{{
              formatWordCount(selectedChapterStats.charCount)
            }}</span>
          </div>
        </div>
        <div v-if="selectedChapter.lastUpdated" class="chapter-meta">
          <i class="pi pi-clock chapter-meta-icon"></i>
          <span class="chapter-meta-text"
            >发布于: {{ new Date(selectedChapter.lastUpdated).toLocaleString('zh-CN') }}</span
          >
        </div>
        <div v-if="selectedChapter.lastEdited" class="chapter-meta">
          <i class="pi pi-clock chapter-meta-icon"></i>
          <span class="chapter-meta-text"
            >本地最后编辑: {{ new Date(selectedChapter.lastEdited).toLocaleString('zh-CN') }}</span
          >
        </div>
        <a
          v-if="selectedChapter.webUrl"
          :href="selectedChapter.webUrl"
          target="_blank"
          rel="noopener noreferrer"
          class="chapter-web-url"
        >
          <i class="pi pi-external-link"></i>
          <span>查看原文</span>
        </a>

      </div>

      <!-- 章节段落列表（虚拟滚动 · block translation） -->
      <div v-if="selectedChapterParagraphs.length > 0" class="paragraphs-container">
        <div ref="listStartRef" class="vlist-spacer" :style="{ height: `${spacerSize}px` }">
          <div class="vlist-window" :style="{ transform: `translateY(${blockStart}px)` }">
            <ChapterParagraphRow
              v-for="row in virtualRows"
              :key="selectedChapterParagraphs[row.index]!.id"
              :ref="measureElement"
              :data-index="row.index"
              :paragraph="selectedChapterParagraphs[row.index]!"
              :index="row.index"
              :is-small-screen="isSmallScreen"
              :terminologies="terminologies"
              :character-settings="characterSettings"
              :book-id="bookId"
              :chapter-id="selectedChapterId"
              :is-translating="translatingParagraphIds.has(selectedChapterParagraphs[row.index]!.id)"
              :is-polishing="polishingParagraphIds.has(selectedChapterParagraphs[row.index]!.id)"
              :is-proofreading="
                proofreadingParagraphIds.has(selectedChapterParagraphs[row.index]!.id)
              "
              :search-query="searchQuery"
              :selected="
                selectedParagraphIndex === row.index && (isKeyboardSelected || isClickSelected)
              "
              :paragraph-card-refs="paragraphCardRefs"
              :edit-draft-store="editDraftStore"
              @update-translation="
                (paragraphId: string, newTranslation: string) =>
                  emit('update-translation', paragraphId, newTranslation)
              "
              @retranslate-paragraph="(id: string) => emit('retranslate-paragraph', id)"
              @polish-paragraph="(id: string) => emit('polish-paragraph', id)"
              @proofread-paragraph="(id: string) => emit('proofread-paragraph', id)"
              @select-translation="
                (paragraphId: string, translationId: string) =>
                  emit('select-translation', paragraphId, translationId)
              "
              @paragraph-click="(id: string) => emit('paragraph-click', id)"
              @paragraph-edit-start="(id: string) => emit('paragraph-edit-start', id)"
              @paragraph-edit-stop="(id: string) => emit('paragraph-edit-stop', id)"
            />
          </div>
          <!-- 钉住：正在编辑且滚出窗口的段落，单独绝对定位渲染，避免卸载丢失未保存编辑 -->
          <div
            v-if="pinnedExtra"
            class="vlist-pinned"
            :style="{ transform: `translateY(${pinnedExtra.start}px)` }"
          >
            <ChapterParagraphRow
              :key="selectedChapterParagraphs[pinnedExtra.index]!.id"
              :ref="measureElement"
              :data-index="pinnedExtra.index"
              :paragraph="selectedChapterParagraphs[pinnedExtra.index]!"
              :index="pinnedExtra.index"
              :is-small-screen="isSmallScreen"
              :terminologies="terminologies"
              :character-settings="characterSettings"
              :book-id="bookId"
              :chapter-id="selectedChapterId"
              :is-translating="translatingParagraphIds.has(selectedChapterParagraphs[pinnedExtra.index]!.id)"
              :is-polishing="polishingParagraphIds.has(selectedChapterParagraphs[pinnedExtra.index]!.id)"
              :is-proofreading="proofreadingParagraphIds.has(selectedChapterParagraphs[pinnedExtra.index]!.id)"
              :search-query="searchQuery"
              :selected="
                selectedParagraphIndex === pinnedExtra.index &&
                (isKeyboardSelected || isClickSelected)
              "
              :paragraph-card-refs="paragraphCardRefs"
              :edit-draft-store="editDraftStore"
              @update-translation="
                (paragraphId: string, newTranslation: string) =>
                  emit('update-translation', paragraphId, newTranslation)
              "
              @retranslate-paragraph="(id: string) => emit('retranslate-paragraph', id)"
              @polish-paragraph="(id: string) => emit('polish-paragraph', id)"
              @proofread-paragraph="(id: string) => emit('proofread-paragraph', id)"
              @select-translation="
                (paragraphId: string, translationId: string) =>
                  emit('select-translation', paragraphId, translationId)
              "
              @paragraph-click="(id: string) => emit('paragraph-click', id)"
              @paragraph-edit-start="(id: string) => emit('paragraph-edit-start', id)"
              @paragraph-edit-stop="(id: string) => emit('paragraph-edit-stop', id)"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="empty-chapter-content">
        <i class="pi pi-file empty-icon"></i>
        <p class="empty-text">该章节暂无内容</p>
        <p class="empty-hint text-moon/60 text-sm">章节内容将在这里显示</p>
      </div>

      <!-- 章节导航按钮 -->
      <div class="chapter-navigation">
        <Button
          :disabled="!prevChapter"
          icon="pi pi-chevron-left"
          :label="getPrevChapterButtonLabel(prevChapter)"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-prev"
          :class="{ 'p-button-disabled': !prevChapter }"
          @click="prevChapter && emit('navigate-to-chapter', prevChapter)"
          v-tooltip.top="
            prevChapter ? getChapterDisplayTitle(prevChapter, book || undefined) : '没有上一章'
          "
        />
        <Button
          v-if="isSmallScreen"
          icon="pi pi-list"
          label="章节列表"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-list"
          @click="emit('navigate-to-chapter-list')"
          v-tooltip.top="'返回章节列表'"
        />
        <Button
          :disabled="!nextChapter"
          icon="pi pi-chevron-right"
          iconPos="right"
          :label="getNextChapterButtonLabel(nextChapter)"
          class="p-button-outlined p-button-sm chapter-nav-btn chapter-nav-next"
          :class="{ 'p-button-disabled': !nextChapter }"
          @click="nextChapter && emit('navigate-to-chapter', nextChapter)"
          v-tooltip.top="
            nextChapter ? getChapterDisplayTitle(nextChapter, book || undefined) : '没有下一章'
          "
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 章节内容容器 */
.chapter-content-container {
  width: 100%;
  min-width: 0;
  max-width: 56rem;
  margin: 0 auto;
  /*
   * 横向留 0.5rem 给段落选中高亮 ::before 的 inset:-0.5rem 溢出绘制。
   * 没有这层内边距时，当面板宽度接近 max-width 容器（如窄桌面/Electron 窗口），
   * 选中圆角高亮会被外层 .chapter-content-panel 的 overflow-x:hidden 裁掉左右两侧。
   */
  padding: 0 0.5rem;
  box-sizing: border-box;
}

/* 原始文本编辑模式：占满面板宽度/高度，方便编辑 */
.chapter-content-container--full {
  max-width: none;
  width: 100%;
  height: 100%;
  min-height: 0;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

/* 章节标题区域 */
.chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.chapter-content-container .chapter-title {
  /* 设计系统：章节标题用显示字体（Noto Serif JP）营造阅读仪式感 */
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.25;
}

.chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.75rem;
}

.chapter-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.chapter-stat-separator {
  color: var(--moon-opacity-40);
  font-size: 0.75rem;
  user-select: none;
}

.chapter-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.chapter-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.chapter-stat-label {
  color: var(--moon-opacity-70);
}

.chapter-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--moon-opacity-70);
  font-size: 0.875rem;
}

.chapter-meta-icon {
  font-size: 0.75rem;
  color: var(--moon-opacity-60);
}

.chapter-meta-text {
  color: var(--moon-opacity-70);
}

.chapter-web-url {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  padding: 0.375rem 0.75rem;
  font-size: 0.875rem;
  width: fit-content;
  color: var(--primary-opacity-90);
  text-decoration: underline;
  text-decoration-color: var(--primary-opacity-50);
  text-underline-offset: 2px;
  background: var(--primary-opacity-10);
  border: 1px solid var(--primary-opacity-30);
  border-radius: 6px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover {
  color: var(--primary-opacity-100);
  text-decoration-color: var(--primary-opacity-80);
  background: var(--primary-opacity-15);
  border-color: var(--primary-opacity-50);
  transform: translateY(-1px);
}

.chapter-web-url .pi {
  font-size: 0.75rem;
  color: var(--primary-opacity-85);
  transition: color 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.chapter-web-url:hover .pi {
  color: var(--primary-opacity-100);
}

/* 段落容器 */
.paragraphs-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* 虚拟滚动：spacer 撑出全列表高度，window 用 block translation 单一平移 */
.vlist-spacer {
  position: relative;
  width: 100%;
}

.vlist-window {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

/* 行间距：编辑/列表行的 margin-bottom 定义在 ChapterParagraphRow.vue（其根元素作用域）；
   useChapterVirtualizer 的 measureElement 会把 margin-bottom 并入测量高度，
   故 totalSize / 偏移与文档流堆叠精确一致，最后一行不会溢出 spacer 压到导航按钮。
   预览段落（.translation-preview-paragraph）已有自身 padding 间距，无需额外 margin。 */

/* 钉住（编辑中且滚出窗口）的段落：单独绝对定位在其测得偏移处 */
.vlist-pinned {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}

/* 自定义滚动条样式见 ChapterScrollbar.vue */

/* 注：带行号段落（.paragraph-with-line-number / .line-number / 选中高亮）的样式
   已随模板迁移到 ChapterParagraphRow.vue。 */

/* 原始文本编辑容器 */
.original-text-edit-container {
  padding: 1.5rem;
  background: var(--white-opacity-5);
  border: 1px solid var(--white-opacity-10);
  border-radius: 8px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.original-text-textarea {
  font-family: inherit;
  font-size: 0.9375rem;
  line-height: 1.8;
  color: var(--moon-opacity-90);
  background: var(--white-opacity-3);
  border: 1px solid var(--white-opacity-10);
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
}

.original-text-textarea:focus {
  /* 设计系统：textarea 聚焦态统一使用月白描边 + 2px 月白 alpha 柔光 */
  border-color: #e9edf5;
  box-shadow: 0 0 0 2px rgba(233, 237, 245, 0.2);
}

/* 翻译预览容器 */
.translation-preview-container {
  width: 100%;
  min-width: 0;
  max-width: 56rem;
  margin: 0 auto;
  /* 与 .chapter-content-container 对齐，切换编辑/预览模式不产生 8px 宽度跳动。 */
  padding: 0 0.5rem;
  box-sizing: border-box;
}

.preview-chapter-header {
  margin-bottom: 2rem;
  padding-bottom: 1.5rem;
  border-bottom: 1px solid var(--white-opacity-10);
}

.preview-chapter-title {
  font-family:
    'Noto Serif JP', 'Songti SC', 'STSong', 'SimSun', serif;
  font-size: 1.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--moon-opacity-95);
  margin: 0 0 0.75rem 0;
  line-height: 1.25;
}

.preview-chapter-stats {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.preview-stat-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--moon-opacity-80);
  font-size: 0.8125rem;
}

.preview-stat-icon {
  font-size: 0.75rem;
  color: var(--primary-opacity-70);
}

.preview-stat-value {
  font-weight: 600;
  color: var(--moon-opacity-90);
}

.preview-stat-label {
  color: var(--moon-opacity-70);
}

.translation-preview-paragraph {
  padding: 1rem 1.25rem;
  width: 100%;
  position: relative;
  /* 虚拟滚动已接管视口外段落的渲染，无需再用 content-visibility 占位 */
}

.translation-text {
  margin: 0;
  color: var(--moon-opacity-90);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}

.untranslated-content {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.untranslated-badge {
  align-self: flex-start;
}

.original-text {
  margin: 0;
  color: var(--moon-opacity-70);
  font-size: 0.9375rem;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
  font-style: italic;
}

.untranslated-paragraph {
  background-color: var(--moon-opacity-5);
  border-left: 3px solid var(--orange-500);
  padding-left: calc(1.25rem - 3px);
}

/* 空章节内容状态 */
.empty-chapter-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 3rem;
  color: var(--moon-opacity-40);
  margin-bottom: 1rem;
}

.empty-text {
  font-size: 1.125rem;
  font-weight: 500;
  color: var(--moon-opacity-80);
  margin: 0 0 0.5rem 0;
}

.empty-hint {
  margin: 0;
}

/* 加载中状态 */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  min-height: 30rem;
  gap: 1.5rem;
}

.loading-text {
  font-size: 1rem;
  color: var(--moon-opacity-70);
  margin: 0;
}

/* 章节导航按钮 */
.chapter-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 3rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--white-opacity-10);
}

.chapter-navigation :deep(.p-button) {
  width: 100%;
  min-width: 0;
}

.chapter-nav-btn {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  justify-content: center;
}

.chapter-nav-btn :deep(.p-button-label) {
  flex: 1 1 auto;
  min-width: 0;
  max-width: 100%;
  overflow: hidden !important;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chapter-nav-btn :deep(.p-button-icon) {
  flex: 0 0 auto;
}

.chapter-nav-prev {
  overflow: hidden;
}

.chapter-nav-prev :deep(.p-button-label) {
  text-align: center;
}

.chapter-nav-list {
  flex: 0 0 auto;
  max-width: none;
  min-width: auto;
}

.chapter-nav-next {
  overflow: hidden;
}

.chapter-nav-next :deep(.p-button-label) {
  text-align: center;
}

@media (max-width: 768px) {
  .chapter-content-container,
  .translation-preview-container {
    /*
     * 仅保留安全区补偿，避免右侧额外偏移导致导航与正文对齐线不一致。
     */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }

  .chapter-navigation {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.5rem;
    align-items: stretch;
    padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  }

  .chapter-nav-btn {
    width: 100%;
    max-width: none;
    position: relative;
    padding-left: 1.75rem !important;
    padding-right: 1.75rem !important;
  }

  .chapter-nav-btn :deep(.p-button-label) {
    display: block;
    width: 100%;
    max-width: 100% !important;
    text-align: center;
  }

  .chapter-nav-btn :deep(.p-button-icon) {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    margin: 0 !important;
  }

  .chapter-nav-prev :deep(.p-button-icon-left),
  .chapter-nav-list :deep(.p-button-icon-left) {
    left: 0.625rem;
  }

  .chapter-nav-next :deep(.p-button-icon-right) {
    right: 0.625rem;
  }
}
</style>
