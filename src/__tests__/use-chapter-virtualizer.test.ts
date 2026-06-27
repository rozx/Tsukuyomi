import { describe, test, expect } from 'bun:test';
import {
  estimateRowHeight,
  resolvePinnedExtraIndex,
  createSizeCalibrator,
  computeScrollbarMetrics,
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
