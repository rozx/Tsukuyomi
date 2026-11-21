import { describe, expect, it } from 'vitest';
import { arrowXForAnchor, fitHeightBelowAnchor } from 'src/composables/useAnchoredPopover';

describe('fitHeightBelowAnchor', () => {
  const options = { max: 600, min: 280, chrome: 56 };

  it('空间足够时用最大高度', () => {
    expect(fitHeightBelowAnchor({ bottom: 100 }, 900, options)).toBe(600);
  });

  it('矮窗口时收缩到按钮下方的可用空间，保证弹层不被翻到上方', () => {
    // 722 - 100 - 56 = 566
    expect(fitHeightBelowAnchor({ bottom: 100 }, 722, options)).toBe(566);
  });

  it('不低于最小高度', () => {
    expect(fitHeightBelowAnchor({ bottom: 500 }, 600, options)).toBe(280);
  });
});

describe('arrowXForAnchor', () => {
  it('箭头在弹层内的横坐标对准按钮中心', () => {
    // 按钮 893–925，弹层左边 413 → 箭头中心在弹层内 909 - 413 = 496
    expect(arrowXForAnchor({ left: 893, width: 32 }, 413)).toBe(496);
  });
});
