import { describe, expect, it } from 'vitest';
import {
  clampPanelPosition,
  clampPanelSize,
  defaultPanelPosition,
  defaultPanelSize,
  displayPanelBox,
  PINNED_PANEL_MIN,
} from 'src/composables/task-center/pinned-panel-geometry';

const viewport = { width: 1600, height: 1000 };

describe('任务中心固定面板几何', () => {
  it('默认尺寸：宽 440，高为视口 70% 且不超过 600', () => {
    expect(defaultPanelSize(viewport)).toEqual({ width: 440, height: 600 });
    expect(defaultPanelSize({ width: 1600, height: 700 })).toEqual({ width: 440, height: 490 });
  });

  it('默认尺寸在矮窗口中不低于最小高度', () => {
    expect(defaultPanelSize({ width: 1600, height: 300 }).height).toBe(PINNED_PANEL_MIN.height);
  });

  it('默认位置贴在右上角、标题栏下方', () => {
    expect(defaultPanelPosition({ width: 440, height: 600 }, viewport)).toEqual({ x: 1144, y: 56 });
  });

  it('位置限制在视口内（留出边距）', () => {
    const size = { width: 440, height: 600 };
    expect(clampPanelPosition({ x: -50, y: -20 }, size, viewport)).toEqual({ x: 8, y: 8 });
    expect(clampPanelPosition({ x: 1500, y: 900 }, size, viewport)).toEqual({ x: 1152, y: 392 });
  });

  it('拖动缩放：不小于最小尺寸，不超出视口右边与下边', () => {
    const pos = { x: 1000, y: 100 };
    expect(clampPanelSize({ width: 100, height: 50 }, pos, viewport)).toEqual(PINNED_PANEL_MIN);
    expect(clampPanelSize({ width: 900, height: 2000 }, pos, viewport)).toEqual({
      width: 592,
      height: 892,
    });
    expect(clampPanelSize({ width: 500, height: 700 }, pos, viewport)).toEqual({
      width: 500,
      height: 700,
    });
  });

  it('窗口比保存的面板小时，显示时先收缩尺寸再把面板推回视口内', () => {
    const shown = displayPanelBox(
      { x: 900, y: 300, width: 700, height: 900 },
      { width: 1024, height: 700 },
      false,
    );
    expect(shown).toEqual({ x: 316, y: 8, width: 700, height: 684 });
  });

  it('窗口足够大时按保存的位置与尺寸显示', () => {
    const box = { x: 200, y: 80, width: 520, height: 640 };
    expect(displayPanelBox(box, viewport, false)).toEqual(box);
  });

  it('收起为迷你条时只按迷你条尺寸限制位置，可以停在窗口底部', () => {
    const shown = displayPanelBox(
      { x: 900, y: 650, width: 700, height: 900 },
      { width: 1024, height: 700 },
      true,
    );
    expect(shown).toEqual({ x: 736, y: 650, width: 700, height: 900 });
  });
});
