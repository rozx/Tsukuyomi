import { describe, test, expect, spyOn } from 'bun:test';
import { effectScope, nextTick, ref } from 'vue';
import type { Paragraph } from 'src/models/novel';
import {
  estimateRowHeight,
  resolvePinnedExtraIndex,
  createSizeCalibrator,
  computeScrollbarMetrics,
  toContentOffset,
  computeSpacerSize,
  computeListResetKey,
  useChapterVirtualizer,
  type ChapterListMode,
} from 'src/composables/book-details/useChapterVirtualizer';

describe('estimateRowHeight', () => {
  test('空内容返回正的最小基线高度', () => {
    const empty = estimateRowHeight({ mode: 'edit' });
    expect(empty).toBeGreaterThan(0);
    const emptyStr = estimateRowHeight({ text: '', translation: '', mode: 'edit' });
    expect(emptyStr).toBe(empty);
  });

  test('随内容长度单调不减', () => {
    const short = estimateRowHeight({ text: '短句。', mode: 'preview' });
    const long = estimateRowHeight({ text: '很长很长的一段。'.repeat(40), mode: 'preview' });
    const empty = estimateRowHeight({ mode: 'preview' });
    expect(short).toBeGreaterThanOrEqual(empty);
    expect(long).toBeGreaterThan(short);
  });

  test('原文 + 译文一起计入（编辑/移动模式比仅原文更高）', () => {
    const text = '原文一段。'.repeat(10);
    const onlyText = estimateRowHeight({ text, mode: 'edit' });
    const both = estimateRowHeight({ text, translation: '译文一段。'.repeat(10), mode: 'edit' });
    expect(both).toBeGreaterThan(onlyText);
  });

  test('所有模式都返回有限正数', () => {
    for (const mode of ['edit', 'preview', 'mobile'] as const) {
      const h = estimateRowHeight({ text: '内容'.repeat(5), translation: '译文'.repeat(5), mode });
      expect(Number.isFinite(h)).toBe(true);
      expect(h).toBeGreaterThan(0);
    }
  });
});

describe('resolvePinnedExtraIndex', () => {
  test('pinnedIndex 为 null 时返回 null', () => {
    expect(resolvePinnedExtraIndex([0, 1, 2], null)).toBeNull();
  });

  test('pinnedIndex 已在窗口内时返回 null（无需单独渲染）', () => {
    expect(resolvePinnedExtraIndex([3, 4, 5, 6], 5)).toBeNull();
  });

  test('pinnedIndex 在窗口外时返回该索引（需单独钉住渲染）', () => {
    expect(resolvePinnedExtraIndex([10, 11, 12], 2)).toBe(2);
  });

  test('空窗口且有 pinnedIndex 时返回该索引', () => {
    expect(resolvePinnedExtraIndex([], 7)).toBe(7);
  });
});

describe('createSizeCalibrator', () => {
  test('无测量数据时回退到 seed', () => {
    const c = createSizeCalibrator();
    expect(c.estimate(5, () => 100)).toBe(100);
  });

  test('已测量项返回真实高度；未测量项用运行平均（消除偏差，稳住 totalSize）', () => {
    const c = createSizeCalibrator();
    c.record(0, 40);
    c.record(1, 200);
    expect(c.estimate(0, () => 999)).toBe(40); // 已测量
    expect(c.estimate(5, () => 999)).toBe(120); // 未测量 → (40+200)/2 平均，而非偏差 seed
  });

  test('重复测量同一索引覆盖旧值（不重复计入平均）', () => {
    const c = createSizeCalibrator();
    c.record(0, 100);
    c.record(0, 50); // 高度变化（如进入编辑）→ 覆盖
    c.record(1, 150);
    expect(c.estimate(9, () => 0)).toBe(100); // (50+150)/2
  });

  test('忽略非正数测量', () => {
    const c = createSizeCalibrator();
    c.record(0, 0);
    c.record(1, -5);
    expect(c.estimate(9, () => 77)).toBe(77); // 无有效数据 → seed
  });

  test('clear() 清空已测量数据，回退到 seed（章节/模式切换时复用）', () => {
    const c = createSizeCalibrator();
    c.record(0, 100);
    c.record(1, 200);
    c.clear();
    expect(c.estimate(0, () => 42)).toBe(42); // 已测量项被清空
    expect(c.estimate(5, () => 42)).toBe(42); // 运行平均被清空
    c.record(0, 80); // clear 后可重新累积
    expect(c.estimate(0, () => 0)).toBe(80);
    expect(c.estimate(9, () => 0)).toBe(80);
  });
});

describe('computeScrollbarMetrics（基于原生滚动位置/范围）', () => {
  // 签名：computeScrollbarMetrics(scrollTop, clientHeight, scrollHeight, minThumbPct?)
  test('内容不足一屏时滑块占满且不可拖动', () => {
    expect(computeScrollbarMetrics(0, 800, 800)).toEqual({ topPct: 0, heightPct: 100, draggable: false });
    expect(computeScrollbarMetrics(0, 800, 500)).toEqual({ topPct: 0, heightPct: 100, draggable: false });
  });

  test('滑块大小 = 视口/总高；位置 = 滚动进度 ×（100 − 高度）', () => {
    // clientHeight 200, scrollHeight 1000 → heightPct 20，maxScroll 800
    const top = computeScrollbarMetrics(0, 200, 1000);
    expect(top.draggable).toBe(true);
    expect(top.heightPct).toBeCloseTo(20);
    expect(top.topPct).toBeCloseTo(0);
    const mid = computeScrollbarMetrics(400, 200, 1000); // progress 0.5
    expect(mid.topPct).toBeCloseTo(0.5 * (100 - 20)); // 40
  });

  test('滚到底部时滑块贴轨道底（top + height = 100）', () => {
    const bottom = computeScrollbarMetrics(800, 200, 1000); // scrollTop = maxScroll
    expect(bottom.topPct + bottom.heightPct).toBeCloseTo(100);
  });

  test('极小滑块有最小高度，且不溢出轨道', () => {
    const m = computeScrollbarMetrics(50000, 800, 100000); // 高度比 0.8% → 钳到 5%
    expect(m.heightPct).toBeGreaterThanOrEqual(5);
    expect(m.topPct + m.heightPct).toBeLessThanOrEqual(100.0001);
  });

  test('滚动进度越界被钳制', () => {
    const over = computeScrollbarMetrics(999999, 200, 1000);
    expect(over.topPct + over.heightPct).toBeCloseTo(100);
    const under = computeScrollbarMetrics(-50, 200, 1000);
    expect(under.topPct).toBeCloseTo(0);
  });
});

describe('toContentOffset（滚动坐标 → spacer 内部坐标，扣除头部 scrollMargin）', () => {
  // @tanstack 的 item.start/end 含 scrollMargin（头部高度），但 spacer 已在文档流里位于
  // 头部之后，故落进 spacer 的偏移必须扣掉 scrollMargin，否则头部高度被重复计入 → 顶部空白。
  test('顶部首行（start == scrollMargin）落在 spacer 顶部，偏移为 0', () => {
    expect(toContentOffset(223, 223)).toBe(0);
  });

  test('滚动后保留内容相对偏移（start - scrollMargin）', () => {
    expect(toContentOffset(1000, 223)).toBe(777);
  });

  test('scrollMargin 为 0（无头部）时原样返回', () => {
    expect(toContentOffset(500, 0)).toBe(500);
  });

  test('空窗口（无 start）返回 0', () => {
    expect(toContentOffset(undefined, 223)).toBe(0);
  });

  test('测量抖动导致结果为负时钳到 0', () => {
    expect(toContentOffset(100, 223)).toBe(0);
  });
});

describe('computeSpacerSize（内容区高度；totalSize 已是内容相对，末行/钉住兜底需扣 scrollMargin）', () => {
  test('正常情况取 totalSize（getTotalSize 已扣除 scrollMargin）', () => {
    // lastEnd=1100 含 scrollMargin(100) → 内容相对 1000，与 totalSize 一致
    expect(computeSpacerSize(1000, 1100, null, 100)).toBe(1000);
  });

  test('末行欠测时用 lastEnd-scrollMargin 兜底，避免末段溢出 spacer 压到导航', () => {
    expect(computeSpacerSize(900, 1100, null, 100)).toBe(1000);
  });

  test('钉住项更靠下时用 pinnedEnd-scrollMargin 兜底', () => {
    expect(computeSpacerSize(900, 950, 1300, 100)).toBe(1200);
  });

  test('lastEnd / pinnedEnd 为 null 时不参与取最大值', () => {
    expect(computeSpacerSize(1000, null, null, 100)).toBe(1000);
  });

  test('scrollMargin 为 0 时退化为原始 max（行为不变）', () => {
    expect(computeSpacerSize(900, 1100, null, 0)).toBe(1100);
  });
});

describe('computeListResetKey（测量重置键：仅 id 序列或模式变化时才变）', () => {
  test('同 id 序列、不同数组/对象引用（翻译写入替换数组）→ 键相同', () => {
    const a = [{ id: 'p1' }, { id: 'p2' }];
    const b = [{ id: 'p1' }, { id: 'p2' }];
    expect(computeListResetKey('edit', a)).toBe(computeListResetKey('edit', b));
  });

  test('id 序列变化（增删段落 / 切章）→ 键不同', () => {
    expect(computeListResetKey('edit', [{ id: 'p1' }])).not.toBe(
      computeListResetKey('edit', [{ id: 'p1' }, { id: 'p2' }]),
    );
    expect(computeListResetKey('edit', [{ id: 'p1' }])).not.toBe(
      computeListResetKey('edit', [{ id: 'q1' }]),
    );
  });

  test('id 顺序变化 → 键不同', () => {
    expect(computeListResetKey('edit', [{ id: 'p1' }, { id: 'p2' }])).not.toBe(
      computeListResetKey('edit', [{ id: 'p2' }, { id: 'p1' }]),
    );
  });

  test('模式变化 → 键不同', () => {
    const paras = [{ id: 'p1' }];
    expect(computeListResetKey('edit', paras)).not.toBe(computeListResetKey('preview', paras));
  });

  test('id 拼接无歧义（[a,bc] vs [ab,c]）', () => {
    expect(computeListResetKey('edit', [{ id: 'a' }, { id: 'bc' }])).not.toBe(
      computeListResetKey('edit', [{ id: 'ab' }, { id: 'c' }]),
    );
  });

  test('空列表返回稳定键', () => {
    expect(computeListResetKey('mobile', [])).toBe(computeListResetKey('mobile', []));
  });
});

describe('useChapterVirtualizer：测量清空时机（重置键 = 段落 id 序列 + 模式）', () => {
  // 回归背景：整章翻译的每次 chunk 落盘 / 停止翻译后的批量保存都会整体替换
  // selectedChapterWithContent → 段落数组换新引用但 id 序列不变。旧实现按数组引用
  // watch，一律 calibrator.clear() + virtualizer.measure()，把已挂载行的真实测量
  // 全部作废；而已挂载行不会重新测量（ResizeObserver 只在尺寸变化时触发、组件不重挂载），
  // spacer 退化为纯估算高度 → 最后一段下方出现大片空白（scrollHeight >> 实际内容）。
  const makeParagraphs = (ids: string[]): Paragraph[] =>
    ids.map(
      (id) =>
        ({
          id,
          text: `原文-${id}`,
          translations: [],
          selectedTranslationId: '',
        }) as unknown as Paragraph,
    );

  const mount = (ids: string[], mode: ChapterListMode = 'edit') => {
    const scope = effectScope();
    const paragraphs = ref<Paragraph[]>(makeParagraphs(ids));
    const modeRef = ref<ChapterListMode>(mode);
    const scrollElement = ref<HTMLElement | null>(null);
    const api = scope.run(() =>
      useChapterVirtualizer({ scrollElement, paragraphs, mode: modeRef }),
    )!;
    const measureSpy = spyOn(api.virtualizer.value, 'measure');
    return { scope, paragraphs, modeRef, api, measureSpy };
  };

  test('数组引用替换但 id 序列不变（翻译写入/落盘）时不清空测量', async () => {
    const { scope, paragraphs, measureSpy } = mount(['p1', 'p2', 'p3']);
    // 模拟 updateParagraphsAndSave：新数组、新段落对象（译文更新），id 序列不变
    paragraphs.value = makeParagraphs(['p1', 'p2', 'p3']);
    await nextTick();
    expect(measureSpy).not.toHaveBeenCalled();
    scope.stop();
  });

  test('id 序列变化（切换章节 / 增删段落）时清空并重测', async () => {
    const { scope, paragraphs, measureSpy } = mount(['p1', 'p2', 'p3']);
    paragraphs.value = makeParagraphs(['q1', 'q2']);
    await nextTick();
    expect(measureSpy).toHaveBeenCalled();
    scope.stop();
  });

  test('段落顺序变化时清空并重测（偏移全部失效）', async () => {
    const { scope, paragraphs, measureSpy } = mount(['p1', 'p2', 'p3']);
    paragraphs.value = makeParagraphs(['p2', 'p1', 'p3']);
    await nextTick();
    expect(measureSpy).toHaveBeenCalled();
    scope.stop();
  });

  test('模式切换（edit↔preview）时清空并重测', async () => {
    const { scope, modeRef, measureSpy } = mount(['p1', 'p2'], 'edit');
    modeRef.value = 'preview';
    await nextTick();
    expect(measureSpy).toHaveBeenCalled();
    scope.stop();
  });
});
