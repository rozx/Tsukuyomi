import {
  computed,
  toValue,
  watch,
  type Ref,
  type ComputedRef,
  type MaybeRefOrGetter,
  type ComponentPublicInstance,
} from 'vue';
import { useVirtualizer } from '@tanstack/vue-virtual';
import type { ScrollToOptions as VirtualScrollToOptions } from '@tanstack/vue-virtual';
import type { Paragraph } from 'src/models/novel';

/**
 * 章节段落列表的三种渲染面：
 * - edit：桌面/平板编辑模式的 ParagraphCard 列表（原文 + 译文，可内联编辑）
 * - preview：桌面/平板预览模式的只读译文列表
 * - mobile：移动端 .mbr-p 只读列表（原文 + 译文）
 */
export type ChapterListMode = 'edit' | 'preview' | 'mobile';

/** 按段落索引滚动入视的函数（由 ChapterContentPanel 暴露、注册到页面上下文供导航/搜索使用） */
export type ChapterScrollToIndex = (index: number, options?: VirtualScrollToOptions) => void;

export interface EstimateRowInput {
  text?: string | undefined;
  translation?: string | undefined;
  mode: ChapterListMode;
}

// 估算用的排版常量（仅用于「尚未真实测量」的项的初始占位，TanStack 会在挂载后用 measureElement 修正）
const CHARS_PER_LINE = 34;
const LINE_HEIGHT = 29; // ≈ 1.8 行高 × 16px
const BASE_PADDING: Record<ChapterListMode, number> = {
  edit: 56,
  preview: 44,
  mobile: 40,
};

const blockLines = (value: string | undefined): number => {
  if (!value) return 0;
  const trimmed = value.trim();
  if (!trimmed) return 0;
  // 至少 1 行；按字符数粗估换行数（含显式换行）
  const explicit = trimmed.split('\n').length - 1;
  return Math.max(1, Math.ceil(trimmed.length / CHARS_PER_LINE)) + explicit;
};

/**
 * 纯函数：按段落文本/译文长度估算行高（px）。
 * 性质：返回有限正数；空内容返回模式基线；内容越长高度单调不减；
 * 编辑/移动模式同时计入原文与译文。
 */
export function estimateRowHeight(input: EstimateRowInput): number {
  const { mode } = input;
  const base = BASE_PADDING[mode];
  // preview 只显示译文（无译文时回退到原文占位）；edit / mobile 同时显示原文 + 译文
  const lines =
    mode === 'preview'
      ? blockLines(input.translation) || blockLines(input.text)
      : blockLines(input.text) + blockLines(input.translation);
  return base + lines * LINE_HEIGHT;
}

/**
 * 行高自校准器：记录每行的真实测量高度，未测量行的估算返回「已测量行的运行平均」。
 *
 * 这是滚动条不漂移的关键：固定/按文本长度的估算必然有系统偏差，拖动时随着视口外行
 * 被测量、totalSize 持续变化 → 滑块脱离光标。改用运行平均后，未测量行的估算 ≈ 真实平均，
 * 各行正负误差相互抵消，totalSize 在整段拖动中基本稳定。
 */
export interface SizeCalibrator {
  /** 清空所有已测量高度（章节切换或 preview↔edit 模式切换时调用，避免复用旧列表/旧模式的高度）。 */
  clear(): void;
  record(index: number, size: number): void;
  estimate(index: number, seed: () => number): number;
}

export function createSizeCalibrator(): SizeCalibrator {
  const sizes = new Map<number, number>();
  let avg = 0;
  let sum = 0; // 增量维护，避免每次 record 都遍历整张表（长章节满屏滚动时 O(n²)）
  return {
    clear() {
      sizes.clear();
      sum = 0;
      avg = 0;
    },
    record(index, size) {
      if (!(size > 0)) return;
      const prev = sizes.get(index);
      if (prev != null) sum -= prev; // 覆盖旧值前先扣除
      sizes.set(index, size);
      sum += size;
      avg = sum / sizes.size;
    },
    estimate(index, seed) {
      const cached = sizes.get(index);
      if (cached != null) return cached;
      return avg > 0 ? avg : seed();
    },
  };
}

export interface ScrollbarMetrics {
  topPct: number;
  heightPct: number;
  draggable: boolean;
}

/**
 * 纯函数：基于「原生滚动位置 / 范围」计算自定义滚动条滑块的位置与大小（百分比）。
 * 用原生 scrollTop/scrollHeight：滑块代表整个可滚动范围（含段落前的头部、段落后的上下章按钮），
 * 故拖到底（progress=1）能到达原生底部、露出按钮。拖动时的「光标贴合」由 ChapterScrollbar 处理，
 * 不受 scrollHeight 抖动影响。
 */
export function computeScrollbarMetrics(
  scrollTop: number,
  clientHeight: number,
  scrollHeight: number,
  minThumbPct = 5,
): ScrollbarMetrics {
  const maxScroll = scrollHeight - clientHeight;
  if (scrollHeight <= 0 || maxScroll <= 0) {
    return { topPct: 0, heightPct: 100, draggable: false };
  }
  const heightPct = Math.min(100, Math.max(minThumbPct, (clientHeight / scrollHeight) * 100));
  const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
  const topPct = progress * (100 - heightPct);
  return { topPct, heightPct, draggable: true };
}

/**
 * 纯函数：给定当前虚拟窗口内的行索引与被钉住（编辑中）的索引，
 * 返回「需要在窗口之外单独渲染」的钉住索引；若钉住项已在窗口内或无钉住，返回 null。
 */
export function resolvePinnedExtraIndex(
  windowIndices: number[],
  pinnedIndex: number | null,
): number | null {
  if (pinnedIndex === null || pinnedIndex < 0) return null;
  return windowIndices.includes(pinnedIndex) ? null : pinnedIndex;
}

export interface UseChapterVirtualizerOptions {
  /** 真实滚动容器元素（桌面 = .chapter-content-panel wrapper；移动 = .mbr-scroll） */
  scrollElement: Ref<HTMLElement | null>;
  /** 段落数组（响应式） */
  paragraphs: Ref<Paragraph[]> | ComputedRef<Paragraph[]>;
  /** 渲染面；桌面在 preview/edit 间切换，可传 ref/getter */
  mode: MaybeRefOrGetter<ChapterListMode>;
  /** 列表起点相对滚动容器顶部的偏移（头部高度 / 容器内边距），响应式 */
  scrollMargin?: Ref<number>;
  /** 当前编辑段落索引（仅 edit 模式用于钉住），响应式；移动/预览传 undefined */
  pinnedIndex?: Ref<number | null>;
  overscan?: number;
  /** 取译文文本用于估算（可选） */
  getTranslationText?: (p: Paragraph) => string | undefined;
}

export interface PinnedExtraRow {
  index: number;
  start: number;
}

/**
 * 通用章节虚拟滚动 composable，封装 @tanstack/vue-virtual。
 * 采用 block translation 布局：调用方用 blockStart 对整段窗口做单一 translateY。
 */
export function useChapterVirtualizer(opts: UseChapterVirtualizerOptions) {
  const overscan = opts.overscan ?? 5;
  const calibrator = createSizeCalibrator();

  // 未测量行：优先运行平均（自校准），尚无测量数据时回退到按文本长度的种子估算。
  const estimateSize = (index: number): number =>
    calibrator.estimate(index, () => {
      const mode = toValue(opts.mode);
      const p = opts.paragraphs.value[index];
      if (!p) return estimateRowHeight({ mode });
      return estimateRowHeight({
        text: p.text,
        translation: opts.getTranslationText?.(p),
        mode,
      });
    });

  // 自定义测量：**直接**测量元素真实边框盒（ResizeObserver entry 优先，否则 getBoundingClientRect），
  // 再加上行的 margin-bottom（行间距用 margin 实现：视觉干净、不影响选中高亮伪元素）。
  // 关键：不调用 TanStack 默认 measureElement —— 它在「无 entry」（ref 回调）路径会返回上一次缓存的尺寸
  // （已含我们加的 margin），若再加一次 margin 会每次重测都累加，导致 totalSize 无限膨胀。
  // 自己测真实盒子则每次都得到稳定值。getBoundingClientRect / borderBoxSize 均为边框盒（含 padding、不含 margin），
  // 与「窗口按文档流堆叠、margin 推进下一行」精确一致 —— 最后一行不会溢出 spacer 压到上下章按钮。
  const measureElementOption = (element: Element, entry: ResizeObserverEntry | undefined): number => {
    const borderBox = entry?.borderBoxSize?.[0];
    let size = borderBox ? Math.round(borderBox.blockSize) : element.getBoundingClientRect().height;
    if (element instanceof HTMLElement) {
      size += parseFloat(getComputedStyle(element).marginBottom) || 0;
    }
    const idx = Number(element.getAttribute('data-index'));
    if (Number.isFinite(idx)) calibrator.record(idx, size);
    return size;
  };

  const virtualizer = useVirtualizer(
    computed(() => ({
      count: opts.paragraphs.value.length,
      getScrollElement: () => opts.scrollElement.value,
      estimateSize,
      measureElement: measureElementOption,
      overscan,
      scrollMargin: opts.scrollMargin?.value ?? 0,
      getItemKey: (index: number) => opts.paragraphs.value[index]?.id ?? index,
    })),
  );

  // 章节切换（paragraphs 引用变化）或 preview↔edit 模式切换时，清空按索引缓存的测量高度并重测：
  // calibrator 按 index 长期缓存，跨章节/跨模式复用旧高度会让 estimateSize / totalSize / 滚动条
  // 先用错值再跳变。清空后重新从种子估算累积，避免「先错后跳」。
  watch(
    () => [opts.paragraphs.value, toValue(opts.mode)] as const,
    () => {
      calibrator.clear();
      virtualizer.value.measure();
    },
  );

  const virtualRows = computed(() => virtualizer.value.getVirtualItems());
  const totalSize = computed(() => virtualizer.value.getTotalSize());
  /**
   * spacer 高度：取 totalSize 与「当前已渲染最后一项的 end」「钉住项的 end」的最大值。
   * 滚到底部时 getTotalSize() 可能比最后一项的真实 end 略小（动态测量/估算偏差），
   * 若直接用 totalSize 当 spacer 高度，最后一段会溢出 spacer 压到上下章导航按钮。取 max 可兜底。
   */
  const spacerSize = computed(() => {
    const rows = virtualRows.value;
    const lastEnd = rows.length ? rows[rows.length - 1]!.end : 0;
    const pinned = opts.pinnedIndex?.value ?? null;
    const pinnedEnd =
      pinned !== null ? (virtualizer.value.measurementsCache[pinned]?.end ?? 0) : 0;
    return Math.max(totalSize.value, lastEnd, pinnedEnd);
  });
  /** 窗口块的起始偏移（首个虚拟项的 start）；空窗口时为 0 */
  const blockStart = computed(() => virtualRows.value[0]?.start ?? 0);

  /** 钉住（编辑中）且落在窗口外的行：需单独绝对定位渲染在其测得偏移处 */
  const pinnedExtra = computed<PinnedExtraRow | null>(() => {
    const pinned = opts.pinnedIndex?.value ?? null;
    const extraIndex = resolvePinnedExtraIndex(
      virtualRows.value.map((r) => r.index),
      pinned,
    );
    if (extraIndex === null) return null;
    // 钉住项的 translateY 偏移用 measurementsCache[extraIndex].start（item 的位置偏移），
    // 与 blockStart / spacerSize 的 measurementsCache 写法一致。不要用 getOffsetForIndex(...)?.[0]——
    // 它返回的是 [scrollOffset, itemOffset] 元组的 scrollOffset（建议滚动到的位置），并非 item 偏移，
    // 两者语义不同会让钉住项错位。合法索引下 measurementsCache 恒已填充，缺失时回退 0。
    const cached = virtualizer.value.measurementsCache[extraIndex];
    const start = cached?.start ?? 0;
    return { index: extraIndex, start };
  });

  // 稳定引用：作为 :ref 回调挂到每个行元素/组件（其根元素需带 data-index）。
  // 普通元素直接用；组件实例取其 $el 根元素（data-index 通过 fallthrough 落在根上）。
  const measureElement = (el: Element | ComponentPublicInstance | null): void => {
    const node =
      el instanceof Element
        ? el
        : el && el.$el instanceof Element
          ? el.$el
          : null;
    virtualizer.value.measureElement(node);
  };

  const scrollToIndex = (index: number, options?: VirtualScrollToOptions): void => {
    virtualizer.value.scrollToIndex(index, options);
  };

  const remeasure = (): void => {
    virtualizer.value.measure();
  };

  /**
   * 自定义滚动条滑块模型（基于原生滚动位置/范围）。
   * 读取 getVirtualItems() 建立对滚动/测量的响应依赖，再用滚动容器的 scrollTop/clientHeight/scrollHeight 计算。
   * 这样滑块覆盖整个滚动范围（含段落后的上下章按钮），拖到底即可露出按钮。
   */
  const scrollbarModel = computed<ScrollbarMetrics>(() => {
    void virtualizer.value.getVirtualItems(); // 触发滚动/测量时的响应式重算
    const el = opts.scrollElement.value;
    if (!el) return { topPct: 0, heightPct: 100, draggable: false };
    return computeScrollbarMetrics(el.scrollTop, el.clientHeight, el.scrollHeight);
  });

  /** 拖动/点击自定义滚动条时按比例（0..1）滚动到原生滚动范围内的位置（线性、可达顶/底）。 */
  const scrollToFraction = (fraction: number): void => {
    const el = opts.scrollElement.value;
    if (!el) return;
    const maxScroll = el.scrollHeight - el.clientHeight;
    el.scrollTop = Math.min(1, Math.max(0, fraction)) * maxScroll;
  };

  return {
    virtualizer,
    virtualRows,
    totalSize,
    spacerSize,
    blockStart,
    pinnedExtra,
    measureElement,
    scrollToIndex,
    scrollToFraction,
    scrollbarModel,
    remeasure,
  };
}
