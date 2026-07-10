<script setup lang="ts">
import { computed, ref, watch, toRef, onMounted, onBeforeUnmount, nextTick } from 'vue';
import type { ComponentPublicInstance } from 'vue';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import Badge from 'primevue/badge';
import ProgressSpinner from 'primevue/progressspinner';
import type ParagraphCard from 'src/components/novel/ParagraphCard.vue';
import ChapterVirtualParagraphRow from 'src/components/novel/ChapterVirtualParagraphRow.vue';
import ChapterScrollbar from 'src/components/novel/ChapterScrollbar.vue';
import ChapterNavigation from 'src/components/novel/ChapterNavigation.vue';
import ChapterEmptyState from 'src/components/novel/ChapterEmptyState.vue';
import ChapterHeader from 'src/components/novel/ChapterHeader.vue';
import ChapterPreviewSection from 'src/components/novel/ChapterPreviewSection.vue';
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

// 行选中状态：把 === / && / || 包成函数，避免在模板 v-for 绑定里产生圈复杂度
const isRowSelected = (index: number) =>
  props.selectedParagraphIndex === index && (props.isKeyboardSelected || props.isClickSelected);

// 模式与派生状态：把 === / !== / || / ?. / ?? 等表达式收敛为 computed，
// 让模板里的 v-if / :class / :chapter 等绑定只剩简单标识符，降低模板圈复杂度。
const isOriginalMode = computed(() => props.editMode === 'original');
const isPreviewMode = computed(() => props.editMode === 'preview');
const showScrollbar = computed(() => props.editMode !== 'original');
// 容器 class 收敛为 computed：把 !a && !b && !c 的判定移出模板绑定，
// 降低模板圈复杂度（与本文件既有「表达式收敛为 computed」的做法一致）。
const containerClass = computed(() => ({
  'chapter-content-container--full': isOriginalMode.value,
  'chapter-content-container--reading':
    !props.isLoadingChapterContent && !isOriginalMode.value && !isPreviewMode.value,
}));
const headerChapter = computed(() => props.selectedChapterWithContent ?? props.selectedChapter ?? null);
const previewTitle = computed(() =>
  headerChapter.value ? getChapterDisplayTitle(headerChapter.value, props.book || undefined) : '',
);
const hasParagraphs = computed(() => props.selectedChapterParagraphs.length > 0);
const headerStats = computed(() => ({
  paragraphCount: selectedChapterStats.value?.paragraphCount ?? 0,
  charCount: selectedChapterStats.value?.charCount ?? 0,
}));

// 按索引取段落与翻译/润色/校对状态：避免在模板里写 .has(...!.id) 链
const paragraphAt = (index: number) => props.selectedChapterParagraphs[index]!;
const isTranslatingAt = (index: number) =>
  props.translatingParagraphIds.has(paragraphAt(index).id);
const isPolishingAt = (index: number) => props.polishingParagraphIds.has(paragraphAt(index).id);
const isProofreadingAt = (index: number) =>
  props.proofreadingParagraphIds.has(paragraphAt(index).id);

// 主列表 v-for 与钉住行共享的 props / 事件监听器：用 v-bind / v-on 展开，
// 消除两段近乎相同的冗长绑定，显著降低模板认知复杂度。
const sharedRowProps = computed(() => ({
  isSmallScreen: props.isSmallScreen,
  terminologies: props.terminologies,
  characterSettings: props.characterSettings,
  bookId: props.bookId,
  chapterId: props.selectedChapterId,
  searchQuery: props.searchQuery,
  paragraphCardRefs: props.paragraphCardRefs,
  editDraftStore,
  measureElement,
}));

const rowListeners = {
  'update-translation': (paragraphId: string, newTranslation: string) =>
    emit('update-translation', paragraphId, newTranslation),
  'retranslate-paragraph': (id: string) => emit('retranslate-paragraph', id),
  'polish-paragraph': (id: string) => emit('polish-paragraph', id),
  'proofread-paragraph': (id: string) => emit('proofread-paragraph', id),
  'select-translation': (paragraphId: string, translationId: string) =>
    emit('select-translation', paragraphId, translationId),
  'paragraph-click': (id: string) => emit('paragraph-click', id),
  'paragraph-edit-start': (id: string) => emit('paragraph-edit-start', id),
  'paragraph-edit-stop': (id: string) => emit('paragraph-edit-stop', id),
};

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

// 章节导航按钮的 label/tooltip 逻辑已迁移到 ChapterNavigation.vue


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

// 把模板 ref 回传值解包为 HTMLElement：
// 子组件用作 ref 时回传的是组件实例（ComponentPublicInstance），其 $el 才是真实 DOM；
// 直接 as HTMLElement 会让后续 getBoundingClientRect() / ResizeObserver.observe() 运行时崩。
const resolveHTMLElement = (el: Element | ComponentPublicInstance | null): HTMLElement | null => {
  if (el instanceof HTMLElement) return el;
  const root = (el as ComponentPublicInstance | null)?.$el;
  return root instanceof HTMLElement ? root : null;
};

// 子视图（预览/默认）通过回调把各自的 list 起点 / 头部元素写回父级 ref，
// 保持 scrollMargin 测量与 header ResizeObserver 行为不变。
const registerListStart = (el: Element | ComponentPublicInstance | null) => {
  listStartRef.value = resolveHTMLElement(el);
};
const registerHeader = (el: Element | ComponentPublicInstance | null) => {
  contentHeaderRef.value = resolveHTMLElement(el);
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
    :class="containerClass"
  >
    <!-- 自定义索引驱动滚动条（Teleport 到非滚动祖先 .page-container，避免随内容滚走） -->
    <ChapterScrollbar
      v-if="showScrollbar"
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
    <div v-else-if="isOriginalMode" class="original-text-edit-container">
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
    <ChapterPreviewSection
      v-else-if="isPreviewMode"
      :chapter="headerChapter"
      :title="previewTitle"
      :has-paragraphs="hasParagraphs"
      :translated-char-count="translatedCharCount"
      :paragraphs="selectedChapterParagraphs"
      :virtual-rows="virtualRows"
      :spacer-size="spacerSize"
      :block-start="blockStart"
      :get-translation-text="getParagraphTranslationText"
      :measure-element="measureElement"
      :register-list-start="registerListStart"
      :register-header="registerHeader"
      :prev-chapter="prevChapter"
      :next-chapter="nextChapter"
      :is-small-screen="isSmallScreen"
      :book="book"
      @navigate="(chapter: Chapter) => emit('navigate-to-chapter', chapter)"
      @navigate-list="emit('navigate-to-chapter-list')"
    />

    <template v-else>
      <!-- 章节标题 -->
      <div ref="contentHeaderRef">
        <ChapterHeader
          :chapter="headerChapter!"
          :book="book"
          :paragraph-count="headerStats.paragraphCount"
          :char-count="headerStats.charCount"
          @open-edit-chapter-dialog="(chapter: Chapter) => emit('open-edit-chapter-dialog', chapter)"
        />
      </div>

      <!-- 章节段落列表（虚拟滚动 · block translation） -->
      <div v-if="hasParagraphs" class="paragraphs-container">
        <div ref="listStartRef" class="vlist-spacer" :style="{ height: `${spacerSize}px` }">
          <div class="vlist-window" :style="{ transform: `translateY(${blockStart}px)` }">
            <ChapterVirtualParagraphRow
              v-for="row in virtualRows"
              :key="paragraphAt(row.index).id"
              v-bind="sharedRowProps"
              v-on="rowListeners"
              :paragraph="paragraphAt(row.index)"
              :index="row.index"
              :is-translating="isTranslatingAt(row.index)"
              :is-polishing="isPolishingAt(row.index)"
              :is-proofreading="isProofreadingAt(row.index)"
              :selected="isRowSelected(row.index)"
            />
          </div>
          <!-- 钉住：正在编辑且滚出窗口的段落，单独绝对定位渲染，避免卸载丢失未保存编辑 -->
          <div
            v-if="pinnedExtra"
            class="vlist-pinned"
            :style="{ transform: `translateY(${pinnedExtra.start}px)` }"
          >
            <ChapterVirtualParagraphRow
              :key="paragraphAt(pinnedExtra.index).id"
              v-bind="sharedRowProps"
              v-on="rowListeners"
              :paragraph="paragraphAt(pinnedExtra.index)"
              :index="pinnedExtra.index"
              :is-translating="isTranslatingAt(pinnedExtra.index)"
              :is-polishing="isPolishingAt(pinnedExtra.index)"
              :is-proofreading="isProofreadingAt(pinnedExtra.index)"
              :selected="isRowSelected(pinnedExtra.index)"
            />
          </div>
        </div>
      </div>

      <!-- 空状态 -->
      <ChapterEmptyState v-else />

      <!-- 弹性留白：内容不足一屏时占满剩余空间，把上下章导航推到面板底部。
           避免编辑段落（译文展开为 textarea + 操作行）撑高正文时导航被向下顶动；
           内容超过一屏时高度收缩为 0，导航回到正文末尾（行为不变） -->
      <div class="chapter-reading-spacer" aria-hidden="true" />

      <!-- 章节导航按钮 -->
      <ChapterNavigation
        :prev-chapter="prevChapter"
        :next-chapter="nextChapter"
        :is-small-screen="isSmallScreen"
        :book="book"
        @navigate="(chapter: Chapter) => emit('navigate-to-chapter', chapter)"
        @navigate-list="emit('navigate-to-chapter-list')"
      />
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

/* 翻译/阅读模式：撑满滚动面板高度，配合 .chapter-reading-spacer 把导航钉在底部 */
.chapter-content-container--reading {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* 弹性留白：仅在正文不足一屏时占据剩余空间，把上下章导航推到面板底部；
   正文超过一屏时收缩为 0，导航回到正文末尾并保留其自身 margin-top 间距 */
.chapter-reading-spacer {
  flex: 1 1 auto;
  min-height: 0;
}

/* 章节标题区域样式（.chapter-header / .chapter-stats / .chapter-meta / .chapter-web-url）
   已随模板迁移到 ChapterHeader.vue 自身作用域，详见该组件。 */

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

/* 翻译预览相关样式（.translation-preview-container / .preview-chapter-* / .preview-stat-* /
   .translation-preview-paragraph / .untranslated-paragraph）已随模板迁移到 ChapterPreviewSection.vue；
   段内文本（.translation-text / .untranslated-content / .untranslated-badge / .original-text）抽到共享
   preview-paragraph.css，由 ChapterPreviewSection.vue 与 PreviewParagraphItem.vue 各自引入。 */

/* 空章节内容状态（.empty-chapter-content / .empty-icon / .empty-text / .empty-hint）
   已随模板迁移到 ChapterEmptyState.vue 自身作用域。 */

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

/* 章节导航按钮相关样式（.chapter-navigation / .chapter-nav-btn / .chapter-nav-prev /
   .chapter-nav-list / .chapter-nav-next，含其 :deep(...) 与 @media 响应式规则）
   已随模板迁移到 ChapterNavigation.vue 自身作用域。 */

@media (max-width: 768px) {
  .chapter-content-container {
    /*
     * 仅保留安全区补偿，避免右侧额外偏移导致导航与正文对齐线不一致。
     */
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}
</style>
