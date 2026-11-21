import { ref } from 'vue';

/**
 * 从按钮弹出的 PrimeVue Popover：保证弹层在按钮下方、箭头对准按钮。
 *
 * PrimeVue 的默认行为有两个问题：
 * 1. 内容比按钮下方的空间高时会翻到按钮上方；上方也放不下就被钉在窗口顶部，盖住按钮，箭头指向空处。
 * 2. 箭头贴着按钮左侧附近放置；按钮靠右、弹层被推回窗口内时会明显偏离按钮。
 *
 * 用法：Popover 加 class `anchored-popover`；打开前 `prepare(event)` 按按钮位置算出 `height`
 * （绑定到弹层内容的高度或最大高度），Popover 的 `@show` 里调用 `centerArrow()`。
 *
 * 箭头用自己的变量 `--anchored-arrow-x` 定位（全局样式见主题 CSS 的 .anchored-popover）：
 * PrimeVue 在显示后还会因 ResizeObserver 反复重算并覆盖 `--p-popover-arrow-left`，
 * 且重算发生在进入动画的缩放过程中，用它定位会偏。
 */

interface HeightOptions {
  /** 内容最大高度 */
  max: number;
  /** 内容最小高度（空间再小也不低于它，此时允许 PrimeVue 翻到上方） */
  min: number;
  /** 箭头间距 + 弹层内边距 / 边框 + 与窗口底部的留白 */
  chrome: number;
}

/** 按钮下方能放下的内容高度，限制在 [min, max] */
export function fitHeightBelowAnchor(
  anchor: Pick<DOMRect, 'bottom'>,
  viewportHeight: number,
  options: HeightOptions,
): number {
  const available = viewportHeight - anchor.bottom - options.chrome;
  return Math.max(options.min, Math.min(options.max, available));
}

/** 箭头中心在弹层内的横坐标：对准按钮中心 */
export function arrowXForAnchor(
  anchor: Pick<DOMRect, 'left' | 'width'>,
  containerLeft: number,
): number {
  return anchor.left + anchor.width / 2 - containerLeft;
}

const DEFAULT_CHROME = 56;

export function useAnchoredPopover(options: {
  /** Popover 上的唯一 class，用于在 @show 时找到弹层元素 */
  containerClass: string;
  max: number;
  min?: number;
}) {
  const height = ref(options.max);
  let anchorEl: Element | null = null;

  /** 打开前调用：记下按钮并按其位置计算高度 */
  const prepare = (event: Event) => {
    const anchor = event.currentTarget;
    if (!(anchor instanceof Element)) return;
    anchorEl = anchor;
    height.value = fitHeightBelowAnchor(anchor.getBoundingClientRect(), window.innerHeight, {
      max: options.max,
      min: options.min ?? Math.min(280, options.max),
      chrome: DEFAULT_CHROME,
    });
  };

  /**
   * Popover @show 时调用：把箭头移到按钮中心。
   * 用 offsetLeft（不受进入动画的 transform 影响）和按钮的页面坐标计算。
   */
  const centerArrow = () => {
    const container = document.querySelector<HTMLElement>(`.${options.containerClass}`);
    if (!container || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const x = arrowXForAnchor(
      { left: rect.left + window.scrollX, width: rect.width },
      container.offsetLeft,
    );
    container.style.setProperty('--anchored-arrow-x', `${x}px`);
  };

  return { height, prepare, centerArrow };
}
