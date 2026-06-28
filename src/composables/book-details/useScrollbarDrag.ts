import { ref } from 'vue';

/**
 * 自定义滚动条「滑块拖动」生命周期。
 *
 * 从 ChapterScrollbar.vue 抽离，便于单元测试。核心职责：
 * - 拖动时把光标 Y 映射为 0..1 比例驱动 scrollToFraction；
 * - 滑块视觉位置（dragTopPct）直接贴合光标，与内容滚动解耦，避免抖动；
 * - **可靠地结束拖动**：除 pointerup 外，还必须处理 pointercancel 与 lostpointercapture。
 *   移动端浏览器常以 pointercancel（而非 pointerup）结束触摸手势（系统接管手势、第二根手指、
 *   地址栏收起等）。若只听 pointerup，cancel 后 dragging 永远停在 true、pointermove 监听不解绑，
 *   之后任意触摸都会触发 onMove→scrollToFraction，劫持整页滚动/点击，导致页面「点不动」。
 */
export interface ScrollbarDragOptions {
  /** 返回轨道元素，用于计算几何（getBoundingClientRect） */
  getTrack: () => HTMLElement | null;
  /** 当前滑块高度百分比（用于 min-height 修正） */
  getHeightPct: () => number;
  /** 静止时滑块顶部百分比，拖动开始时作为初值 */
  getTopPct: () => number;
  /** 按 0..1 比例滚动到原生滚动范围内的位置 */
  scrollToFraction: (fraction: number) => void;
  /** 滑块最小像素高度，必须与 CSS `.cc-scrollbar-thumb { min-height }` 一致 */
  minThumbPx: number;
  /** 监听目标，默认为 window；测试注入替身 */
  eventTarget?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

export function useScrollbarDrag(options: ScrollbarDragOptions) {
  const target: Pick<Window, 'addEventListener' | 'removeEventListener'> =
    options.eventTarget ?? window;

  const dragging = ref(false);
  const dragTopPct = ref(0);
  let grabOffset = 0;
  let capturedThumb: HTMLElement | null = null;

  const handleMove = (e: PointerEvent): void => {
    const track = options.getTrack();
    if (!dragging.value || !track) return;
    const trackRect = track.getBoundingClientRect();
    const thumbH = Math.max((options.getHeightPct() / 100) * trackRect.height, options.minThumbPx);
    const range = Math.max(1, trackRect.height - thumbH);
    const topPx = Math.min(range, Math.max(0, e.clientY - trackRect.top - grabOffset));
    // 滑块视觉位置直接跟随光标（与内容滚动解耦，避免抖动/滞后）
    dragTopPct.value = (topPx / trackRect.height) * 100;
    // 内容按比例滚动（线性映射原生范围）
    options.scrollToFraction(topPx / range);
  };

  // 幂等清理：pointerup / pointercancel / lostpointercapture 都汇聚到这里，重复调用安全。
  const stop = (): void => {
    if (!dragging.value && !capturedThumb) return;
    dragging.value = false;
    target.removeEventListener('pointermove', handleMove as EventListener);
    target.removeEventListener('pointerup', stop as EventListener);
    target.removeEventListener('pointercancel', stop as EventListener);
    if (capturedThumb) {
      capturedThumb.removeEventListener('lostpointercapture', stop as EventListener);
      capturedThumb = null;
    }
  };

  const onThumbPointerDown = (e: PointerEvent): void => {
    const thumb = e.currentTarget as HTMLElement;
    grabOffset = e.clientY - thumb.getBoundingClientRect().top;
    dragTopPct.value = options.getTopPct();
    dragging.value = true;
    capturedThumb = thumb;
    // 指针在 handler 运行时可能已失效，setPointerCapture 会抛 NotFoundError。
    // 必须吞掉：否则异常冒泡，下面的监听器挂不上、拖动态卡死无法清理。
    // 即便没拿到捕获也无妨——window 仍能收到冒泡的 pointermove/up/cancel。
    try {
      thumb.setPointerCapture?.(e.pointerId);
    } catch {
      /* 捕获失败不影响后续监听 */
    }
    target.addEventListener('pointermove', handleMove as EventListener);
    target.addEventListener('pointerup', stop as EventListener);
    // 关键：移动端常以 pointercancel 结束触摸；lostpointercapture 是「捕获释放」的兜底信号
    target.addEventListener('pointercancel', stop as EventListener);
    thumb.addEventListener('lostpointercapture', stop as EventListener);
    e.preventDefault();
    e.stopPropagation();
  };

  // handleMove 仅为单元测试暴露（组件不消费，move 由内部监听驱动）；stop 供组件 onBeforeUnmount 调用。
  return { dragging, dragTopPct, onThumbPointerDown, handleMove, stop };
}
